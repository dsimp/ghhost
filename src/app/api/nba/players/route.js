import { NextResponse } from 'next/server';
import { fetchNBA } from '../fetchNBA';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const season = searchParams.get('season') || '2025-26';

  try {
    const data = await fetchNBA('commonallplayers', {
      IsOnlyCurrentSeason: '1',
      LeagueID: '00',
      Season: season
    });

    // The NBA API returns data in a 'resultSets' array where rowSets contains the actual rows.
    // [0][0] is PERSON_ID, [0][2] is DISPLAY_FIRST_LAST
    const playersInfo = data.resultSets[0];
    const headers = playersInfo.headers;
    const idIdx = headers.indexOf('PERSON_ID');
    const nameIdx = headers.indexOf('DISPLAY_FIRST_LAST');
    const teamIdx = headers.indexOf('TEAM_ABBREVIATION');

    const formattedPlayers = playersInfo.rowSet.map(row => ({
      id: row[idIdx],
      name: row[nameIdx],
      team: row[teamIdx],
    }));

    return NextResponse.json(formattedPlayers);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
