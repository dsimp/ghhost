import { NextResponse } from 'next/server';
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

  try {
    const scoreboardData = await fetchNBA('scoreboardv2', {
      GameDate: gameDate,
      DayOffset: '0',
      LeagueID: '00'
    });
    
    const gamesRowSet = scoreboardData.resultSets[0].rowSet;
    const gameHeaders = scoreboardData.resultSets[0].headers;
    const homeTeamIdIdx = gameHeaders.indexOf('HOME_TEAM_ID');
    const visitorTeamIdIdx = gameHeaders.indexOf('VISITOR_TEAM_ID');
    
    if (!gamesRowSet || gamesRowSet.length === 0) {
      return NextResponse.json({ predictions: [], message: 'No games scheduled for today.' });
    }

    const todayMatchups = [];
    const playingTeamIds = new Set();
    const teamIdToOppositeName = {}; 

    const teamDefenseData = await fetchNBA('leaguedashteamstats', {
      MeasureType: 'Opponent',
      PerMode: 'PerGame',
      Season: season,
      SeasonType: 'Regular Season',
      LeagueID: '00',
      LastNGames: '0',
      Month: '0',
      OpponentTeamID: '0',
      PORound: '0',
      PaceAdjust: 'N',
      Period: '0',
      PlusMinus: 'N',
      Rank: 'N'
    });

    const defHeaders = teamDefenseData.resultSets[0].headers;
    const defRows = teamDefenseData.resultSets[0].rowSet;
    
    const teamIdToName = {};
    defRows.forEach(row => {
      teamIdToName[row[0]] = row[1]; 
    });

    gamesRowSet.forEach(g => {
      const homeId = g[homeTeamIdIdx];
      const awayId = g[visitorTeamIdIdx];
      playingTeamIds.add(String(homeId));
      playingTeamIds.add(String(awayId));
      
      const homeName = teamIdToName[homeId] || String(homeId);
      const awayName = teamIdToName[awayId] || String(awayId);
      
      teamIdToOppositeName[homeId] = awayName;
      teamIdToOppositeName[awayId] = homeName;
      
      todayMatchups.push({ home: homeName, away: awayName });
    });

    const rankMaps = {
       'PTS': rankTeams(defRows, defHeaders.indexOf('OPP_PTS'), true),
       'REB': rankTeams(defRows, defHeaders.indexOf('OPP_REB'), true),
       'AST': rankTeams(defRows, defHeaders.indexOf('OPP_AST'), true),
       'STL': rankTeams(defRows, defHeaders.indexOf('OPP_STL'), true),
       'BLK': rankTeams(defRows, defHeaders.indexOf('OPP_BLK'), true),
       'TOV': rankTeams(defRows, defHeaders.indexOf('OPP_TOV'), true), // Opp TOV means opposing team forced turnovers, logic slightly inverts
       '3PM': rankTeams(defRows, defHeaders.indexOf('OPP_FG3M'), true)
    };

    const playerStatsData = await fetchNBA('leaguedashplayerstats', {
      MeasureType: 'Base',
      PerMode: 'PerGame',
      Season: season,
      SeasonType: 'Regular Season',
      LeagueID: '00',
      LastNGames: '0',
      Month: '0',
      OpponentTeamID: '0',
      PORound: '0',
      PaceAdjust: 'N',
      Period: '0',
      PlusMinus: 'N',
      Rank: 'N'
    });

    const pHeaders = playerStatsData.resultSets[0].headers;
    const pRows = playerStatsData.resultSets[0].rowSet.filter(r => playingTeamIds.has(String(r[pHeaders.indexOf('TEAM_ID')])) && r[pHeaders.indexOf('MIN')] > 22);

    const playerPredictions = [];

    pRows.forEach(player => {
       const playerName = player[pHeaders.indexOf('PLAYER_NAME')];
       const playerId = player[pHeaders.indexOf('PLAYER_ID')];
       const teamId = player[pHeaders.indexOf('TEAM_ID')];
       const teamAbbr = player[pHeaders.indexOf('TEAM_ABBREVIATION')];
       const oppName = teamIdToOppositeName[teamId];
       // Find oppId using the mapping
       const oppId = Object.keys(teamIdToOppositeName).find(k => k !== String(teamId) && teamIdToOppositeName[k] === oppName && teamIdToOppositeName[String(teamId)] === oppName);
       // Wait, a more direct mapping: we know the matchup games.
       // The easier way:
       let opponentIdMatch = "0";
       gamesRowSet.forEach(g => {
          if (String(g[homeTeamIdIdx]) === String(teamId)) opponentIdMatch = String(g[visitorTeamIdIdx]);
          if (String(g[visitorTeamIdIdx]) === String(teamId)) opponentIdMatch = String(g[homeTeamIdIdx]);
       });

       const stats = {
         'PTS': player[pHeaders.indexOf('PTS')],
         'REB': player[pHeaders.indexOf('REB')],
         'AST': player[pHeaders.indexOf('AST')],
         'STL': player[pHeaders.indexOf('STL')],
         'BLK': player[pHeaders.indexOf('BLK')],
         '3PM': player[pHeaders.indexOf('FG3M')]
       };

       const statEvaluations = [];

       ['PTS', 'REB', 'AST', 'STL', 'BLK', '3PM'].forEach(statCat => {
          const defensiveRank = rankMaps[statCat][oppName]; 
          // Rank 1 = Matchup is incredibly easy (gives up most). Rank 30 = Matchup is extremely hard (gives up least).
          if (!defensiveRank) return;

          let call = defensiveRank <= 15 ? 'OVER' : 'UNDER';
          
          let color = '#a1a1aa'; // default neutral
          if (defensiveRank <= 5) { call = 'STRONG OVER'; color = '#22c55e'; } // green
          else if (defensiveRank <= 10) { color = '#4ade80'; } // light green
          else if (defensiveRank >= 26) { call = 'STRONG UNDER'; color = '#ef4444'; } // red
          else if (defensiveRank >= 20) { color = '#f87171'; } // light red

          statEvaluations.push({
             category: statCat,
             avg: stats[statCat],
             call: call,
             color: color,
             rank: defensiveRank,
             oppDesc: `Opp Rank: ${defensiveRank}/30`
          });
       });

       playerPredictions.push({
          player: playerName,
          playerId: playerId,
          team: teamAbbr,
          opponent: oppName,
          opponentId: opponentIdMatch,
          evaluations: statEvaluations
       });
    });

    // Sort by players who have the most "STRONG" predictions
    playerPredictions.sort((a, b) => {
       const aStrong = a.evaluations.filter(e => e.call.includes('STRONG')).length;
       const bStrong = b.evaluations.filter(e => e.call.includes('STRONG')).length;
       return bStrong - aStrong;
    });

    return NextResponse.json({
       matchups: todayMatchups,
       players: playerPredictions
    });

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
