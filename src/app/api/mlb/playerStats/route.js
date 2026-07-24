import { NextResponse } from 'next/server';
import { fetchMLB } from '../fetchMLB';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const playerId = searchParams.get('playerId');

  if (!playerId) {
    return NextResponse.json({ error: "Missing playerId" }, { status: 400 });
  }

  try {
    const data = await fetchMLB(`people/${playerId}/stats`, {
      stats: 'gameLog',
      group: 'hitting,pitching',
      season: new Date().getFullYear().toString()
    });

    if (!data || !data.stats) {
      return NextResponse.json({ gameLogs: [] });
    }

    let gameLogs = [];

    data.stats.forEach(statGroup => {
      if (statGroup.type.displayName === 'gameLog') {
        // Map the game log entries. The MLB API returns them chronologically. We reverse for most recent first.
        const parsedLogs = statGroup.splits.map(s => {
          const isPitcher = statGroup.group.displayName === 'pitching';
          
          return {
            date: s.date,
            opponent: s.opponent.name,
            opponentAbbr: s.opponent.name.substring(0, 3).toUpperCase(),
            isHome: s.isHome,
            isWin: s.isWin,
            
            // Stats based on whether it's a pitching or hitting log
            // We use generic names that the RiskEngine can process or map
            H: s.stat.hits !== undefined ? s.stat.hits : 0,
            HR: s.stat.homeRuns !== undefined ? s.stat.homeRuns : 0,
            R: s.stat.runs !== undefined ? s.stat.runs : 0,
            RBI: s.stat.rbi !== undefined ? s.stat.rbi : 0,
            HA: s.stat.hits !== undefined ? s.stat.hits : 0,
            K: s.stat.strikeOuts !== undefined ? s.stat.strikeOuts : 0,
            BB: s.stat.baseOnBalls !== undefined ? s.stat.baseOnBalls : 0,
            SB: s.stat.stolenBases !== undefined ? s.stat.stolenBases : 0,
            TB: s.stat.totalBases !== undefined ? s.stat.totalBases : 0,
            ER: s.stat.earnedRuns !== undefined ? s.stat.earnedRuns : 0,
            IP: s.stat.inningsPitched || "0.0",
            
            isPitcher
          };
        });
        
        // Merge in case a player does both (like Ohtani)
        gameLogs = [...gameLogs, ...parsedLogs];
      }
    });

    // Sort descending by date
    gameLogs.sort((a, b) => new Date(b.date) - new Date(a.date));

    return NextResponse.json({ gameLogs });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
