import { NextResponse } from 'next/server';
import { fetchMLB } from '../fetchMLB';

export async function GET() {
  try {
    // Fetch all active MLB teams
    const teamsData = await fetchMLB('teams', { sportId: 1, activeStatus: 'Y', season: 2026 });
    const teams = teamsData?.teams || [];
    
    const teamMap = {};
    teams.forEach(t => {
      teamMap[t.id] = t.abbreviation || t.name.substring(0, 3).toUpperCase();
    });

    // Fetch the 40-man roster for each team (includes active + IL players)
    const allPlayers = [];
    const seen = new Set();

    // Batch teams 6 at a time to avoid rate limiting
    const batchSize = 6;
    for (let i = 0; i < teams.length; i += batchSize) {
      const batch = teams.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(team =>
          fetchMLB(`teams/${team.id}/roster`, { rosterType: 'active', season: 2026 })
            .then(data => ({ teamId: team.id, data }))
            .catch(() => ({ teamId: team.id, data: null }))
        )
      );

      results.forEach(({ teamId, data }) => {
        if (!data || !data.roster) return;
        const teamAbbr = teamMap[teamId] || 'N/A';

        data.roster.forEach(entry => {
          const player = entry.person;
          if (!player || seen.has(player.id)) return;
          seen.add(player.id);

          allPlayers.push({
            id: player.id,
            name: player.fullName,
            teamId: teamId,
            team: teamAbbr,
            position: entry.position?.abbreviation || player.primaryPosition?.abbreviation || 'Unknown',
            jerseyNumber: entry.jerseyNumber || null,
            status: entry.status?.description || 'Active'
          });
        });
      });
    }

    // Sort alphabetically by name
    allPlayers.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json(allPlayers);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
