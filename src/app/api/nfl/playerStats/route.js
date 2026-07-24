import { NextResponse } from 'next/server';

export async function GET(request) {
  return NextResponse.json({
    id: "3139477",
    name: "Patrick Mahomes",
    gameLogs: [
      {
        gameId: "1",
        date: "2024-02-11",
        opponent: "SF",
        isHome: false,
        passYds: 333,
        rushYds: 66,
        passTDs: 2,
        interceptions: 1,
        rushTDs: 0,
        sacks: 0,
        tackles: 0,
        recYds: 0,
        recTDs: 0,
        receptions: 0,
        completions: 34
      }
    ]
  });
}
