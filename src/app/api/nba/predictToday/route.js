import { NextResponse } from 'next/server';
import { logPredictionsToVault, getFullPlayerHistory, getLearnedAdjustments } from '../../memory/vault';
import { fetchNBA } from '../fetchNBA';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = global;
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Phase 2: NBA City coordinates for travel fatigue calculation (lat, lng, timezone offset from ET)
const NBA_CITIES = {
  'Atlanta Hawks': { lat: 33.757, lng: -84.396, tz: 0 },
  'Boston Celtics': { lat: 42.366, lng: -71.062, tz: 0 },
  'Brooklyn Nets': { lat: 40.683, lng: -73.975, tz: 0 },
  'Charlotte Hornets': { lat: 35.225, lng: -80.839, tz: 0 },
  'Chicago Bulls': { lat: 41.881, lng: -87.674, tz: -1 },
  'Cleveland Cavaliers': { lat: 41.496, lng: -81.688, tz: 0 },
  'Dallas Mavericks': { lat: 32.790, lng: -96.810, tz: -1 },
  'Denver Nuggets': { lat: 39.749, lng: -105.008, tz: -2 },
  'Detroit Pistons': { lat: 42.341, lng: -83.055, tz: 0 },
  'Golden State Warriors': { lat: 37.768, lng: -122.388, tz: -3 },
  'Houston Rockets': { lat: 29.751, lng: -95.362, tz: -1 },
  'Indiana Pacers': { lat: 39.764, lng: -86.156, tz: 0 },
  'LA Clippers': { lat: 33.946, lng: -118.342, tz: -3 },
  'Los Angeles Lakers': { lat: 34.043, lng: -118.267, tz: -3 },
  'Memphis Grizzlies': { lat: 35.138, lng: -90.051, tz: -1 },
  'Miami Heat': { lat: 25.781, lng: -80.187, tz: 0 },
  'Milwaukee Bucks': { lat: 43.045, lng: -87.917, tz: -1 },
  'Minnesota Timberwolves': { lat: 44.980, lng: -93.276, tz: -1 },
  'New Orleans Pelicans': { lat: 29.949, lng: -90.082, tz: -1 },
  'New York Knicks': { lat: 40.751, lng: -73.994, tz: 0 },
  'Oklahoma City Thunder': { lat: 35.463, lng: -97.515, tz: -1 },
  'Orlando Magic': { lat: 28.539, lng: -81.384, tz: 0 },
  'Philadelphia 76ers': { lat: 39.901, lng: -75.172, tz: 0 },
  'Phoenix Suns': { lat: 33.446, lng: -112.071, tz: -2 },
  'Portland Trail Blazers': { lat: 45.532, lng: -122.667, tz: -3 },
  'Sacramento Kings': { lat: 38.580, lng: -121.500, tz: -3 },
  'San Antonio Spurs': { lat: 29.427, lng: -98.438, tz: -1 },
  'Toronto Raptors': { lat: 43.643, lng: -79.379, tz: 0 },
  'Utah Jazz': { lat: 40.768, lng: -111.901, tz: -2 },
  'Washington Wizards': { lat: 38.898, lng: -77.021, tz: 0 }
};

function calcTravelMiles(teamA, teamB) {
  const a = NBA_CITIES[teamA];
  const b = NBA_CITIES[teamB];
  if (!a || !b) return 0;
  const R = 3959; // Earth radius in miles
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const x = Math.sin(dLat/2)**2 + Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
}

function calcTimezoneShift(awayTeam, homeTeam) {
  const a = NBA_CITIES[awayTeam];
  const b = NBA_CITIES[homeTeam];
  if (!a || !b) return 0;
  return Math.abs(a.tz - b.tz); // hours of timezone shift
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
  const season = searchParams.get('season') || '2025-26';
  
  const dateObj = new Date();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  const year = dateObj.getFullYear();
  const gameDate = `${year}-${month}-${day}`; 

  try {
     const cached = await prisma.dailyCache.findUnique({
       where: { sport_gameDate: { sport: 'NBA', gameDate } }
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
    // Batch 1 — Phase 2: Added Advanced stats (USG%, TS%, PIE) and Team General stats (PACE)
    const [scoreboardData, teamDefenseData, playerStatsData, playerAdvancedData, teamGeneralData] = await Promise.all([
      fetchNBA('scoreboardv3', { GameDate: gameDate, LeagueID: '00' }).catch(() => null),
      fetchNBA('leaguedashteamstats', { MeasureType: 'Opponent', PerMode: 'PerGame', Season: season, SeasonType: 'Regular Season', LeagueID: '00', LastNGames: '0', Month: '0', OpponentTeamID: '0', PORound: '0', PaceAdjust: 'N', Period: '0', PlusMinus: 'N', Rank: 'N' }).catch(() => null),
      fetchNBA('leaguedashplayerstats', { MeasureType: 'Base', PerMode: 'PerGame', Season: season, SeasonType: 'Regular Season', LeagueID: '00', LastNGames: '0', Month: '0', OpponentTeamID: '0', PORound: '0', PaceAdjust: 'N', Period: '0', PlusMinus: 'N', Rank: 'N' }).catch(() => null),
      fetchNBA('leaguedashplayerstats', { MeasureType: 'Advanced', PerMode: 'PerGame', Season: season, SeasonType: 'Regular Season', LeagueID: '00', LastNGames: '0', Month: '0', OpponentTeamID: '0', PORound: '0', PaceAdjust: 'N', Period: '0', PlusMinus: 'N', Rank: 'N' }).catch(() => null),
      fetchNBA('leaguedashteamstats', { MeasureType: 'Base', PerMode: 'PerGame', Season: season, SeasonType: 'Regular Season', LeagueID: '00', LastNGames: '0', Month: '0', OpponentTeamID: '0', PORound: '0', PaceAdjust: 'N', Period: '0', PlusMinus: 'N', Rank: 'N' }).catch(() => null)
    ]);
    
    // Graceful Failure if NBA API blocked us
    if (!scoreboardData || !teamDefenseData || !playerStatsData) {
      const errorPayload = { matchups: [], players: [], message: 'NBA Stats API is temporarily rate-limiting our servers. The engine will retry automatically soon. Please check back later.' };
      return NextResponse.json(errorPayload);
    }
    await new Promise(r => setTimeout(r, 200));

    // Batch 2 — BUG FIX 2: Removed teamShotData fetch (was never used)
    const [gameLogsData, playerShotData] = await Promise.all([
      fetchNBA('leaguegamelog', { Counter: '1000', Direction: 'DESC', LeagueID: '00', PlayerOrTeam: 'P', Season: season, SeasonType: 'Regular Season', Sorter: 'DATE' }).catch(() => null),
      fetchNBA('leaguedashplayershotlocations', { DistanceRange: 'By Zone', LastNGames: '0', LeagueID: '00', MeasureType: 'Base', Month: '0', OpponentTeamID: '0', Outcome: '', PORound: '0', PaceAdjust: 'N', PerMode: 'PerGame', Period: '0', PlayerExperience: '', PlayerPosition: '', PlusMinus: 'N', Rank: 'N', Season: season, SeasonSegment: '', SeasonType: 'Regular Season', ShotClockRange: '', StarterBench: '', TeamID: '0', VsConference: '', VsDivision: '' }).catch(() => null)
    ]);
    await new Promise(r => setTimeout(r, 200));

    // Batch 3 — MAJOR CHANGE 1: Expanded Last 5 → Last 10
    const [last10StatsData, homeStatsData, roadStatsData] = await Promise.all([
      fetchNBA('leaguedashplayerstats', { MeasureType: 'Base', PerMode: 'PerGame', Season: season, SeasonType: 'Regular Season', LeagueID: '00', LastNGames: '10', Month: '0', OpponentTeamID: '0', PORound: '0', PaceAdjust: 'N', Period: '0', PlusMinus: 'N', Rank: 'N' }).catch(() => null),
      fetchNBA('leaguedashplayerstats', { MeasureType: 'Base', PerMode: 'PerGame', Season: season, SeasonType: 'Regular Season', LeagueID: '00', LastNGames: '0', Location: 'Home', Month: '0', OpponentTeamID: '0', PORound: '0', PaceAdjust: 'N', Period: '0', PlusMinus: 'N', Rank: 'N' }).catch(() => null),
      fetchNBA('leaguedashplayerstats', { MeasureType: 'Base', PerMode: 'PerGame', Season: season, SeasonType: 'Regular Season', LeagueID: '00', LastNGames: '0', Location: 'Road', Month: '0', OpponentTeamID: '0', PORound: '0', PaceAdjust: 'N', Period: '0', PlusMinus: 'N', Rank: 'N' }).catch(() => null)
    ]);
    
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

    // Phase 2: Build Advanced Stats Map (USG%, TS%, PIE)
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

    // Phase 2: Build Team Pace Map
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

    // Fetch the Vault's Historical Memory
    const autopsyHistory = await getFullPlayerHistory();

    // Phase 3: Fetch the Brain's Learned Adjustments (from the nightly feedback loop)
    const learnedAdj = await getLearnedAdjustments('NBA');

    // BUG FIX 1: Now stores GAME_DATE so rest-day logic actually works
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
       r[pHeaders.indexOf('MIN')] > 22 &&
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
       
       // PRA combo (Points + Rebounds + Assists) — #1 most popular combo prop
       const praAvg = (parseFloat(stats['PTS']) || 0) + (parseFloat(stats['REB']) || 0) + (parseFloat(stats['AST']) || 0);
       stats['PRA'] = praAvg;

       const isHomePlayer = todayMatchups.some(m => m.home === (teamIdToName[teamId] || teamId));
       const logs = playerLogsMap[playerId] || [];
       const hotZone = playerShotMap[playerId]?.bestZone || 'Unknown';

       // Phase 2: Advanced stats for this player
       const advStats = advancedMap[playerId];
       const playerUSG = advStats?.USG_PCT || 0.20;
       const playerTS = advStats?.TS_PCT || 0.55;
       const playerPIE = advStats?.PIE || 0.10;

       // Phase 2: Pace matching — combined pace of both teams vs league average
       const playerTeamName = teamIdToName[teamId];
       const playerTeamPace = teamPaceMap[playerTeamName] || leagueAvgPace;
       const opponentPace = teamPaceMap[oppName] || leagueAvgPace;
       const gamePace = (playerTeamPace + opponentPace) / 2;
       const paceModifier = gamePace / leagueAvgPace; // >1 = fast game, <1 = slow game

       // Phase 2: Travel fatigue — how far did the away team travel?
       let travelModifier = 1.0;
       let travelText = '';
       if (!isHomePlayer) {
          const miles = calcTravelMiles(playerTeamName, oppName);
          const tzShift = calcTimezoneShift(playerTeamName, oppName);
          if (miles > 2000 || tzShift >= 3) {
             travelModifier = 0.96; // Heavy travel penalty
             travelText = ` ✈️ Heavy Travel (${Math.round(miles)} mi, ${tzShift}hr TZ shift)`;
          } else if (miles > 1000 || tzShift >= 2) {
             travelModifier = 0.98; // Moderate travel
             travelText = ` ✈️ Travel (${Math.round(miles)} mi)`;
          }
       }

           const h2hStats = h2hPlayerStatsMap[playerId]?.[opponentIdMatch];
           const last10Stats = last10Map[playerId];
           const splitStats = isHomePlayer ? homeMap[playerId] : roadMap[playerId];

       const statEvaluations = [];

       ['PTS', 'REB', 'AST', 'STL', 'BLK', '3PM', 'TOV', 'PRA'].forEach(statCat => {
          // PRA uses a composite defensive rank (average of PTS, REB, AST ranks)
          let defensiveRank;
          if (statCat === 'PRA') {
             const ptsRank = rankMaps['PTS']?.[oppName] || 15;
             const rebRank = rankMaps['REB']?.[oppName] || 15;
             const astRank = rankMaps['AST']?.[oppName] || 15;
             defensiveRank = Math.round((ptsRank + rebRank + astRank) / 3);
          } else {
             defensiveRank = rankMaps[statCat]?.[oppName];
          }
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
             // Calculate Rest Days from last game — BUG FIX 1: GAME_DATE now stored properly
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
             // BUG FIX 3: Fixed regression color mismatch — colors now match the flipped call direction
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

          // === MAJOR CHANGE 2: Data-driven weighted blend projection ===
          const seasonAvg = parseFloat(stats[statCat]) || 0;
          const last10Avg = last10Stats ? (parseFloat(last10Stats[statCat]) || seasonAvg) : seasonAvg;
          const splitAvgVal = splitStats ? (parseFloat(splitStats[statCat]) || seasonAvg) : seasonAvg;
          const h2hAvgVal = (h2hStats && h2hStats[statCat] !== undefined) ? parseFloat(h2hStats[statCat]) : seasonAvg;

          // Weighted base projection
          let baseProjection = (seasonAvg * 0.30) + (last10Avg * 0.40) + (splitAvgVal * 0.20) + (h2hAvgVal * 0.10);

          // === MAJOR CHANGE 3: Continuous defensive modifier ===
          // rank is 1-30. Rank 1 = worst defense (allows most), Rank 30 = best defense
          // Modifier slides from ~1.12 (rank 1) through 1.0 (rank 15.5) to ~0.88 (rank 30)
          const matchupModifier = 1.0 + ((15.5 - defensiveRank) / 15.5) * 0.12;

          // === MAJOR CHANGE 4: Rest modifier that actually works ===
          let restModifier = 1.0;
          if (restDays === 0) restModifier = 0.92;       // Back-to-back: -8%
          else if (restDays === 1) restModifier = 1.0;    // Normal rest
          else if (restDays === 2) restModifier = 1.02;   // Extra rest: +2%
          else if (restDays === 3) restModifier = 1.01;   // Slightly positive
          else if (restDays >= 4) restModifier = 0.96;    // Rust: -4%

          // === MAJOR CHANGE 5: Trend modifier from last 10 ===
          const trendModifier = last10Avg > 0 && seasonAvg > 0 
            ? 1.0 + ((last10Avg - seasonAvg) / seasonAvg) * 0.15  // 15% weight on trend
            : 1.0;

          // === Phase 2: Usage efficiency modifier (PTS and 3PM only) ===
          let usageModifier = 1.0;
          if (statCat === 'PTS' || statCat === '3PM') {
             // High usage + high efficiency = more reliable OVER projections
             if (playerUSG > 0.25 && playerTS > 0.58) usageModifier = 1.04;
             else if (playerUSG > 0.28) usageModifier = 1.02; // Volume scorer
             else if (playerUSG < 0.15) usageModifier = 0.97; // Low involvement
          }

          // === Phase 2: Pace modifier (affects all counting stats) ===
          // Fast-paced games generate more possessions = more stats for everyone
          const paceEffect = statCat === 'PTS' ? paceModifier : 
                            (statCat === 'REB' || statCat === 'AST') ? 1.0 + (paceModifier - 1.0) * 0.5 :
                            1.0; // STL, BLK, 3PM less affected by pace

          // === MAJOR CHANGE 6: Final projection assembly (now with Phase 2 + Phase 3 modifiers) ===
          let projectedTarget = baseProjection * matchupModifier * restModifier * trendModifier 
                                * usageModifier * paceEffect * travelModifier;

          // Confidence scaling: modestly amplify/dampen based on confidence (50 = neutral)
          const confidenceScale = 1.0 + ((confidenceScore - 50) / 500); // Range: 0.90 to 1.10
          projectedTarget = projectedTarget * confidenceScale;

          // === Phase 3: Apply Learned Adjustments from the Feedback Loop ===
          // The Brain has analyzed past prediction errors and learned corrections
          let learnedModifier = 0;
          let learnedText = '';
          
          // Overall category adjustment
          if (learnedAdj[`overall_${statCat}`]) learnedModifier += learnedAdj[`overall_${statCat}`];
          
          // Home/Away learned adjustment
          const locBucket = isHomePlayer ? `home_${statCat}` : `away_${statCat}`;
          if (learnedAdj[locBucket]) learnedModifier += learnedAdj[locBucket];
          
          // Opponent-specific learned adjustment
          if (learnedAdj[`vs_${opponentAbbr}_${statCat}`]) {
             learnedModifier += learnedAdj[`vs_${opponentAbbr}_${statCat}`];
          }
          
          // Call-direction learned adjustment
          const callBucket = `${call.includes('OVER') ? 'over' : 'under'}_${statCat}`;
          if (learnedAdj[callBucket]) learnedModifier += learnedAdj[callBucket];
          
          // Situational buckets
          if (restDays === 0 && learnedAdj[`b2b_${statCat}`]) learnedModifier += learnedAdj[`b2b_${statCat}`];
          if (travelModifier < 1.0 && learnedAdj[`travel_${statCat}`]) learnedModifier += learnedAdj[`travel_${statCat}`];
          if (restDays >= 4 && learnedAdj[`layoff_${statCat}`]) learnedModifier += learnedAdj[`layoff_${statCat}`];
          
          // Cap total learned adjustment to ±12% and apply
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
             
             // === MAJOR CHANGE 7: Confidence decay for vault samples ===
             const sampleWeight = Math.min(1.0, (pHistory.total - 2) / 8); // Ramps 0→1 over 2-10 games
             
             // Base Auto-Correction (weighted by sample size)
             if (pHistory.total >= 3 && hitRate < 0.4) {
                 confidenceScore += Math.round(-15 * sampleWeight);
                 historyStr = ` Proceed with caution. Historical struggle (${(hitRate * 100).toFixed(0)}% accuracy).`;
             } else if (pHistory.total >= 3 && hitRate > 0.8) {
                 confidenceScore += Math.round(10 * sampleWeight);
                 historyStr = ` Historical lock (${(hitRate * 100).toFixed(0)}% accuracy).`;
             }
             
             // Advanced Contextual Auto-Correction (Home/Away & Opponent)
             // MAJOR CHANGE 7 continued: Require at least 3 games (not 2) before flipping the call
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
                 oppDesc: `Opp Rank: ${defensiveRank}/30${restText}${travelText}`,
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