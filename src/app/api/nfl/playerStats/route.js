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
        pts: 333, // pass yds
        reb: 66,  // rush yds
        ast: 2,   // pass TDs
        stl: 1,   // INTs
        blk: 0,
        fg3m: 0,
        tov: 1
      }
    ]
  });
}
