import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = global;
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export async function GET(request) {
    const dateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });

    try {
        const caches = await prisma.dailyCache.findMany({
            where: { gameDate: dateStr }
        });

        const status = {};
        let allHealthy = true;

        const expectedSports = ['NBA', 'WNBA', 'MLB', 'NFL'];
        
        for (const sport of expectedSports) {
            const cache = caches.find(c => c.sport === sport);
            if (!cache) {
                status[sport] = { state: 'MISSING', message: 'No cache for today' };
                allHealthy = false;
                continue;
            }

            const players = cache.payload?.players || [];
            const playersWithEvals = players.filter(p => p.evaluations?.length > 0).length;

            if (players.length > 0 && playersWithEvals === 0) {
                status[sport] = { state: 'UNFILTERED', message: `${players.length} players, but 0 evaluations. Odds API likely failed or is out of credits.` };
                allHealthy = false;
            } else {
                status[sport] = { state: 'HEALTHY', message: `${playersWithEvals}/${players.length} players have evaluations.` };
            }
        }

        return NextResponse.json({
            date: dateStr,
            overall: allHealthy ? 'HEALTHY' : 'DEGRADED',
            sports: status
        });

    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
