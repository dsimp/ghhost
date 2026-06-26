import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export const dynamic = 'force-dynamic';

const globalForPrisma = global;
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export async function GET() {
  try {
    const allPredictions = await prisma.predictionLog.findMany({
       orderBy: { dateKey: 'desc' }
    });

    const allHistory = await prisma.playerHistory.findMany();

    const vault = { predictions: {}, playerHistory: {} };
    
    for (const log of allPredictions) {
       if (!vault.predictions[log.dateKey]) vault.predictions[log.dateKey] = {};
       if (!vault.predictions[log.dateKey][log.sport]) vault.predictions[log.dateKey][log.sport] = [];
       const sportArr = vault.predictions[log.dateKey][log.sport];

       let playerPrediction = sportArr.find(p => p.playerId === log.playerId);
       if (!playerPrediction) {
          playerPrediction = { 
             playerId: log.playerId, 
             player: log.playerName,
             team: log.teamAbbr,
             opponentAbbr: log.opponentAbbr,
             isHome: log.isHome,
             evaluations: [] 
          };
          sportArr.push(playerPrediction);
       }
       playerPrediction.evaluations.push({
         _id: log.id,
         category: log.category,
         call: log.call,
         target: log.target,
         confidence: log.confidence,
         graded: log.graded,
         hit: log.hit,
         actualResult: log.actualResult,
         contextNote: log.contextNote,
       });
    }

    for (const h of allHistory) {
       if (!vault.playerHistory[h.playerId]) vault.playerHistory[h.playerId] = {};
       vault.playerHistory[h.playerId][h.category] = {
          total: h.total, hits: h.hits, misses: h.misses, hitRate: h.hitRate, contextWarnings: h.contextWarnings || []
       };
    }

    return NextResponse.json(vault);
  } catch (error) {
    console.error("Failed to fetch memory history from DB:", error);
    return NextResponse.json({ error: "Failed to read DB." }, { status: 500 });
  }
}
