import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = global;
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * GET /api/memory/player-history
 * Returns the full engine prediction audit trail & scientific accuracy breakdown
 * for a specific player and stat category.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const playerId = searchParams.get('playerId');
  const category = searchParams.get('category');
  const sport = searchParams.get('sport');

  if (!playerId || !category) {
    return NextResponse.json(
      { error: 'Missing required query parameters: playerId and category' },
      { status: 400 }
    );
  }

  try {
    const pidStr = String(playerId);

    // 1. Fetch pre-aggregated history summary if available
    const playerHistory = await prisma.playerHistory.findUnique({
      where: {
        playerId_category: {
          playerId: pidStr,
          category: category
        }
      }
    }).catch(() => null);

    // 2. Fetch all raw graded prediction logs for this player & category
    const logs = await prisma.predictionLog.findMany({
      where: {
        playerId: pidStr,
        category: category,
        graded: true
      },
      orderBy: [
        { dateKey: 'desc' },
        { createdAt: 'desc' }
      ]
    });

    // Filter out DNPs (hit === null and contextNote includes DNP)
    const validLogs = logs.filter(l => {
      if (l.hit === null && l.contextNote && l.contextNote.includes('DNP')) {
        return false; // Skip DNPs
      }
      return true;
    });

    const hits = validLogs.filter(l => l.hit === true);
    const misses = validLogs.filter(l => l.hit === false);
    const pushes = validLogs.filter(l => l.hit === null);

    const totalGraded = hits.length + misses.length;
    const trueHitRate = totalGraded > 0 ? (hits.length / totalGraded) * 100 : 0;

    // Over vs Under Splits
    const overLogs = validLogs.filter(l => l.call && l.call.includes('OVER'));
    const overGraded = overLogs.filter(l => l.hit !== null);
    const overHits = overLogs.filter(l => l.hit === true);
    const overHitRate = overGraded.length > 0 ? (overHits.length / overGraded.length) * 100 : 0;

    const underLogs = validLogs.filter(l => l.call && l.call.includes('UNDER'));
    const underGraded = underLogs.filter(l => l.hit !== null);
    const underHits = underLogs.filter(l => l.hit === true);
    const underHitRate = underGraded.length > 0 ? (underHits.length / underGraded.length) * 100 : 0;

    // Home vs Away Splits
    const homeLogs = validLogs.filter(l => l.isHome === true);
    const homeGraded = homeLogs.filter(l => l.hit !== null);
    const homeHits = homeLogs.filter(l => l.hit === true);
    const homeHitRate = homeGraded.length > 0 ? (homeHits.length / homeGraded.length) * 100 : 0;

    const awayLogs = validLogs.filter(l => l.isHome === false);
    const awayGraded = awayLogs.filter(l => l.hit !== null);
    const awayHits = awayLogs.filter(l => l.hit === true);
    const awayHitRate = awayGraded.length > 0 ? (awayHits.length / awayGraded.length) * 100 : 0;

    // Target vs Actual Variance Stats
    const logsWithResults = validLogs.filter(l => l.actualResult !== null && l.target !== null);
    let avgTarget = 0;
    let avgActual = 0;
    let rmse = 0;

    if (logsWithResults.length > 0) {
      const sumTarget = logsWithResults.reduce((acc, l) => acc + l.target, 0);
      const sumActual = logsWithResults.reduce((acc, l) => acc + l.actualResult, 0);
      avgTarget = +(sumTarget / logsWithResults.length).toFixed(1);
      avgActual = +(sumActual / logsWithResults.length).toFixed(1);

      const squaredDiffsSum = logsWithResults.reduce((acc, l) => acc + Math.pow(l.actualResult - l.target, 2), 0);
      rmse = +(Math.sqrt(squaredDiffsSum / logsWithResults.length)).toFixed(2);
    }

    // Chronological Streak Array (most recent 10 games, chronologically ordered left-to-right)
    const recentTen = validLogs.slice(0, 10).reverse().map(l => {
      if (l.hit === true) return { status: 'HIT', date: l.dateKey, call: l.call };
      if (l.hit === false) return { status: 'MISS', date: l.dateKey, call: l.call };
      return { status: 'PUSH', date: l.dateKey, call: l.call };
    });

    const playerName = logs[0]?.playerName || 'Player';
    const playerSport = sport || logs[0]?.sport || 'SPORT';

    return NextResponse.json({
      player: {
        id: pidStr,
        name: playerName,
        sport: playerSport,
        category: category
      },
      summary: {
        totalPlays: totalGraded,
        hits: hits.length,
        misses: misses.length,
        pushes: pushes.length,
        hitRate: +trueHitRate.toFixed(1),
        
        over: {
          total: overGraded.length,
          hits: overHits.length,
          hitRate: +overHitRate.toFixed(1)
        },
        under: {
          total: underGraded.length,
          hits: underHits.length,
          hitRate: +underHitRate.toFixed(1)
        },
        home: {
          total: homeGraded.length,
          hits: homeHits.length,
          hitRate: +homeHitRate.toFixed(1)
        },
        away: {
          total: awayGraded.length,
          hits: awayHits.length,
          hitRate: +awayHitRate.toFixed(1)
        },
        precision: {
          avgTarget,
          avgActual,
          avgDiff: +(avgActual - avgTarget).toFixed(1),
          rmse
        },
        streak: recentTen
      },
      history: validLogs.map(l => {
        const target = l.target || 0;
        const actual = l.actualResult !== null ? l.actualResult : null;
        const diff = actual !== null ? +(actual - target).toFixed(1) : null;
        return {
          id: l.id,
          dateKey: l.dateKey,
          team: l.teamAbbr || '—',
          opponent: l.opponentAbbr || '—',
          isHome: l.isHome,
          call: l.call,
          target: target,
          actualResult: actual,
          diff: diff,
          confidence: l.confidence,
          hit: l.hit,
          contextNote: l.contextNote || null
        };
      })
    });
  } catch (error) {
    console.error('Failed to fetch player prediction audit history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch player history', message: error.message },
      { status: 500 }
    );
  }
}
