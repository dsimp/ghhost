import { NextResponse } from 'next/server';
import { logPredictionsToVault, getFullPlayerHistory } from '../../memory/vault';
import { fetchNBA } from '../fetchNBA';

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
  
  const dateObj = new Date();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  const year = dateObj.getFullYear();
  const gameDate = `${year}-${month}-${day}`; 

  const CACHE_PATH = require('path').join(process.cwd(), 'src', 'data', 'ghhost_daily_cache.json');
  try {
     const cacheFile = await require('fs').promises.readFile(CACHE_PATH, 'utf-8').catch(() => null);
     if (cacheFile) {
        const parsed = JSON.parse(cacheFile);
        const now = Date.now();
        // Return cache if it's for today and less than 1 hour old (3600000 ms)
        if (parsed.gameDate === gameDate && (now - parsed.timestamp) < 3600000) {
            return NextResponse.json(parsed.data);
        }
     }
  } catch (e) {
     // Ignore cache read errors
  }

  try {
    // Batch 1
    const [scoreboardData, teamDefenseData, playerStatsData] = await Promise.all([
      fetchNBA('scoreboardv3', { GameDate: gameDate, LeagueID: '00' }).catch(() => null),
      fetchNBA('leaguedashteamstats', { MeasureType: 'Opponent', PerMode: 'PerGame', Season: season, SeasonType: 'Regular Season', LeagueID: '00', LastNGames: '0', Month: '0', OpponentTeamID: '0', PORound: '0', PaceAdjust: 'N', Period: '0', PlusMinus: 'N', Rank: 'N' }).catch(() => null),
      fetchNBA('leaguedashplayerstats', { MeasureType: 'Base', PerMode: 'PerGame', Season: season, SeasonType: 'Regular Season', LeagueID: '00', LastNGames: '0', Month: '0', OpponentTeamID: '0', PORound: '0', PaceAdjust: 'N', Period: '0', PlusMinus: 'N', Rank: 'N' }).catch(() => null)
    ]);
    
    // Graceful Failure if NBA API blocked us
    if (!scoreboardData || !teamDefenseData || !playerStatsData) {
      const errorPayload = { matchups: [], players: [], message: 'NBA Stats API is temporarily rate-limiting our servers. The engine will retry automatically soon. Please check back later.' };
      try { await require('fs').promises.writeFile(CACHE_PATH, JSON.stringify({ gameDate, timestamp: Date.now(), data: errorPayload }, null, 2), 'utf-8'); } catch(e) {}
      return NextResponse.json(errorPayload);
    }
    await new Promise(r => setTimeout(r, 200));

    // Batch 2
    const [gameLogsData, playerShotData, teamShotData] = await Promise.all([
      fetchNBA('leaguegamelog', { Counter: '1000', Direction: 'DESC', LeagueID: '00', PlayerOrTeam: 'P', Season: season, SeasonType: 'Regular Season', Sorter: 'DATE' }).catch(() => null),
      fetchNBA('leaguedashplayershotlocations', { DistanceRange: 'By Zone', LastNGames: '0', LeagueID: '00', MeasureType: 'Base', Month: '0', OpponentTeamID: '0', Outcome: '', PORound: '0', PaceAdjust: 'N', PerMode: 'PerGame', Period: '0', PlayerExperience: '', PlayerPosition: '', PlusMinus: 'N', Rank: 'N', Season: season, SeasonSegment: '', SeasonType: 'Regular Season', ShotClockRange: '', StarterBench: '', TeamID: '0', VsConference: '', VsDivision: '' }).catch(() => null),
      fetchNBA('leaguedashteamshotlocations', { DistanceRange: 'By Zone', LastNGames: '0', LeagueID: '00', MeasureType: 'Base', Month: '0', OpponentTeamID: '0', Outcome: '', PORound: '0', PaceAdjust: 'N', PerMode: 'PerGame', Period: '0', PlayerExperience: '', PlayerPosition: '', PlusMinus: 'N', Rank: 'N', Season: season, SeasonSegment: '', SeasonType: 'Regular Season', ShotClockRange: '', StarterBench: '', TeamID: '0', VsConference: '', VsDivision: '' }).catch(() => null)
    ]);
    await new Promise(r => setTimeout(r, 200));

    // Batch 3
    const [last5StatsData, homeStatsData, roadStatsData] = await Promise.all([
      fetchNBA('leaguedashplayerstats', { MeasureType: 'Base', PerMode: 'PerGame', Season: season, SeasonType: 'Regular Season', LeagueID: '00', LastNGames: '5', Month: '0', OpponentTeamID: '0', PORound: '0', PaceAdjust: 'N', Period: '0', PlusMinus: 'N', Rank: 'N' }).catch(() => null),
      fetchNBA('leaguedashplayerstats', { MeasureType: 'Base', PerMode: 'PerGame', Season: season, SeasonType: 'Regular Season', LeagueID: '00', LastNGames: '0', Location: 'Home', Month: '0', OpponentTeamID: '0', PORound: '0', PaceAdjust: 'N', Period: '0', PlusMinus: 'N', Rank: 'N' }).catch(() => null),
      fetchNBA('leaguedashplayerstats', { MeasureType: 'Base', PerMode: 'PerGame', Season: season, SeasonType: 'Regular Season', LeagueID: '00', LastNGames: '0', Location: 'Road', Month: '0', OpponentTeamID: '0', PORound: '0', PaceAdjust: 'N', Period: '0', PlusMinus: 'N', Rank: 'N' }).catch(() => null)
    ]);
    
    const gamesRowSet = scoreboardData?.scoreboard?.games || [];
    if (!gamesRowSet || gamesRowSet.length === 0) {
      const emptyPayload = { matchups: [], players: [], message: 'No games scheduled for today.' };
      try { await require('fs').promises.writeFile(CACHE_PATH, JSON.stringify({ gameDate, timestamp: Date.now(), data: emptyPayload }, null, 2), 'utf-8'); } catch(e) {}
      return NextResponse.json(emptyPayload);
    }

    const todayMatchups = [];
    const playingTeamIds = new Set();
    const teamIdToOppositeName = {}; 

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
                    '3PM': row[h2hHeaders.indexOf('FG3M')]
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
                '3PM': row[headers.indexOf('FG3M')]
             };
          });
       }
       return map;
    };
    
    const last5Map = buildStatsMap(last5StatsData);
    const homeMap = buildStatsMap(homeStatsData);
    const roadMap = buildStatsMap(roadStatsData);

    const rankMaps = {
       'PTS': rankTeams(defRows, defHeaders.indexOf('OPP_PTS'), true),
       'REB': rankTeams(defRows, defHeaders.indexOf('OPP_REB'), true),
       'AST': rankTeams(defRows, defHeaders.indexOf('OPP_AST'), true),
       'STL': rankTeams(defRows, defHeaders.indexOf('OPP_STL'), true),
       'BLK': rankTeams(defRows, defHeaders.indexOf('OPP_BLK'), true),
       'TOV': rankTeams(defRows, defHeaders.indexOf('OPP_TOV'), true), 
       '3PM': rankTeams(defRows, defHeaders.indexOf('OPP_FG3M'), true)
    };

    // Fetch the Vault's Historical Memory
    const autopsyHistory = await getFullPlayerHistory();

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

    const pRows = pRowsRaw.filter(r => playingTeamIds.has(String(r[pHeaders.indexOf('TEAM_ID')])) && r[pHeaders.indexOf('MIN')] > 22);

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
         '3PM': player[pHeaders.indexOf('FG3M')]
       };
       
       const isHomePlayer = todayMatchups.some(m => m.home === (teamIdToName[teamId] || teamId));
       const logs = playerLogsMap[playerId] || [];
       const hotZone = playerShotMap[playerId]?.bestZone || 'Unknown';


           const h2hStats = h2hPlayerStatsMap[playerId]?.[opponentIdMatch];
           const last5Stats = last5Map[playerId];
           const splitStats = isHomePlayer ? homeMap[playerId] : roadMap[playerId];

       const statEvaluations = [];

       ['PTS', 'REB', 'AST', 'STL', 'BLK', '3PM'].forEach(statCat => {
          const defensiveRank = rankMaps[statCat][oppName]; 
          if (!defensiveRank) return;

          const avg = stats[statCat];
          let call = defensiveRank <= 15 ? 'OVER' : 'UNDER';
          let color = '#a1a1aa';
          
          let confidenceScore = 50; 

          if (defensiveRank <= 5) { call = 'STRONG OVER'; color = '#22c55e'; confidenceScore += 15; }
          else if (defensiveRank <= 10) { color = '#4ade80'; confidenceScore += 5; }
          else if (defensiveRank >= 26) { call = 'STRONG UNDER'; color = '#ef4444'; confidenceScore += 15; }
          else if (defensiveRank >= 20) { color = '#f87171'; confidenceScore += 5; }

          let streakText = "";
          let restDays = null;
          let restText = "";
          
          if (logs.length > 0) {
             // Calculate Rest Days from last game
             const lastGameDate = new Date(logs[0].GAME_DATE);
             const today = new Date();
             restDays = Math.floor((today - lastGameDate) / (1000 * 60 * 60 * 24));
             
             if (restDays === 0) {
                confidenceScore -= 10;
                restText = " (Back-to-Back Fatigue)";
             } else if (restDays >= 4) {
                confidenceScore -= 5; // Layoff rust
                restText = ` (${restDays} Day Layoff Rust)`;
             }

             const recent = logs.slice(0, 10);
             let overCount = 0;
             let underCount = 0;
             recent.forEach(log => {
                if (log[statCat] > avg) overCount++;
                else if (log[statCat] < avg) underCount++;
             });
             
             // Advanced Regression Mechanics (The Gambler's Fallacy correction)
             if (call.includes('OVER') && overCount >= 8) {
                 // Due for regression. The player has exceeded their average in 8 of the last 10 games.
                 confidenceScore -= 20; 
                 call = 'UNDER'; // The engine predicts regression
                 color = '#f87171';
                 streakText = `👻 Ghhost Prediction: Regression Expected (Reverting after ${overCount} Overs)`;
             } else if (call.includes('UNDER') && underCount >= 8) {
                 // Due for positive regression
                 confidenceScore -= 20;
                 call = 'OVER';
                 color = '#4ade80';
                 streakText = `👻 Ghhost Prediction: Breakout Expected (Positive regression)`;
             } else if (call.includes('OVER') && overCount >= 6) {
                 confidenceScore += (overCount - 5) * 4;
                 streakText = `🔥 Hot: Over in ${overCount} of last ${recent.length}`;
             } else if (call.includes('UNDER') && underCount >= 6) {
                 confidenceScore += (underCount - 5) * 4;
                 streakText = `🧊 Cold: Under in ${underCount} of last ${recent.length}`;
             } else if (call.includes('OVER') && underCount >= 6) {
                 confidenceScore -= 15;
                 streakText = `⚠️ Cold Trend: Under in ${underCount} of last ${recent.length}`;
             } else if (call.includes('UNDER') && overCount >= 6) {
                 confidenceScore -= 15;
                 streakText = `⚠️ Hot Trend: Over in ${overCount} of last ${recent.length}`;
             }
          }


           if (h2hStats) {
               const h2hAvg = h2hStats[statCat];
               if (call.includes('OVER') && h2hAvg < avg * 0.8) {
                   confidenceScore -= 15;
                   streakText += ` ⚠️ Struggles vs ${opponentAbbr} (${h2hAvg} avg).`;
               } else if (call.includes('OVER') && h2hAvg > avg * 1.2) {
                   confidenceScore += 10;
                   streakText += ` 🔥 Dominates ${opponentAbbr} (${h2hAvg} avg).`;
               } else if (call.includes('UNDER') && h2hAvg > avg * 1.2) {
                   confidenceScore -= 15;
                   streakText += ` ⚠️ Usually dominates ${opponentAbbr} (${h2hAvg} avg).`;
               }
           }

           if (splitStats) {
               const splitAvg = splitStats[statCat];
               const loc = isHomePlayer ? 'Home' : 'Road';
               if (call.includes('OVER') && splitAvg < avg * 0.8) {
                   confidenceScore -= 10;
                   streakText += ` ⚠️ Poor ${loc} split (${splitAvg} avg).`;
               } else if (call.includes('OVER') && splitAvg > avg * 1.2) {
                   confidenceScore += 10;
                   streakText += ` 🔥 Strong ${loc} split (${splitAvg} avg).`;
               }
           }

           if (last5Stats) {
               const last5Avg = last5Stats[statCat];
               if (call.includes('OVER') && last5Avg > avg * 1.2) {
                   confidenceScore += 10;
                   streakText += ` 📈 High Frequency: Averaging ${last5Avg} L5.`;
               } else if (call.includes('UNDER') && last5Avg < avg * 0.8) {
                   confidenceScore += 10;
                   streakText += ` 📉 Cold Frequency: Averaging ${last5Avg} L5.`;
               }
           }
           
           streakText = streakText.trim();
           if (confidenceScore < 60) call = call.replace('STRONG ', '');

          if (confidenceScore > 99) confidenceScore = 99;
          if (confidenceScore < 1) confidenceScore = 1;

          let multiplier = 1.0;
          if (call.includes('STRONG OVER')) multiplier = 1.18;
          else if (call.includes('OVER')) multiplier = 1.08;
          else if (call.includes('STRONG UNDER')) multiplier = 0.82;
          else if (call.includes('UNDER')) multiplier = 0.92;

          const baseAvg = parseFloat(stats[statCat]) || 0;
          const projectedTarget = +(baseAvg * multiplier).toFixed(1);

          // Ghhost Memory Engine: Hindsight Autopsy Check & Pinpoint String Construction
          let historyStr = "";
          const pHistory = autopsyHistory[playerId]?.[statCat];
          if (pHistory && pHistory.total > 0) {
             const hitRate = pHistory.hits / pHistory.total;
             if (pHistory.total >= 3 && hitRate < 0.4) {
                 confidenceScore -= 15;
                 historyStr = ` Proceed with caution. Historical struggle (${(hitRate * 100).toFixed(0)}% accuracy).`;
             } else if (pHistory.total >= 3 && hitRate > 0.8) {
                 confidenceScore += 10;
                 historyStr = ` Historical lock (${(hitRate * 100).toFixed(0)}% accuracy).`;
             }
             
             if (pHistory.contextWarnings?.length > 0) {
                 const blowouts = pHistory.contextWarnings.filter(w => w.includes('Blowout')).length;
                 if (defensiveRank >= 25 && blowouts > 0 && call.includes('OVER')) {
                     confidenceScore -= 15;
                     historyStr += ` ⚠️ High Blowout Risk logged in Vault.`;
                 }
             }
          }

          const callDirection = call.includes('OVER') ? 'OVER' : 'UNDER';
          const memoryText = `👻 Ghhost Prediction: ${callDirection} for tonight. Pinpoint projection: ${projectedTarget} ${statCat}.${historyStr}`;

          let spatialText = "";
          if ((statCat === 'PTS' || statCat === '3PM') && hotZone !== 'Unknown') {
             if (call.includes('OVER')) {
                confidenceScore += 5;
                spatialText = `🎯 Hot Zone: ${hotZone}`;
             } else if (call.includes('UNDER')) {
                confidenceScore += 2;
                spatialText = `🛑 ZONE DENIED: ${hotZone}`;
             }
          }

          statEvaluations.push({
             category: statCat,
             avg: stats[statCat],
             projectedTarget: projectedTarget,
             call: call,
             color: color,
             rank: defensiveRank,
             confidence: confidenceScore,
             oppDesc: `Opp Rank: ${defensiveRank}/30${restText}`,
             streakDesc: streakText,
             spatialDesc: spatialText,
             memoryDesc: memoryText
          });
       });

       playerPredictions.push({
          player: playerName,
          playerId: playerId,
          position: pHeaders.includes('POSITION') ? player[pHeaders.indexOf('POSITION')] : 'STARTER',
          team: teamAbbr,
          opponent: oppName,
          opponentAbbr: opponentAbbr,
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

    logPredictionsToVault('NBA', playerPredictions).catch(console.error);

    const payload = {
       matchups: todayMatchups,
       players: playerPredictions
    };

    try {
       await require('fs').promises.writeFile(CACHE_PATH, JSON.stringify({ gameDate, timestamp: Date.now(), data: payload }, null, 2), 'utf-8');
    } catch (e) {
       console.error('Failed to write cache', e);
    }

    return NextResponse.json(payload);

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}