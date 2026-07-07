const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function runMigration() {
  console.log("Starting Over/Under PlayerHistory Migration...");

  // 1. Fetch all graded prediction logs
  const gradedLogs = await prisma.predictionLog.findMany({
    where: { graded: true, hit: { not: null } }
  });

  console.log(`Found ${gradedLogs.length} graded logs to process.`);

  // We will tally everything locally and then update the DB in bulk.
  const historyMap = {};

  for (const log of gradedLogs) {
    const { playerId, category, call, isHome, opponentAbbr, pitcherHandedness, hit, contextNote } = log;
    const key = `${playerId}_${category}`;

    if (!historyMap[key]) {
      historyMap[key] = {
        playerId,
        category,
        total: 0, hits: 0, misses: 0,
        overTotal: 0, overHits: 0, overMisses: 0,
        underTotal: 0, underHits: 0, underMisses: 0,
        homeHits: 0, homeMisses: 0,
        awayHits: 0, awayMisses: 0,
        opponentSplits: {},
        pitcherHandednessSplits: {},
        contextWarnings: []
      };
    }

    const h = historyMap[key];
    const isOver = call.includes('OVER');
    const isMiss = !hit;

    // Aggregate
    h.total++;
    if (hit) h.hits++; else h.misses++;

    // Over/Under
    if (isOver) {
      h.overTotal++;
      if (hit) h.overHits++; else h.overMisses++;
    } else {
      h.underTotal++;
      if (hit) h.underHits++; else h.underMisses++;
    }

    // Contextual
    if (hit) {
      if (isHome) h.homeHits++; else h.awayHits++;
    } else {
      if (isHome) h.homeMisses++; else h.awayMisses++;
    }

    // Opponent Splits
    const opp = opponentAbbr || "UNK";
    if (!h.opponentSplits[opp]) h.opponentSplits[opp] = { hits: 0, misses: 0 };
    if (hit) h.opponentSplits[opp].hits++; else h.opponentSplits[opp].misses++;

    // Pitcher Splits
    if (pitcherHandedness) {
      if (!h.pitcherHandednessSplits[pitcherHandedness]) {
        h.pitcherHandednessSplits[pitcherHandedness] = { hits: 0, misses: 0 };
      }
      if (hit) h.pitcherHandednessSplits[pitcherHandedness].hits++;
      else h.pitcherHandednessSplits[pitcherHandedness].misses++;
    }

    // Context Warnings
    if (isMiss && contextNote && !contextNote.includes("Pure Miss") && !contextNote.includes("DNP")) {
      h.contextWarnings.push(contextNote);
    }
  }

  console.log(`Rebuilt ${Object.keys(historyMap).length} unique PlayerHistory rows in memory. Writing to DB...`);

  let count = 0;
  for (const key of Object.keys(historyMap)) {
    const h = historyMap[key];
    
    const hitRate = h.total > 0 ? (h.hits / h.total) : 0;
    const overHitRate = h.overTotal > 0 ? (h.overHits / h.overTotal) : 0;
    const underHitRate = h.underTotal > 0 ? (h.underHits / h.underTotal) : 0;

    await prisma.playerHistory.upsert({
      where: { playerId_category: { playerId: h.playerId, category: h.category } },
      create: {
        playerId: h.playerId,
        category: h.category,
        total: h.total, hits: h.hits, misses: h.misses, hitRate,
        overTotal: h.overTotal, overHits: h.overHits, overMisses: h.overMisses, overHitRate,
        underTotal: h.underTotal, underHits: h.underHits, underMisses: h.underMisses, underHitRate,
        homeHits: h.homeHits, homeMisses: h.homeMisses, awayHits: h.awayHits, awayMisses: h.awayMisses,
        opponentSplits: h.opponentSplits, pitcherHandednessSplits: h.pitcherHandednessSplits,
        contextWarnings: h.contextWarnings
      },
      update: {
        total: h.total, hits: h.hits, misses: h.misses, hitRate,
        overTotal: h.overTotal, overHits: h.overHits, overMisses: h.overMisses, overHitRate,
        underTotal: h.underTotal, underHits: h.underHits, underMisses: h.underMisses, underHitRate,
        homeHits: h.homeHits, homeMisses: h.homeMisses, awayHits: h.awayHits, awayMisses: h.awayMisses,
        opponentSplits: h.opponentSplits, pitcherHandednessSplits: h.pitcherHandednessSplits,
        contextWarnings: h.contextWarnings
      }
    });
    count++;
    if (count % 100 === 0) console.log(`Migrated ${count} rows...`);
  }

  console.log("Migration Complete! All hit rates are now successfully separated into Over and Under buckets.");
}

runMigration()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
