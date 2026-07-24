import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getFullPlayerHistory } from '@/app/api/memory/vault';

const globalForPrisma = global;
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * Global Top 20 Genius Board — Cross-Sport Leaderboard
 * 
 * Requirements:
 * 1. Show the top 20 athletes across ALL sports (NBA, WNBA, MLB, NFL)
 * 2. Ranked by prediction accuracy (hit rate)
 * 3. Must be playing TODAY (exist in today's prediction cache)
 * 4. Minimum 3 graded predictions (to have meaningful sample)
 * 5. DNPs (hit=null) are excluded from hit rate calculation
 * 6. Weighted score = accuracy × log(total) to reward precision AND volume
 */
export async function GET(request) {
   const { searchParams } = new URL(request.url);
   const dateStr = searchParams.get('date') || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }); // Trigger recompile

   try {
      // Get today's cached predictions from ALL sports
      const caches = await prisma.dailyCache.findMany({
         where: { gameDate: dateStr }
      });

      // Get unified PlayerHistory from vault (100% sync with all sport engines)
      const historyMap = await getFullPlayerHistory();

      let candidates = [];
      let unfilteredWarning = false;

      caches.forEach(cache => {
         const sport = cache.sport;
         const data = cache.payload;

         if (data && data.players && data.players.length > 0) {
            let cacheHasEvals = false;
            data.players.forEach(p => {
               if (!p.evaluations) return;
               
               const playerId = String(p.playerId);
               p.evaluations.forEach(ev => {
                  cacheHasEvals = true;
                  // Look up actual history (DNP-excluded)
                  const playerHist = historyMap[playerId]?.[ev.category];
                  
                  let accuracy, totalGames;
                  if (playerHist && playerHist.total >= 3) {
                     accuracy = playerHist.hitRate;
                     totalGames = playerHist.total;
                  } else {
                     return; // Skip — not enough graded data
                  }

                  // QUALITY FILTERS
                  if (accuracy < 0.55) return; // Min 55% accuracy

                  // Weighted score: accuracy × log(sample_size)
                  const weightedScore = accuracy * Math.log2(totalGames + 1);

                  candidates.push({
                     ...ev,
                     player: p.player,
                     team: p.team,
                     opponent: p.opponentAbbr || p.opponent,
                     sport: sport,
                     category: ev.category,
                     call: ev.call,
                     target: ev.projectedTarget,
                     accuracy: (accuracy * 100).toFixed(0),
                     confidence: ev.confidence,
                     totalGames: totalGames,
                     weightedScore: weightedScore
                  });
               });
            });
            if (!cacheHasEvals) {
                unfilteredWarning = true;
            }
         }
      });

      // Split into overs and unders
      const overCandidates = candidates.filter(c => c.call.includes('OVER'));
      const underCandidates = candidates.filter(c => c.call.includes('UNDER'));

      // Deduplicate each: one entry per player-sport (take their best category)
      const dedupList = (list) => {
         const best = {};
         list.forEach(c => {
            const key = `${c.player}-${c.sport}-${c.category}`;
            if (!best[key] || c.weightedScore > best[key].weightedScore) {
               best[key] = c;
            }
         });
         return Object.values(best).sort((a, b) => {
            if (b.weightedScore !== a.weightedScore) return b.weightedScore - a.weightedScore;
            return parseFloat(b.accuracy) - parseFloat(a.accuracy);
         });
      };

      const topOvers = dedupList(overCandidates).slice(0, 25);
      const topUnders = dedupList(underCandidates).slice(0, 25);

      // Legacy: combined top 20 for backward compatibility
      const allDeduped = dedupList(candidates);
      const topLocks = allDeduped.slice(0, 20);

      return NextResponse.json({ 
         date: dateStr, 
         topLocks: topLocks,
         topOvers: topOvers,
         topUnders: topUnders,
         totalCandidates: candidates.length,
         sportsRepresented: [...new Set(candidates.map(c => c.sport))],
         unfilteredWarning: unfilteredWarning
      });

   } catch (error) {
      console.error("Global Top 20 Error:", error);
      return NextResponse.json({ error: "Failed to compile top 20 board." }, { status: 500 });
   }
}
