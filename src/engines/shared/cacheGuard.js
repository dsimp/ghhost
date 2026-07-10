// src/engines/shared/cacheGuard.js
// Cache Validation Guard — prevents writing bad data to DailyCache

import { PrismaClient } from '@prisma/client';

const globalForPrisma = global;
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * Safely writes prediction payload to DailyCache.
 * 
 * Rules:
 * 1. If the new payload has ZERO evaluations across all players, refuse to write.
 * 2. If the new payload has significantly fewer evaluations than the existing cache, keep the old one.
 * 3. Always log what happened for observability.
 * 
 * @param {string} sport - "NBA", "WNBA", "MLB", "NFL"
 * @param {string} gameDate - "2026-07-09" format
 * @param {object} payload - { matchups: [], players: [] }
 * @returns {object} { written: boolean, reason: string }
 */
export async function safeWriteCache(sport, gameDate, payload) {
   const players = payload?.players || [];
   const totalEvals = players.reduce((sum, p) => sum + (p.evaluations?.length || 0), 0);
   const playersWithEvals = players.filter(p => p.evaluations?.length > 0).length;

   // GUARD 1: If we generated players but ZERO evaluations, something is wrong — don't cache
   if (players.length > 0 && totalEvals === 0) {
      console.error(`[CacheGuard] ❌ BLOCKED write for ${sport} on ${gameDate}: ${players.length} players but 0 evaluations. Likely Odds API or engine failure.`);
      return { written: false, reason: 'zero_evaluations' };
   }

   // GUARD 2: Check if existing cache is better
   try {
      const existing = await prisma.dailyCache.findUnique({
         where: { sport_gameDate: { sport, gameDate } }
      });

      if (existing) {
         const existingPlayers = existing.payload?.players || [];
         const existingEvals = existingPlayers.reduce((sum, p) => sum + (p.evaluations?.length || 0), 0);

         // If existing cache has evaluations and new one has significantly fewer (>50% drop), keep old
         if (existingEvals > 0 && totalEvals < existingEvals * 0.5) {
            console.warn(`[CacheGuard] ⚠️ BLOCKED write for ${sport}: new payload has ${totalEvals} evals vs existing ${existingEvals}. Keeping existing cache.`);
            return { written: false, reason: 'regression_detected' };
         }
      }
   } catch (e) {
      // If we can't read existing cache, proceed with write
   }

   // GUARD 3: Write the cache
   try {
      await prisma.dailyCache.upsert({
         where: { sport_gameDate: { sport, gameDate } },
         update: { timestamp: Date.now(), payload },
         create: { sport, gameDate, timestamp: Date.now(), payload }
      });
      console.log(`[CacheGuard] ✅ ${sport} cache written: ${playersWithEvals}/${players.length} players with evals, ${totalEvals} total evaluations.`);
      return { written: true, reason: 'success' };
   } catch (e) {
      console.error(`[CacheGuard] Failed to write ${sport} cache:`, e);
      return { written: false, reason: 'db_error' };
   }
}
