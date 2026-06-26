const { PrismaClient } = require('@prisma/client');
const fs = require('fs').promises;
const path = require('path');

const prisma = new PrismaClient();

async function main() {
  console.log('Starting Migration from Local JSON to PostgreSQL...');

  const memoryPath = path.join(__dirname, 'data', 'ghhost_memory.json');
  
  let vault;
  try {
    const rawData = await fs.readFile(memoryPath, 'utf8');
    vault = JSON.parse(rawData);
  } catch (err) {
    console.error('Failed to read ghhost_memory.json. Ensure the file exists.', err);
    process.exit(1);
  }

  // 1. Migrate Player History
  if (vault.playerHistory) {
    console.log('Migrating Player History...');
    const historyEntries = [];

    for (const [playerId, categories] of Object.entries(vault.playerHistory)) {
      for (const [category, stats] of Object.entries(categories)) {
        historyEntries.push({
          playerId,
          category,
          total: stats.total || 0,
          hits: stats.hits || 0,
          misses: stats.misses || 0,
          hitRate: stats.hitRate || 0,
          contextWarnings: stats.contextWarnings || []
        });
      }
    }

    // Insert in batches
    for (const entry of historyEntries) {
      await prisma.playerHistory.upsert({
        where: {
          playerId_category: { playerId: entry.playerId, category: entry.category }
        },
        update: {
          total: entry.total,
          hits: entry.hits,
          misses: entry.misses,
          hitRate: entry.hitRate,
          contextWarnings: entry.contextWarnings
        },
        create: entry
      });
    }
    console.log(`Successfully migrated ${historyEntries.length} Player History records.`);
  }

  // 2. Migrate Predictions
  if (vault.predictions) {
    console.log('Clearing existing predictions to prevent duplicates...');
    await prisma.predictionLog.deleteMany({});
    console.log('Migrating Predictions...');
    let predictionCount = 0;

    for (const [dateKey, sportsData] of Object.entries(vault.predictions)) {
      for (const [sport, players] of Object.entries(sportsData)) {
        for (const player of players) {
          for (const ev of player.evaluations) {
            
            await prisma.predictionLog.create({
              data: {
                dateKey,
                sport,
                playerId: String(player.playerId),
                playerName: player.playerName || player.player || 'Unknown',
                teamAbbr: player.team || null,
                opponentAbbr: player.opponentAbbr || null,
                isHome: player.isHome || false,
                category: ev.category,
                call: ev.call,
                target: parseFloat(ev.target || ev.projectedTarget || 0),
                confidence: parseInt(ev.confidence),
                graded: ev.graded || false,
                hit: ev.hit !== undefined ? ev.hit : null,
                actualResult: ev.actualResult != null ? parseFloat(ev.actualResult) : null,
                contextNote: ev.contextNote || null
              }
            });
            predictionCount++;
          }
        }
      }
    }
    console.log(`Successfully migrated ${predictionCount} Prediction records.`);
  }

  console.log('Migration Complete! Your local memory has been safely moved to Supabase.');
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
