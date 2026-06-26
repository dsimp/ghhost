import { PrismaClient } from '@prisma/client';

async function main() {
  try {
    const prisma1 = new PrismaClient({
      datasources: {
        db: {
          url: 'postgresql://postgres.pnhvxlqvwhwvrkjnkthh:Simp%40work1122@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true',
        },
      },
    });
    const user1 = await prisma1.user.findFirst();
    console.log('Success aws-0 6543 with .pnhvx', user1);
  } catch (e) {
    console.error('Error aws-0 6543 .pnhvx:', e.message);
  }

  try {
    const prisma2 = new PrismaClient({
      datasources: {
        db: {
          url: 'postgresql://postgres.pnhvxlqvwhwvrkjnkthh:Simp%40work1122@aws-0-us-east-1.pooler.supabase.com:5432/postgres',
        },
      },
    });
    const user2 = await prisma2.user.findFirst();
    console.log('Success aws-0 5432 with .pnhvx', user2);
  } catch (e) {
    console.error('Error aws-0 5432 .pnhvx:', e.message);
  }
}

main().catch(console.error);
