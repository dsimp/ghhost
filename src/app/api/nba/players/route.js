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

    const playersInfo = data.resultSets[0];
    const headers = playersInfo.headers;
    const idIdx = headers.indexOf('PERSON_ID');
    const nameIdx = headers.indexOf('DISPLAY_FIRST_LAST');
    const teamIdx = headers.indexOf('TEAM_ABBREVIATION');
    const rosterIdx = headers.indexOf('ROSTERSTATUS');

    // Only include players currently on an active roster (ROSTERSTATUS = 1)
    // Also filter out players with no team assignment (free agents, retired)
    const formattedPlayers = playersInfo.rowSet
      .filter(row => {
        const rosterStatus = row[rosterIdx];
        const team = row[teamIdx];
        return rosterStatus === 1 && team && team.trim() !== '';
      })
      .map(row => ({
        id: row[idIdx],
        name: row[nameIdx],
        team: row[teamIdx],
      }));

    return NextResponse.json(formattedPlayers);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
