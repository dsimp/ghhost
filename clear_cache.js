const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const deleted = await prisma.dailyCache.deleteMany({
    where: { sport: 'WNBA' }
  });
  console.log(`Deleted ${deleted.count} WNBA cache entries.`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
