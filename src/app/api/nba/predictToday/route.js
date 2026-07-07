import { NextResponse } from 'next/server';
import { logPredictionsToVault, getFullPlayerHistory, getLearnedAdjustments } from '../../memory/vault';
import { fetchNBA } from '../fetchNBA';
import { PrismaClient } from '@prisma/client';

// ═══ Assembly Line Station Imports ═══
import { loadNBAData } from '../../../../engines/nba/dataLoader';
import { analyzePlayerForm } from '../../../../engines/nba/formEngine';
import { analyzeMatchup } from '../../../../engines/nba/matchupEngine';
import { analyzeSpatial } from '../../../../engines/nba/spatialEngine';
import { analyzeMemory } from '../../../../engines/shared/memoryEngine';

const globalForPrisma = global;
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

function rankTeams(teamsData, statIndex, descending = false) {
  const sorted = [...teamsData].sort((a, b) => {
    return descending ? b[statIndex] - a[statIndex] : a[statIndex] - b[statIndex];
  });
  const ranks = {};
  sorted.forEach((row, i) => {
    ranks[row[1]] = i + 1; 
  });
  return ranks;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const season = searchParams.get('season') || '2025-26';
  const gameDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });

  try {
    // ═══════════════════════════════════════════════════════════════
    // STATION 1: THE DATA LOADER
    // Handles cache reads, batched API fetches, and graceful
    // degradation if the NBA Stats API rate-limits us.
    // ═══════════════════════════════════════════════════════════════
    const dataResult = await loadNBAData(season, gameDate);
    if (dataResult.cached) return NextResponse.json(dataResult.payload);
    if (dataResult.error)  return NextResponse.json(dataResult.payload);
    
    const {
      scoreboardData, teamDefenseData, playerStatsData,
      playerAdvancedData, teamGeneralData, playerIndexData,
      gameLogsData, playerShotData,
      last10StatsData, homeStatsData, roadStatsData
    } = dataResult.raw;

    const gamesRowSet = scoreboardData?.scoreboard?.games || [];
    if (!gamesRowSet || gamesRowSet.length === 0) {
      const emptyPayload = { matchups: [], players: [], message: 'No games scheduled for today.' };
      try {
        await prisma.dailyCache.upsert({
          where: { sport_gameDate: { sport: 'NBA', gameDate } },
          update: { timestamp: Date.now(), payload: emptyPayload },
          create: { sport: 'NBA', gameDate, timestamp: Date.now(), payload: emptyPayload }
        });
      } catch(e) {}
      return NextResponse.json(emptyPayload);
    }

    const todayMatchups = [];
    const playingTeamIds = new Set();
    const teamIdToOppositeName = {}; 

    const positionMap = {};
    if (playerIndexData && playerIndexData.resultSets && playerIndexData.resultSets[0].rowSet) {
       const piHeaders = playerIndexData.resultSets[0].headers;
       playerIndexData.resultSets[0].rowSet.forEach(row => {
          positionMap[String(row[piHeaders.indexOf('PERSON_ID')])] = row[piHeaders.indexOf('POSITION')];
       });
    }

    const defHeaders = teamDefenseData.resultSets[0].headers;
    const defRows = teamDefenseData.resultSets[0].rowSet;
    const teamIdToName = {};
    defRows.forEach(row => { teamIdToName[row[0]] = row[1]; });

    gamesRowSet.forEach(g => {
      const homeId = g.homeTeam.teamId;
      const awayId = g.awayTeam.teamId;
      playingTeamIds.add(String(homeId));
      playingTeamIds.add(String(awayId));
      
      const homeName = teamIdToName[homeId] || String(homeId);
      const awayName = teamIdToName[awayId] || String(awayId);
      
      teamIdToOppositeName[homeId] = awayName;
      teamIdToOppositeName[awayId] = homeName;
      
      const gameKey = `${awayName} @ ${homeName}`;
      if (!todayMatchups.some(m => `${m.away} @ ${m.home}` === gameKey)) {
        todayMatchups.push({ home: homeName, away: awayName });
      }
    });

    const h2hResults = [];
    const h2hMapping = [];
    
    // Batch H2H fetches sequentially in chunks of 2 with delays to avoid NBA API Rate Limits hanging the server
    for (const g of gamesRowSet) {
        const hId = String(g.homeTeam.teamId);
        const aId = String(g.awayTeam.teamId);
        
        try {
            const [hRes, aRes] = await Promise.all([
                fetchNBA('leaguedashplayerstats', { MeasureType: 'Base', PerMode: 'PerGame', Season: season, SeasonType: 'Regular Season', LeagueID: '00', LastNGames: '0', Month: '0', OpponentTeamID: hId, PORound: '0', PaceAdjust: 'N', Period: '0', PlusMinus: 'N', Rank: 'N' }).catch(() => null),
                fetchNBA('leaguedashplayerstats', { MeasureType: 'Base', PerMode: 'PerGame', Season: season, SeasonType: 'Regular Season', LeagueID: '00', LastNGames: '0', Month: '0', OpponentTeamID: aId, PORound: '0', PaceAdjust: 'N', Period: '0', PlusMinus: 'N', Rank: 'N' }).catch(() => null)
            ]);
            
            h2hResults.push(hRes);
            h2hMapping.push(hId);
            
            h2hResults.push(aRes);
            h2hMapping.push(aId);
            
            // 300ms delay between games
            await new Promise(r => setTimeout(r, 300));
        } catch (e) {
            console.error(e);
        }
    }

    const h2hPlayerStatsMap = {};
    h2hResults.forEach((res, i) => {
        const oppId = h2hMapping[i];
        if (res && res.resultSets && res.resultSets[0].rowSet) {
            const h2hHeaders = res.resultSets[0].headers;
            res.resultSets[0].rowSet.forEach(row => {
                const pid = String(row[h2hHeaders.indexOf('PLAYER_ID')]);
                if (!h2hPlayerStatsMap[pid]) h2hPlayerStatsMap[pid] = {};
                h2hPlayerStatsMap[pid][oppId] = {
                    'PTS': row[h2hHeaders.indexOf('PTS')],
                    'REB': row[h2hHeaders.indexOf('REB')],
                    'AST': row[h2hHeaders.indexOf('AST')],
                    'STL': row[h2hHeaders.indexOf('STL')],
                    'BLK': row[h2hHeaders.indexOf('BLK')],
                    '3PM': row[h2hHeaders.indexOf('FG3M')],
                    'TOV': row[h2hHeaders.indexOf('TOV')]
                };
            });
        }
    });

    const buildStatsMap = (data) => {
       const map = {};
       if (data && data.resultSets && data.resultSets[0].rowSet) {
          const headers = data.resultSets[0].headers;
          data.resultSets[0].rowSet.forEach(row => {
             map[String(row[headers.indexOf('PLAYER_ID')])] = {
                'PTS': row[headers.indexOf('PTS')],
                'REB': row[headers.indexOf('REB')],
                'AST': row[headers.indexOf('AST')],
                'STL': row[headers.indexOf('STL')],
                'BLK': row[headers.indexOf('BLK')],
                '3PM': row[headers.indexOf('FG3M')],
                'TOV': row[headers.indexOf('TOV')]
             };
          });
       }
       return map;
    };
    
    const last10Map = buildStatsMap(last10StatsData);
    const homeMap = buildStatsMap(homeStatsData);
    const roadMap = buildStatsMap(roadStatsData);

    const rankMaps = {
       'PTS': rankTeams(defRows, defHeaders.indexOf('OPP_PTS'), true),
       'REB': rankTeams(defRows, defHeaders.indexOf('OPP_REB'), true),
       'AST': rankTeams(defRows, defHeaders.indexOf('OPP_AST'), true),
       'STL': rankTeams(defRows, defHeaders.indexOf('OPP_STL'), true),
       'BLK': rankTeams(defRows, defHeaders.indexOf('OPP_BLK'), true),
       '3PM': rankTeams(defRows, defHeaders.indexOf('OPP_FG3M'), true),
       'TOV': rankTeams(defRows, defHeaders.indexOf('OPP_TOV'), true)
    };

    const advancedMap = {};
    if (playerAdvancedData && playerAdvancedData.resultSets && playerAdvancedData.resultSets[0].rowSet) {
       const advHeaders = playerAdvancedData.resultSets[0].headers;
       playerAdvancedData.resultSets[0].rowSet.forEach(row => {
          advancedMap[String(row[advHeaders.indexOf('PLAYER_ID')])] = {
             USG_PCT: row[advHeaders.indexOf('USG_PCT')],
             TS_PCT: row[advHeaders.indexOf('TS_PCT')],
             PIE: row[advHeaders.indexOf('PIE')],
             PACE: row[advHeaders.indexOf('PACE')]
          };
       });
    }

    const teamPaceMap = {};
    const leagueAvgPace = 100; // NBA league average pace ~100 possessions
    if (teamGeneralData && teamGeneralData.resultSets && teamGeneralData.resultSets[0].rowSet) {
       const tgHeaders = teamGeneralData.resultSets[0].headers;
       const paceIdx = tgHeaders.indexOf('PACE');
       if (paceIdx !== -1) {
          teamGeneralData.resultSets[0].rowSet.forEach(row => {
             teamPaceMap[row[tgHeaders.indexOf('TEAM_NAME')]] = row[paceIdx];
          });
       }
    }

    const autopsyHistory = await getFullPlayerHistory();
    const learnedAdj = await getLearnedAdjustments('NBA');
    const scoutingNotes = await getScoutingNotes('NBA');

    const playerLogsMap = {};
    if (gameLogsData && gameLogsData.resultSets && gameLogsData.resultSets[0].rowSet) {
        const glHeaders = gameLogsData.resultSets[0].headers;
        const glRows = gameLogsData.resultSets[0].rowSet;
        const pidIdx = glHeaders.indexOf('PLAYER_ID');
        glRows.forEach(r => {
            const pId = String(r[pidIdx]);
            if (!playingTeamIds.has(String(r[glHeaders.indexOf('TEAM_ID')]))) return; 
            if (!playerLogsMap[pId]) playerLogsMap[pId] = [];
            playerLogsMap[pId].push({
                PTS: r[glHeaders.indexOf('PTS')],
                REB: r[glHeaders.indexOf('REB')],
                AST: r[glHeaders.indexOf('AST')],
                STL: r[glHeaders.indexOf('STL')],
                BLK: r[glHeaders.indexOf('BLK')],
                '3PM': r[glHeaders.indexOf('FG3M')],
                'TOV': r[glHeaders.indexOf('TOV')],
                GAME_DATE: r[glHeaders.indexOf('GAME_DATE')],
            });
        });
    }

    const playerShotMap = {};
    const ZONE_NAMES = [
      "Restricted Area", "In The Paint (Non-RA)", "Mid-Range", 
      "Left Corner 3", "Right Corner 3", "Above the Break 3", "Backcourt"
    ];
    if (playerShotData && playerShotData.resultSets && playerShotData.resultSets.rowSet) {
        const pRows = playerShotData.resultSets.rowSet;
        pRows.forEach(r => {
            const pId = String(r[0]); 
            if (!playerLogsMap[pId]) return; 
            let bestZone = "";
            let maxFGA = -1;
            let zoneIndexOffset = 6; 
            ZONE_NAMES.forEach((zone, idx) => {
                const fgaCol = zoneIndexOffset + (idx * 3) + 1;
                const fga = r[fgaCol] || 0;
                if (fga > maxFGA) { maxFGA = fga; bestZone = zone; }
            });
            playerShotMap[pId] = { bestZone, maxFGA };
        });
    }

    const pHeaders = playerStatsData.resultSets[0].headers;
    const pRowsRaw = playerStatsData.resultSets[0].rowSet;
    
    const teamNameToAbbr = {};
    pRowsRaw.forEach(r => {
       const tId = r[pHeaders.indexOf('TEAM_ID')];
       const tName = teamIdToName[tId];
       const tAbbr = r[pHeaders.indexOf('TEAM_ABBREVIATION')];
       if (tName) teamNameToAbbr[tName] = tAbbr;
    });

    const recentPlayerIds = new Set();
    if (gameLogsData?.resultSets?.[0]) {
       const glHeaders = gameLogsData.resultSets[0].headers;
       const glRows = gameLogsData.resultSets[0].rowSet;
       const glPlayerIdx = glHeaders.indexOf('PLAYER_ID');
       const glDateIdx = glHeaders.indexOf('GAME_DATE');
       const cutoffDate = new Date();
       cutoffDate.setDate(cutoffDate.getDate() - 21);
       glRows.forEach(row => {
          const gameDate2 = new Date(row[glDateIdx]);
          if (gameDate2 >= cutoffDate) {
             recentPlayerIds.add(String(row[glPlayerIdx]));
          }
       });
    }

    const pRows = pRowsRaw.filter(r => 
       playingTeamIds.has(String(r[pHeaders.indexOf('TEAM_ID')])) && 
       r[pHeaders.indexOf('MIN')] > 0 &&
       (recentPlayerIds.size === 0 || recentPlayerIds.has(String(r[pHeaders.indexOf('PLAYER_ID')])))
    );

    const playerPredictions = [];

    pRows.forEach(player => {
       const playerName = player[pHeaders.indexOf('PLAYER_NAME')];
       const playerId = String(player[pHeaders.indexOf('PLAYER_ID')]);
       const teamId = player[pHeaders.indexOf('TEAM_ID')];
       const teamAbbr = player[pHeaders.indexOf('TEAM_ABBREVIATION')];
       const oppName = teamIdToOppositeName[teamId];
       const opponentAbbr = teamNameToAbbr[oppName] || oppName.substring(0, 3).toUpperCase();
       
       let opponentIdMatch = "0";
       gamesRowSet.forEach(g => {
          if (String(g.homeTeam.teamId) === String(teamId)) opponentIdMatch = String(g.awayTeam.teamId);
          if (String(g.awayTeam.teamId) === String(teamId)) opponentIdMatch = String(g.homeTeam.teamId);
       });

       const stats = {
         'PTS': player[pHeaders.indexOf('PTS')],
         'REB': player[pHeaders.indexOf('REB')],
         'AST': player[pHeaders.indexOf('AST')],
         'STL': player[pHeaders.indexOf('STL')],
         'BLK': player[pHeaders.indexOf('BLK')],
         '3PM': player[pHeaders.indexOf('FG3M')],
         'TOV': player[pHeaders.indexOf('TOV')]
       };
       
       const praAvg = (parseFloat(stats['PTS']) || 0) + (parseFloat(stats['REB']) || 0) + (parseFloat(stats['AST']) || 0);
       stats['PRA'] = praAvg;

       const isHomePlayer = todayMatchups.some(m => m.home === (teamIdToName[teamId] || teamId));
       const logs = playerLogsMap[playerId] || [];
       const hotZone = playerShotMap[playerId]?.bestZone || 'Unknown';

       const advStats = advancedMap[playerId];
       const playerTeamName = teamIdToName[teamId];
       const playerTeamPace = teamPaceMap[playerTeamName] || leagueAvgPace;
       const opponentPace = teamPaceMap[oppName] || leagueAvgPace;
       
       const h2hStats = h2hPlayerStatsMap[playerId]?.[opponentIdMatch];
       const last10Stats = last10Map[playerId];
       const splitStats = isHomePlayer ? homeMap[playerId] : roadMap[playerId];

       const statEvaluations = [];

       ['PTS', 'REB', 'AST', 'STL', 'BLK', '3PM', 'TOV', 'PRA'].forEach(statCat => {
        const avg = stats[statCat];

        // ─── STATION 3: MATCHUP ENGINE ─────────────────────────
        const matchupResult = analyzeMatchup(
          statCat, oppName, rankMaps, isHomePlayer, playerTeamName,
          advStats, playerTeamPace, opponentPace, leagueAvgPace
        );

        if (!matchupResult.defensiveRank) return;

        let call  = matchupResult.initialCall;
        let color = matchupResult.initialColor;
        let confidenceScore = 50 + matchupResult.initialConfidenceAdj;

        // ─── STATION 2: FORM ENGINE ────────────────────────────
        const formResult = analyzePlayerForm(
          statCat, call, logs, avg, h2hStats, splitStats,
          last10Stats, isHomePlayer, opponentAbbr
        );

        confidenceScore += formResult.confidenceScoreAdjustment;
        call = formResult.call;

        // ─── PROJECTION ASSEMBLY ───────────────────────────────
        let projectedTarget = formResult.baseProjection
          * matchupResult.matchupModifier
          * formResult.restModifier
          * formResult.trendModifier
          * matchupResult.usageModifier
          * matchupResult.paceEffect
          * matchupResult.travelModifier;

        const confidenceScale = 1.0 + ((confidenceScore - 50) / 500);
        projectedTarget *= confidenceScale;

        // ─── LEARNED ADJUSTMENTS (inline — from the Brain) ─────
        let learnedModifier = 0;
        let learnedText = '';

        if (learnedAdj[`overall_${statCat}`]) learnedModifier += learnedAdj[`overall_${statCat}`];

        const locBucket = isHomePlayer ? `home_${statCat}` : `away_${statCat}`;
        if (learnedAdj[locBucket]) learnedModifier += learnedAdj[locBucket];

        if (learnedAdj[`vs_${opponentAbbr}_${statCat}`]) {
          learnedModifier += learnedAdj[`vs_${opponentAbbr}_${statCat}`];
        }

        const callBucket = `${call.includes('OVER') ? 'over' : 'under'}_${statCat}`;
        if (learnedAdj[callBucket]) learnedModifier += learnedAdj[callBucket];

        if (formResult.restDays === 0 && learnedAdj[`b2b_${statCat}`]) learnedModifier += learnedAdj[`b2b_${statCat}`];
        if (matchupResult.travelModifier < 1.0 && learnedAdj[`travel_${statCat}`]) learnedModifier += learnedAdj[`travel_${statCat}`];
        if (formResult.restDays >= 4 && learnedAdj[`layoff_${statCat}`]) learnedModifier += learnedAdj[`layoff_${statCat}`];

        learnedModifier = Math.max(-0.12, Math.min(0.12, learnedModifier));
        if (Math.abs(learnedModifier) > 0.005) {
          projectedTarget *= (1 + learnedModifier);
          learnedText = ` 🧠 Brain Adj: ${learnedModifier > 0 ? '+' : ''}${(learnedModifier * 100).toFixed(1)}%`;
        }

        projectedTarget = Math.max(0, +(projectedTarget.toFixed(1)));

        // ─── STATION 4: SPATIAL ENGINE ─────────────────────────
        const spatialResult = analyzeSpatial(statCat, call, hotZone);
        confidenceScore += spatialResult.confidenceAdj;

        // ─── STATION 5: MEMORY ENGINE ──────────────────────────
        const callBeforeMemory = call;
        const pHistory = autopsyHistory[playerId]?.[statCat];
        const pNotes = scoutingNotes[playerId]?.[statCat];
        const memoryResult = analyzeMemory(
          call, statCat, pHistory, pNotes, isHomePlayer,
          opponentAbbr, matchupResult.defensiveRank, projectedTarget
        );

        confidenceScore += memoryResult.confidenceAdj;
        call = memoryResult.call;

        if (call !== callBeforeMemory) {
          color = call.includes('OVER') ? '#4ade80' : '#f87171';
        }

        // ─── OUTPUT ────────────────────────────────────────────
        statEvaluations.push({
          category: statCat,
          avg: stats[statCat],
          projectedTarget,
          call,
          color,
          rank: matchupResult.defensiveRank,
          confidence: confidenceScore,
          oppDesc: `Opp Rank: ${matchupResult.defensiveRank}/30${formResult.restText}${matchupResult.travelText}`,
          streakDesc: formResult.streakText,
          spatialDesc: spatialResult.spatialText,
          memoryDesc: memoryResult.memoryText,
          historicalAccuracy: memoryResult.numAccuracy,
          totalGames: memoryResult.totalGames
        });
      });

      playerPredictions.push({
        player: playerName,
        playerId,
        position: positionMap[playerId] || 'STARTER',
        team: teamAbbr,
        opponent: oppName,
        opponentAbbr,
        opponentId: opponentIdMatch,
        isHome: isHomePlayer,
        evaluations: statEvaluations
      });
    });

    playerPredictions.sort((a, b) => {
       const aStrong = a.evaluations.filter(e => e.call.includes('STRONG')).length;
       const bStrong = b.evaluations.filter(e => e.call.includes('STRONG')).length;
       return bStrong - aStrong;
    });

    logPredictionsToVault('NBA', playerPredictions, gameDate).catch(console.error);

    const payload = {
       matchups: todayMatchups,
       players: playerPredictions
    };

    try {
       await prisma.dailyCache.upsert({
          where: { sport_gameDate: { sport: 'NBA', gameDate } },
          update: { timestamp: Date.now(), payload: payload },
          create: { sport: 'NBA', gameDate, timestamp: Date.now(), payload: payload }
       });
    } catch (e) {
       console.error('Failed to write cache', e);
    }

    return NextResponse.json(payload);

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}