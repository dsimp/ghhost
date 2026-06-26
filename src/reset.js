const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
   // Scratchpad to interact directly with Supabase via Prisma if you ever need to manually reset something
   // e.g. await prisma.predictionLog.updateMany({ ... })

   console.log('Reset complete');
}

main().finally(async () => {
   await prisma.$disconnect();
});
