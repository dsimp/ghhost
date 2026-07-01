import { NextResponse } from 'next/server';
import { logPredictionsToVault, getFullPlayerHistory, getLearnedAdjustments } from '../../memory/vault';
import { fetchNBA } from '../fetchNBA';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = global;
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Phase 2: WNBA City coordinates for travel fatigue (lat, lng, timezone offset from ET)
const WNBA_CITIES = {
  'Atlanta Dream': { lat: 33.757, lng: -84.396, tz: 0 },
  'Chicago Sky': { lat: 41.881, lng: -87.674, tz: -1 },
  'Connecticut Sun': { lat: 41.496, lng: -72.084, tz: 0 },
  'Dallas Wings': { lat: 32.790, lng: -96.810, tz: -1 },
  'Golden State Valkyries': { lat: 37.768, lng: -122.388, tz: -3 },
  'Indiana Fever': { lat: 39.764, lng: -86.156, tz: 0 },
  'Las Vegas Aces': { lat: 36.169, lng: -115.140, tz: -3 },
  'Los Angeles Sparks': { lat: 34.043, lng: -118.267, tz: -3 },
  'Minnesota Lynx': { lat: 44.980, lng: -93.276, tz: -1 },
  'New York Liberty': { lat: 40.683, lng: -73.975, tz: 0 },
  'Phoenix Mercury': { lat: 33.446, lng: -112.071, tz: -2 },
  'Seattle Storm': { lat: 47.622, lng: -122.354, tz: -3 },
  'Washington Mystics': { lat: 38.898, lng: -77.021, tz: 0 }
};

function calcTravelMiles(teamA, teamB) {
  const a = WNBA_CITIES[teamA];
  const b = WNBA_CITIES[teamB];
  if (!a || !b) return 0;
  const R = 3959;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const x = Math.sin(dLat/2)**2 + Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
}

function calcTimezoneShift(awayTeam, homeTeam) {
  const a = WNBA_CITIES[awayTeam];
  const b = WNBA_CITIES[homeTeam];
  if (!a || !b) return 0;
  return Math.abs(a.tz - b.tz);
}

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
  const season = searchParams.get('season') || '2026';
  
  const gameDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });

  try {
     const cached = await prisma.dailyCache.findUnique({
       where: { sport_gameDate: { sport: 'WNBA', gameDate } }
     });
     if (cached) {
        const now = Date.now();
        // Return cache if it's for today and less than 1 hour old (3600000 ms)
        if ((now - Number(cached.timestamp)) < 3600000) {
            return NextResponse.json(cached.payload);
        }
     }
  } catch (e) {
     // Ignore cache read errors
  }

  try {
    // Batch 1 — Phase 2: Added Advanced stats and Team General stats (PACE)
    const [scoreboardData, teamDefenseData, playerStatsData, playerAdvancedData, teamGeneralData, playerIndexData] = await Promise.all([
      fetchNBA('scoreboardv3', { GameDate: gameDate, LeagueID: '10' }).catch(() => null),
      fetchNBA('leaguedashteamstats', { MeasureType: 'Opponent', PerMode: 'PerGame', Season: season, SeasonType: 'Regular Season', LeagueID: '10', LastNGames: '0', Month: '0', OpponentTeamID: '0', PORound: '0', PaceAdjust: 'N', Period: '0', PlusMinus: 'N', Rank: 'N' }).catch(() => null),
      fetchNBA('leaguedashplayerstats', { MeasureType: 'Base', PerMode: 'PerGame', Season: season, SeasonType: 'Regular Season', LeagueID: '10', LastNGames: '0', Month: '0', OpponentTeamID: '0', PORound: '0', PaceAdjust: 'N', Period: '0', PlusMinus: 'N', Rank: 'N' }).catch(() => null),
      fetchNBA('leaguedashplayerstats', { MeasureType: 'Advanced', PerMode: 'PerGame', Season: season, SeasonType: 'Regular Season', LeagueID: '10', LastNGames: '0', Month: '0', OpponentTeamID: '0', PORound: '0', PaceAdjust: 'N', Period: '0', PlusMinus: 'N', Rank: 'N' }).catch(() => null),
      fetchNBA('leaguedashteamstats', { MeasureType: 'Base', PerMode: 'PerGame', Season: season, SeasonType: 'Regular Season', LeagueID: '10', LastNGames: '0', Month: '0', OpponentTeamID: '0', PORound: '0', PaceAdjust: 'N', Period: '0', PlusMinus: 'N', Rank: 'N' }).catch(() => null),
      fetchNBA('playerindex', { LeagueID: '10', Season: season }).catch(() => null)
    ]);
    
    // Graceful Failure if NBA API blocked us
    if (!scoreboardData || !teamDefenseData || !playerStatsData) {
      const errorPayload = { matchups: [], players: [], message: 'NBA Stats API is temporarily rate-limiting our servers. The engine will retry automatically soon. Please check back later.' };
      return NextResponse.json(errorPayload);
    }
    await new Promise(r => setTimeout(r, 200));

    // Batch 2
    const [gameLogsData, playerShotData] = await Promise.all([
      fetchNBA('leaguegamelog', { Counter: '1000', Direction: 'DESC', LeagueID: '10', PlayerOrTeam: 'P', Season: season, SeasonType: 'Regular Season', Sorter: 'DATE' }).catch(() => null),
      fetchNBA('leaguedashplayershotlocations', { DistanceRange: 'By Zone', LastNGames: '0', LeagueID: '10', MeasureType: 'Base', Month: '0', OpponentTeamID: '0', Outcome: '', PORound: '0', PaceAdjust: 'N', PerMode: 'PerGame', Period: '0', PlayerExperience: '', PlayerPosition: '', PlusMinus: 'N', Rank: 'N', Season: season, SeasonSegment: '', SeasonType: 'Regular Season', ShotClockRange: '', StarterBench: '', TeamID: '0', VsConference: '', VsDivision: '' }).catch(() => null)
    ]);
    await new Promise(r => setTimeout(r, 200));

    // Batch 3
    const [last10StatsData, homeStatsData, roadStatsData] = await Promise.all([
      fetchNBA('leaguedashplayerstats', { MeasureType: 'Base', PerMode: 'PerGame', Season: season, SeasonType: 'Regular Season', LeagueID: '10', LastNGames: '10', Month: '0', OpponentTeamID: '0', PORound: '0', PaceAdjust: 'N', Period: '0', PlusMinus: 'N', Rank: 'N' }).catch(() => null),
      fetchNBA('leaguedashplayerstats', { MeasureType: 'Base', PerMode: 'PerGame', Season: season, SeasonType: 'Regular Season', LeagueID: '10', LastNGames: '0', Location: 'Home', Month: '0', OpponentTeamID: '0', PORound: '0', PaceAdjust: 'N', Period: '0', PlusMinus: 'N', Rank: 'N' }).catch(() => null),
      fetchNBA('leaguedashplayerstats', { MeasureType: 'Base', PerMode: 'PerGame', Season: season, SeasonType: 'Regular Season', LeagueID: '10', LastNGames: '0', Location: 'Road', Month: '0', OpponentTeamID: '0', PORound: '0', PaceAdjust: 'N', Period: '0', PlusMinus: 'N', Rank: 'N' }).catch(() => null)
    ]);
    
    const gamesRowSet = scoreboardData?.scoreboard?.games || [];
    if (!gamesRowSet || gamesRowSet.length === 0) {
      const emptyPayload = { matchups: [], players: [], message: 'No games scheduled for today.' };
      try {
        await prisma.dailyCache.upsert({
          where: { sport_gameDate: { sport: 'WNBA', gameDate } },
          update: { timestamp: Date.now(), payload: emptyPayload },
          create: { sport: 'WNBA', gameDate, timestamp: Date.now(), payload: emptyPayload }
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
                fetchNBA('leaguedashplayerstats', { MeasureType: 'Base', PerMode: 'PerGame', Season: season, SeasonType: 'Regular Season', LeagueID: '10', LastNGames: '0', Month: '0', OpponentTeamID: hId, PORound: '0', PaceAdjust: 'N', Period: '0', PlusMinus: 'N', Rank: 'N' }).catch(() => null),
                fetchNBA('leaguedashplayerstats', { MeasureType: 'Base', PerMode: 'PerGame', Season: season, SeasonType: 'Regular Season', LeagueID: '10', LastNGames: '0', Month: '0', OpponentTeamID: aId, PORound: '0', PaceAdjust: 'N', Period: '0', PlusMinus: 'N', Rank: 'N' }).catch(() => null)
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

    // Phase 2: Build Advanced Stats Map (USG%, TS%, PIE)
    const advancedMap = {};
    if (playerAdvancedData && playerAdvancedData.resultSets && playerAdvancedData.resultSets[0].rowSet) {
       const advHeaders = playerAdvancedData.resultSets[0].headers;
       playerAdvancedData.resultSets[0].rowSet.forEach(row => {
          advancedMap[String(row[advHeaders.indexOf('PLAYER_ID')])] = {
             USG_PCT: row[advHeaders.indexOf('USG_PCT')],
             TS_PCT: row[advHeaders.indexOf('TS_PCT')],
             PIE: row[advHeaders.indexOf('PIE')]
          };
       });
    }

    // Phase 2: Build Team Pace Map
    const teamPaceMap = {};
    const leagueAvgPace = 95; // WNBA league average pace ~95
    if (teamGeneralData && teamGeneralData.resultSets && teamGeneralData.resultSets[0].rowSet) {
       const tgHeaders = teamGeneralData.resultSets[0].headers;
       const paceIdx = tgHeaders.indexOf('PACE');
       if (paceIdx !== -1) {
          teamGeneralData.resultSets[0].rowSet.forEach(row => {
             teamPaceMap[row[tgHeaders.indexOf('TEAM_NAME')]] = row[paceIdx];
          });
       }
    }

    // Fetch the Vault's Historical Memory
    const autopsyHistory = await getFullPlayerHistory();

    // Phase 3: Fetch the Brain's Learned Adjustments
    const learnedAdj = await getLearnedAdjustments('WNBA');

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
                GAME_DATE: r[glHeaders.indexOf('GAME_DATE')],
                PTS: r[glHeaders.indexOf('PTS')],
                REB: r[glHeaders.indexOf('REB')],
                AST: r[glHeaders.indexOf('AST')],
                STL: r[glHeaders.indexOf('STL')],
                BLK: r[glHeaders.indexOf('BLK')],
                '3PM': r[glHeaders.indexOf('FG3M')],
                'TOV': r[glHeaders.indexOf('TOV')]
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

    // Build set of players who have played in the last 21 days
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
       
       // PRA combo (Points + Rebounds + Assists)
       const praAvg = (parseFloat(stats['PTS']) || 0) + (parseFloat(stats['REB']) || 0) + (parseFloat(stats['AST']) || 0);
       stats['PRA'] = praAvg;
       
       const isHomePlayer = todayMatchups.some(m => m.home === (teamIdToName[teamId] || teamId));
       const logs = playerLogsMap[playerId] || [];
       const hotZone = playerShotMap[playerId]?.bestZone || 'Unknown';

       // Phase 2: Advanced stats
       const advStats = advancedMap[playerId];
       const playerUSG = advStats?.USG_PCT || 0.20;
       const playerTS = advStats?.TS_PCT || 0.50;

       // Phase 2: Pace matching
       const playerTeamName = teamIdToName[teamId];
       const playerTeamPace = teamPaceMap[playerTeamName] || leagueAvgPace;
       const opponentPace = teamPaceMap[oppName] || leagueAvgPace;
       const gamePace = (playerTeamPace + opponentPace) / 2;
       const paceModifier = gamePace / leagueAvgPace;

       // Phase 2: Travel fatigue
       let travelModifier = 1.0;
       let travelText = '';
       if (!isHomePlayer) {
          const miles = calcTravelMiles(playerTeamName, oppName);
          const tzShift = calcTimezoneShift(playerTeamName, oppName);
          if (miles > 2000 || tzShift >= 3) {
             travelModifier = 0.96;
             travelText = ` ✈️ Heavy Travel (${Math.round(miles)} mi, ${tzShift}hr TZ shift)`;
          } else if (miles > 1000 || tzShift >= 2) {
             travelModifier = 0.98;
             travelText = ` ✈️ Travel (${Math.round(miles)} mi)`;
          }
       }


           const h2hStats = h2hPlayerStatsMap[playerId]?.[opponentIdMatch];
           const last10Stats = last10Map[playerId];
           const splitStats = isHomePlayer ? homeMap[playerId] : roadMap[playerId];

       const statEvaluations = [];

       ['PTS', 'REB', 'AST', 'STL', 'BLK', '3PM', 'TOV', 'PRA'].forEach(statCat => {
          let defensiveRank;
          if (statCat === 'PRA') {
             const ptsRank = rankMaps['PTS']?.[oppName] || 6;
             const rebRank = rankMaps['REB']?.[oppName] || 6;
             const astRank = rankMaps['AST']?.[oppName] || 6;
             defensiveRank = Math.round((ptsRank + rebRank + astRank) / 3);
          } else {
             defensiveRank = rankMaps[statCat] ? (rankMaps[statCat][oppName] || 6) : 6;
          }
          if (!defensiveRank) return;

          const avg = stats[statCat];
          let call = defensiveRank <= 6 ? 'OVER' : 'UNDER';
          let color = '#a1a1aa';
          
          let confidenceScore = 50; 

          if (defensiveRank <= 3) { call = 'STRONG OVER'; color = '#22c55e'; confidenceScore += 15; }
          else if (defensiveRank <= 6) { color = '#4ade80'; confidenceScore += 5; }
          else if (defensiveRank >= 10) { call = 'STRONG UNDER'; color = '#ef4444'; confidenceScore += 15; }
          else if (defensiveRank >= 7) { color = '#f87171'; confidenceScore += 5; }

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
                 restText = " (Back-to-Back)";
              } else if (restDays >= 4 && restDays <= 10) {
                 confidenceScore -= 5;
                 restText = ` (${restDays}-Day Rest)`;
              } else if (restDays > 10 && restDays <= 30) {
                 restText = ' (Extended Rest)';
              }
              // If restDays > 30, it's likely offseason data — skip entirely

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
                 color = '#f87171'; // BUG FIX 3: UNDER = red
                 streakText = `👻 Ghhost Prediction: Regression Expected (Reverting after ${overCount} Overs)`;
             } else if (call.includes('UNDER') && underCount >= 8) {
                 // Due for positive regression
                 confidenceScore -= 20;
                 call = 'OVER';
                 color = '#4ade80'; // BUG FIX 3: OVER = green
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

           if (last10Stats) {
               const last10Avg = last10Stats[statCat];
               if (call.includes('OVER') && last10Avg > avg * 1.2) {
                   confidenceScore += 10;
                   streakText += ` 📈 High Frequency: Averaging ${last10Avg} L10.`;
               } else if (call.includes('UNDER') && last10Avg < avg * 0.8) {
                   confidenceScore += 10;
                   streakText += ` 📉 Cold Frequency: Averaging ${last10Avg} L10.`;
               }
           }
           
           streakText = streakText.trim();
           if (confidenceScore < 60) call = call.replace('STRONG ', '');

           if (confidenceScore > 99) confidenceScore = 99;
           if (confidenceScore < 1) confidenceScore = 1;

           // MAJOR CHANGE 2: Weighted multi-source projection
           const seasonAvg = parseFloat(stats[statCat]) || 0;
           const last10AvgVal = last10Stats ? (parseFloat(last10Stats[statCat]) || seasonAvg) : seasonAvg;
           const splitAvgVal = splitStats ? (parseFloat(splitStats[statCat]) || seasonAvg) : seasonAvg;
           const h2hAvg = (h2hStats && h2hStats[statCat] !== undefined) ? parseFloat(h2hStats[statCat]) : seasonAvg;

           let baseProjection = (seasonAvg * 0.30) + (last10AvgVal * 0.40) + (splitAvgVal * 0.20) + (h2hAvg * 0.10);

           // MAJOR CHANGE 3: Continuous defensive modifier (12-team scale)
           const matchupModifier = 1.0 + ((6.5 - defensiveRank) / 6.5) * 0.12;

           // MAJOR CHANGE 4: Rest modifier
           let restModifier = 1.0;
           if (restDays === 0) restModifier = 0.92;
           else if (restDays === 1) restModifier = 1.0;
           else if (restDays === 2) restModifier = 1.02;
           else if (restDays === 3) restModifier = 1.01;
           else if (restDays >= 4) restModifier = 0.96;

           // MAJOR CHANGE 5: Trend modifier
           const trendModifier = last10AvgVal > 0 && seasonAvg > 0 
             ? 1.0 + ((last10AvgVal - seasonAvg) / seasonAvg) * 0.15
             : 1.0;

           // Phase 2: Usage efficiency modifier (PTS and 3PM only)
           let usageModifier = 1.0;
           if (statCat === 'PTS' || statCat === '3PM') {
              if (playerUSG > 0.25 && playerTS > 0.55) usageModifier = 1.04;
              else if (playerUSG > 0.28) usageModifier = 1.02;
              else if (playerUSG < 0.15) usageModifier = 0.97;
           }

           // Phase 2: Pace modifier
           const paceEffect = statCat === 'PTS' ? paceModifier : 
                             (statCat === 'REB' || statCat === 'AST') ? 1.0 + (paceModifier - 1.0) * 0.5 :
                             1.0;

           // MAJOR CHANGE 6: Final projection (now with Phase 2 + Phase 3 modifiers)
           let projectedTarget = baseProjection * matchupModifier * restModifier * trendModifier
                                 * usageModifier * paceEffect * travelModifier;
           const confidenceScale = 1.0 + ((confidenceScore - 50) / 500);
           projectedTarget = projectedTarget * confidenceScale;

           // Phase 3: Apply Learned Adjustments from the Feedback Loop
           let learnedModifier = 0;
           let learnedText = '';
           if (learnedAdj[`overall_${statCat}`]) learnedModifier += learnedAdj[`overall_${statCat}`];
           const locBucket = isHomePlayer ? `home_${statCat}` : `away_${statCat}`;
           if (learnedAdj[locBucket]) learnedModifier += learnedAdj[locBucket];
           if (learnedAdj[`vs_${opponentAbbr}_${statCat}`]) learnedModifier += learnedAdj[`vs_${opponentAbbr}_${statCat}`];
           const callBucket = `${call.includes('OVER') ? 'over' : 'under'}_${statCat}`;
           if (learnedAdj[callBucket]) learnedModifier += learnedAdj[callBucket];
           if (restDays === 0 && learnedAdj[`b2b_${statCat}`]) learnedModifier += learnedAdj[`b2b_${statCat}`];
           if (travelModifier < 1.0 && learnedAdj[`travel_${statCat}`]) learnedModifier += learnedAdj[`travel_${statCat}`];
           
           learnedModifier = Math.max(-0.12, Math.min(0.12, learnedModifier));
           if (Math.abs(learnedModifier) > 0.005) {
              projectedTarget = projectedTarget * (1 + learnedModifier);
              learnedText = ` 🧠 Brain Adj: ${learnedModifier > 0 ? '+' : ''}${(learnedModifier * 100).toFixed(1)}%`;
           }

           projectedTarget = Math.max(0, +(projectedTarget.toFixed(1)));

          // Ghhost Memory Engine: Hindsight Autopsy Check & Pinpoint String Construction
              let historyStr = "";
              let numAccuracy = null;
              const pHistory = autopsyHistory[playerId]?.[statCat];
              if (pHistory && pHistory.total > 0) {
                 const hitRate = pHistory.hits / pHistory.total;
                 numAccuracy = hitRate;
                 // MAJOR CHANGE 7: Confidence decay weighted by sample size
                 const sampleWeight = Math.min(1.0, (pHistory.total - 2) / 8);
             
             // Base Auto-Correction
             if (pHistory.total >= 3 && hitRate < 0.4) {
                 confidenceScore -= Math.round(15 * sampleWeight);
                 historyStr = ` Proceed with caution. Historical struggle (${(hitRate * 100).toFixed(0)}% accuracy).`;
             } else if (pHistory.total >= 3 && hitRate > 0.8) {
                 confidenceScore += Math.round(10 * sampleWeight);
                 historyStr = ` Historical lock (${(hitRate * 100).toFixed(0)}% accuracy).`;
             }
             
             // Advanced Contextual Auto-Correction (Home/Away & Opponent)
             const oppSplits = pHistory.opponentSplits?.[opponentAbbr];
             if (oppSplits && oppSplits.hits + oppSplits.misses >= 3) {
                 const oppHitRate = oppSplits.hits / (oppSplits.hits + oppSplits.misses);
                 if (oppHitRate <= 0.25) {
                     confidenceScore -= 25; // Massive penalty for poor matchup prediction history
                     historyStr += ` 👻 Auto-Corrected: Poor historical accuracy predicting against ${opponentAbbr}.`;
                     call = call.includes('OVER') ? 'UNDER' : 'OVER'; // Flip the call due to terrible historical accuracy
                     color = call === 'OVER' ? '#4ade80' : '#f87171';
                 } else if (oppHitRate >= 0.75) {
                     confidenceScore += 15;
                     historyStr += ` 🎯 Genius Lock: Very high accuracy predicting against ${opponentAbbr}.`;
                 }
             }

             const homeGames = pHistory.homeHits + pHistory.homeMisses;
             const awayGames = pHistory.awayHits + pHistory.awayMisses;
             if (isHomePlayer && homeGames >= 3) {
                 const homeRate = pHistory.homeHits / homeGames;
                 if (homeRate <= 0.3) { confidenceScore -= 20; historyStr += ` 👻 Auto-Corrected: Low accuracy at Home.`; }
                 else if (homeRate >= 0.8) { confidenceScore += 10; }
             } else if (!isHomePlayer && awayGames >= 3) {
                 const awayRate = pHistory.awayHits / awayGames;
                 if (awayRate <= 0.3) { confidenceScore -= 20; historyStr += ` 👻 Auto-Corrected: Low accuracy on the Road.`; }
                 else if (awayRate >= 0.8) { confidenceScore += 10; }
             }

             if (pHistory.contextWarnings?.length > 0) {
                 const blowouts = pHistory.contextWarnings.filter(w => w.includes('Blowout')).length;
                 if (defensiveRank >= 10 && blowouts > 0 && call.includes('OVER')) {
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
                 oppDesc: `Opp Rank: ${defensiveRank}/12${restText}`,
                 streakDesc: streakText,
                 spatialDesc: spatialText,
                 memoryDesc: memoryText,
                 historicalAccuracy: numAccuracy,
                 totalGames: pHistory ? pHistory.total : 0
              });
       });

       playerPredictions.push({
          player: playerName,
          playerId: playerId,
          position: positionMap[playerId] || 'STARTER',
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

    // Log predictions to the Memory Vault asynchronously, enforcing the correct gameDate
    logPredictionsToVault('WNBA', playerPredictions, gameDate).catch(console.error);

    const payload = {
       matchups: todayMatchups,
       players: playerPredictions
    };

    try {
       await prisma.dailyCache.upsert({
          where: { sport_gameDate: { sport: 'WNBA', gameDate } },
          update: { timestamp: Date.now(), payload: payload },
          create: { sport: 'WNBA', gameDate, timestamp: Date.now(), payload: payload }
       });
    } catch (e) {
       console.error('Failed to write cache', e);
    }

    return NextResponse.json(payload);

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
