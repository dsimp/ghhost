import { NextResponse } from 'next/server';
import { fetchNBA } from '../fetchNBA';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const playerId = searchParams.get('playerId');
  const season = searchParams.get('season') || '2025-26';

  if (!playerId) {
    return NextResponse.json({ error: 'Missing playerId' }, { status: 400 });
  }

  try {
    // Fetch generic profile (season averages)
    const profileData = await fetchNBA('playerprofilev2', {
      PlayerID: playerId,
      PerMode: 'PerGame'
    });

    // Fetch game logs for the target season (to allow Player vs Team filtering)
    const gameLogData = await fetchNBA('playergamelog', {
      PlayerID: playerId,
      Season: season,
      SeasonType: 'Regular Season'
    });

    // Parse profile
    const seasonTotals = profileData.resultSets.find(r => r.name === 'SeasonTotalsRegularSeason');
    let currentSeasonStats = null;
    if (seasonTotals && seasonTotals.rowSet.length > 0) {
      const headers = seasonTotals.headers;
      // Get the last row (which is usually the most recent or current season if they played)
      const row = seasonTotals.rowSet[seasonTotals.rowSet.length - 1];
      currentSeasonStats = {
        pts: row[headers.indexOf('PTS')],
        reb: row[headers.indexOf('REB')],
        ast: row[headers.indexOf('AST')],
        stl: row[headers.indexOf('STL')],
        blk: row[headers.indexOf('BLK')],
        tov: row[headers.indexOf('TOV')],
        fg_pct: row[headers.indexOf('FG_PCT')],
        fg3_pct: row[headers.indexOf('FG3_PCT')]
      };
    }

    // Parse game logs
    const logSet = gameLogData.resultSets[0];
    const logHeaders = logSet.headers;
    const games = logSet.rowSet.map(row => {
      let matchup = row[logHeaders.indexOf('MATCHUP')];
      // MATCHUP looks like "LAL vs. BOS" or "LAL @ BOS".
      const isHome = matchup.includes('vs.');
      const opponent = isHome ? matchup.split(' vs. ')[1] : matchup.split(' @ ')[1];

      return {
        game_date: row[logHeaders.indexOf('GAME_DATE')],
        matchup: matchup,
        opponent: opponent,
        isHome: isHome,
        wl: row[logHeaders.indexOf('WL')],
        min: row[logHeaders.indexOf('MIN')],
        pts: row[logHeaders.indexOf('PTS')],
        reb: row[logHeaders.indexOf('REB')],
        ast: row[logHeaders.indexOf('AST')],
        stl: row[logHeaders.indexOf('STL')],
        blk: row[logHeaders.indexOf('BLK')],
        tov: row[logHeaders.indexOf('TOV')],
        fgm: row[logHeaders.indexOf('FGM')],
        fga: row[logHeaders.indexOf('FGA')],
        fg_pct: row[logHeaders.indexOf('FG_PCT')],
      };
    });

    return NextResponse.json({
      seasonAverages: currentSeasonStats,
      gameLogs: games
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
