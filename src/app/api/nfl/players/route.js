import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 86400; // Cache for 24 hours

// All 32 NFL teams
const NFL_TEAMS = [
  'buf','mia','ne','nyj','bal','cin','cle','pit',
  'hou','ind','jax','ten','den','kc','lv','lac',
  'dal','nyg','phi','wsh','chi','det','gb','min',
  'atl','car','no','tb','ari','lar','sf','sea'
];

const TEAM_ABBR_MAP = {
  buf:'BUF',mia:'MIA',ne:'NE',nyj:'NYJ',bal:'BAL',cin:'CIN',cle:'CLE',pit:'PIT',
  hou:'HOU',ind:'IND',jax:'JAX',ten:'TEN',den:'DEN',kc:'KC',lv:'LV',lac:'LAC',
  dal:'DAL',nyg:'NYG',phi:'PHI',wsh:'WSH',chi:'CHI',det:'DET',gb:'GB',min:'MIN',
  atl:'ATL',car:'CAR',no:'NO',tb:'TB',ari:'ARI',lar:'LAR',sf:'SF',sea:'SEA'
};

export async function GET() {
  try {
    const allPlayers = [];
    const seen = new Set();

    // Fetch rosters from all 32 teams in parallel (batched)
    const batchSize = 8;
    for (let i = 0; i < NFL_TEAMS.length; i += batchSize) {
      const batch = NFL_TEAMS.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(slug =>
          fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${slug}/roster`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            next: { revalidate: 86400 }
          })
          .then(r => r.json())
          .then(data => ({ slug, data }))
          .catch(() => ({ slug, data: null }))
        )
      );

      results.forEach(({ slug, data }) => {
        if (!data || !data.athletes) return;
        const teamAbbr = TEAM_ABBR_MAP[slug] || slug.toUpperCase();
        
        data.athletes.forEach(group => {
          if (!group.items) return;
          group.items.forEach(player => {
            if (seen.has(player.id)) return;
            seen.add(player.id);
            allPlayers.push({
              id: String(player.id),
              name: player.fullName || player.displayName,
              team: teamAbbr,
              position: player.position?.abbreviation || 'N/A'
            });
          });
        });
      });
    }

    // Sort alphabetically
    allPlayers.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json(allPlayers);
  } catch (error) {
    console.error('NFL players fetch error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
