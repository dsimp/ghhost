import { NextResponse } from 'next/server';
import { fetchMLB } from '../fetchMLB';

export async function GET() {
  try {
    // Fetch active teams to map team ID to abbreviation
    const teamsData = await fetchMLB('teams', { sportId: 1, activeStatus: 'Y' });
    const teamMap = {};
    if (teamsData && teamsData.teams) {
      teamsData.teams.forEach(t => {
        teamMap[t.id] = t.abbreviation || t.name.substring(0, 3).toUpperCase();
      });
    }

    // Fetch players for the 2024 season (as a reliable base year)
    const data = await fetchMLB('sports/1/players', { season: 2024 });
    
    if (!data || !data.people) {
      throw new Error("Invalid response from MLB API");
    }

    const formattedPlayers = data.people.filter(p => p.active).map(p => ({
      id: p.id,
      name: p.fullName,
      teamId: p.currentTeam?.id || null,
      team: p.currentTeam ? (teamMap[p.currentTeam.id] || 'FA') : 'FA',
      position: p.primaryPosition?.abbreviation || 'Unknown',
    }));

    return NextResponse.json(formattedPlayers);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
