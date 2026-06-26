import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://postgres.pnhvxlqvwhwvrkjnkthh:Simp%40work1122@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true',
    },
  },
});

async function main() {
  try {
    const user = await prisma.user.findFirst();
    console.log('Successfully connected to 6543 with .pnhvxlqvwhwvrkjnkthh', user);
  } catch (e) {
    console.error('Error on 6543 with .pnhvxlqvwhwvrkjnkthh:', e.message);
  }

  try {
    const prisma2 = new PrismaClient({
      datasources: {
        db: {
          url: 'postgresql://postgres:Simp%40work1122@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true',
        },
      },
    });
    const user2 = await prisma2.user.findFirst();
    console.log('Successfully connected to 6543 with JUST postgres', user2);
  } catch (e) {
    console.error('Error on 6543 with JUST postgres:', e.message);
  }

  try {
    const prisma3 = new PrismaClient({
      datasources: {
        db: {
          url: 'postgresql://postgres:Simp%40work1122@aws-1-us-east-1.pooler.supabase.com:5432/postgres',
        },
      },
    });
    const user3 = await prisma3.user.findFirst();
    console.log('Successfully connected to 5432 with JUST postgres', user3);
  } catch (e) {
    console.error('Error on 5432 with JUST postgres:', e.message);
  }

  try {
    const prisma4 = new PrismaClient({
      datasources: {
        db: {
          url: 'postgresql://postgres.pnhvxlqvwhwvrkjnkthh:Simp%40work1122@aws-1-us-east-1.pooler.supabase.com:5432/postgres',
        },
      },
    });
    const user4 = await prisma4.user.findFirst();
    console.log('Successfully connected to 5432 with .pnhvxlqvwhwvrkjnkthh', user4);
  } catch (e) {
    console.error('Error on 5432 with .pnhvxlqvwhwvrkjnkthh:', e.message);
  }
}

main().catch(console.error);
