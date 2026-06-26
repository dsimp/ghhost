import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // Allow up to 120s for all sport engines

export async function GET(request) {
  const host = request.headers.get('host') || 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const baseUrl = `${protocol}://${host}`;

  try {
     console.log(`[CRON] Starting Pre-warm for ALL sports at ${new Date().toISOString()}`);
     
     // Trigger ALL sport engines. They compute and save to the Prisma DailyCache table.
     // We await them so the serverless function stays alive until they finish.
     const [nbaRes, mlbRes, wnbaRes, nflRes] = await Promise.all([
        fetch(`${baseUrl}/api/nba/predictToday`).catch(e => ({ status: 500, error: e.message })),
        fetch(`${baseUrl}/api/mlb/predictToday`).catch(e => ({ status: 500, error: e.message })),
        fetch(`${baseUrl}/api/wnba/predictToday`).catch(e => ({ status: 500, error: e.message })),
        fetch(`${baseUrl}/api/nfl/predictToday`).catch(e => ({ status: 500, error: e.message }))
     ]);

     return NextResponse.json({
         success: true,
         message: 'Daily caches pre-warmed for all sports.',
         nbaStatus: nbaRes.status,
         mlbStatus: mlbRes.status,
         wnbaStatus: wnbaRes.status,
         nflStatus: nflRes.status,
         timestamp: new Date().toISOString()
     });
  } catch (err) {
     console.error('[CRON] Pre-warm failed', err);
     return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
