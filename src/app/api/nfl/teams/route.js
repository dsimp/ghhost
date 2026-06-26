import { NextResponse } from 'next/server';
import { fetchNFL } from '../fetchNFL';

export async function GET(request) {
  try {
    const data = await fetchNFL('teams');
    
    // ESPN returns { sports: [ { leagues: [ { teams: [ ... ] } ] } ] }
    const teamsList = data.sports[0].leagues[0].teams.map(t => ({
      id: t.team.id,
      name: t.team.displayName,
      abbr: t.team.abbreviation
    }));

    return NextResponse.json(teamsList);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
