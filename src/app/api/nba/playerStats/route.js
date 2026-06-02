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
    // Fetch generic profile and game logs concurrently to eliminate waterfall delays
    const [profileRes, regLogRes, playoffLogRes] = await Promise.allSettled([
      fetchNBA('playerprofilev2', { PlayerID: playerId, PerMode: 'PerGame' }),
      fetchNBA('playergamelog', { PlayerID: playerId, Season: season, SeasonType: 'Regular Season' }),
      fetchNBA('playergamelog', { PlayerID: playerId, Season: season, SeasonType: 'Playoffs' })
    ]);

    const profileData = profileRes.status === 'fulfilled' ? profileRes.value : null;

    // Parse profile
    let currentSeasonStats = null;
    if (profileData && profileData.resultSets) {
       const seasonTotals = profileData.resultSets.find(r => r.name === 'SeasonTotalsRegularSeason');
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
    }

    let combinedRows = [];
    let logHeaders = null;

    if (regLogRes.status === 'fulfilled' && regLogRes.value.resultSets?.length > 0) {
       const logSet = regLogRes.value.resultSets[0];
       logHeaders = logSet.headers;
       combinedRows = combinedRows.concat(logSet.rowSet);
    }
    if (playoffLogRes.status === 'fulfilled' && playoffLogRes.value.resultSets?.length > 0) {
       const logSet = playoffLogRes.value.resultSets[0];
       if (!logHeaders) logHeaders = logSet.headers;
       combinedRows = combinedRows.concat(logSet.rowSet);
    }

    // Sort combined by GAME_DATE descending
    if (logHeaders) {
       const dateIdx = logHeaders.indexOf('GAME_DATE');
       combinedRows.sort((a, b) => new Date(b[dateIdx]) - new Date(a[dateIdx]));
    }

    const games = combinedRows.map(row => {
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
        fg3m: row[logHeaders.indexOf('FG3M')],
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
