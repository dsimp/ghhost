import { NextResponse } from 'next/server';
import { fetchMLB } from '../fetchMLB';

export async function GET() {
  try {
    const data = await fetchMLB('teams', { sportId: 1, activeStatus: 'Y' });
    
    if (!data || !data.teams) {
      throw new Error("Invalid response from MLB API");
    }

    const formattedTeams = data.teams.map(t => ({
      id: t.id,
      name: t.name,
      abbreviation: t.abbreviation || t.name.substring(0, 3).toUpperCase(),
      league: t.league?.name || 'Unknown',
      division: t.division?.name || 'Unknown',
    })).sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json(formattedTeams);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
