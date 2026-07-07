/**
 * ═══════════════════════════════════════════════════════════════════
 * GHHOST V2 — THE AUTOPSY ENGINE (Phase 8)
 * ═══════════════════════════════════════════════════════════════════
 *
 * This engine runs retrospectively over the graded `PredictionLog`s.
 * It detects scenarios where the Assembly Line's prediction was off
 * by a significant margin and generates a qualitative `ScoutingNote`.
 * 
 * These notes are stored in the Data Lake and fed directly into the
 * Assembly Line (via Memory Engine) and the Insights Terminal.
 */

import { PrismaClient } from '@prisma/client';

const globalForPrisma = global;
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export async function runNightlyAutopsy(sport, targetDateKey) {
  console.log(`[Autopsy Engine] Initiating autopsy for ${sport} on ${targetDateKey}...`);

  // 1. Fetch graded logs that missed (hit = false)
  const missedLogs = await prisma.predictionLog.findMany({
    where: {
      sport: sport,
      dateKey: targetDateKey,
      graded: true,
      hit: false
    }
  });

  if (missedLogs.length === 0) {
    console.log(`[Autopsy Engine] No misses found for ${targetDateKey}. Ghhost was perfect.`);
    return { success: true, notesCreated: 0 };
  }

  let notesCreated = 0;

  // 2. Analyze each miss to generate notes
  for (const log of missedLogs) {
    // Basic logic for generating a note.
    if (log.actualResult === null) continue;

    const diff = Math.abs(log.target - log.actualResult);
    const diffPct = diff / (log.target || 1); // Avoid div by zero

    // Only create a Scouting Note for major deviations (> 30% miss)
    if (diffPct > 0.3) {
      const contextHash = log.isHome ? 'HOME_GAME' : 'AWAY_GAME';
      const trend = log.actualResult > log.target ? 'overperformed' : 'underperformed';
      
      // If we projected an OVER, and they hit UNDER, we want a negative adjustment
      // If we projected an UNDER, and they hit OVER, we want a positive adjustment
      const adj = log.actualResult > log.target ? 1.0 : -1.0; 

      const noteText = `Significantly ${trend} their ${log.category} projection (${log.actualResult} vs target ${log.target}) in a recent ${contextHash.replace('_', ' ').toLowerCase()}.`;

      // Upsert into ScoutingNote table
      await prisma.scoutingNote.upsert({
         where: {
           playerId_contextHash_category: {
             playerId: log.playerId,
             contextHash: contextHash,
             category: log.category
           }
         },
         update: {
           note: noteText,
           adjustment: adj,
           confidence: { increment: 5 } // Increase confidence the more this happens
         },
         create: {
           sport: sport,
           playerId: log.playerId,
           playerName: log.playerName,
           category: log.category,
           contextHash: contextHash,
           note: noteText,
           adjustment: adj,
           confidence: 10
         }
      });
      notesCreated++;
    }
  }

  console.log(`[Autopsy Engine] Autopsy complete. Generated ${notesCreated} Scouting Notes.`);
  return { success: true, notesCreated };
}
