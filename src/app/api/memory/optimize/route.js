import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = global;
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * GHHOST NIGHTLY OPTIMIZER — Phase 3: Self-Correcting Feedback Loop
 * 
 * This route processes all graded but un-optimized predictions and:
 * 1. Computes error magnitudes (actualResult - target)
 * 2. Buckets errors by context (B2B, travel, defense, streaks, etc.)
 * 3. Updates LearnedAdjustment records using exponential moving average
 * 4. Marks predictions as optimized
 * 
 * Trigger: Call via cron job (Vercel Cron) at 2:00 AM CT nightly,
 * or manually via GET /api/memory/optimize
 */

// The learning rate controls how fast we adapt to new data
// 0.15 = moderate responsiveness (balances stability with adaptation)
const LEARNING_RATE = 0.15;

// Minimum predictions in a bucket before we start applying adjustments
const MIN_BUCKET_SIZE = 5;

// Recency half-life in days (older predictions count less)
const RECENCY_HALF_LIFE = 23;

export async function GET() {
  try {
    // 1. Fetch all graded but un-optimized predictions
    const predictions = await prisma.predictionLog.findMany({
      where: { graded: true, optimized: false },
      orderBy: { createdAt: 'desc' }
    });

    if (predictions.length === 0) {
      return NextResponse.json({ 
        message: 'No new graded predictions to optimize.', 
        processed: 0 
      });
    }

    // 2. Bucket predictions by context
    const buckets = {}; // { "NBA|b2b_PTS": [{ error, recencyWeight }, ...] }
    
    predictions.forEach(pred => {
      if (pred.actualResult === null || pred.actualResult === undefined) return;
      
      const error = pred.actualResult - pred.target;
      const pctError = pred.target > 0 ? error / pred.target : 0;
      
      // Recency weighting: recent predictions matter more
      const daysSince = (Date.now() - new Date(pred.createdAt).getTime()) / 86400000;
      const recencyWeight = Math.exp(-0.693 * daysSince / RECENCY_HALF_LIFE);
      
      const entry = { error, pctError, recencyWeight, hit: pred.hit };
      const sport = pred.sport;
      const cat = pred.category;
      
      // Bucket: Overall per category
      addToBucket(buckets, sport, `overall_${cat}`, entry);
      
      // Bucket: Home vs Away
      addToBucket(buckets, sport, pred.isHome ? `home_${cat}` : `away_${cat}`, entry);
      
      // Bucket: By opponent
      if (pred.opponentAbbr) {
        addToBucket(buckets, sport, `vs_${pred.opponentAbbr}_${cat}`, entry);
      }
      
      // Bucket: By confidence tier
      if (pred.confidence >= 80) {
        addToBucket(buckets, sport, `high_conf_${cat}`, entry);
      } else if (pred.confidence <= 40) {
        addToBucket(buckets, sport, `low_conf_${cat}`, entry);
      }
      
      // Bucket: By call direction
      addToBucket(buckets, sport, `${pred.call.toLowerCase()}_${cat}`, entry);
      
      // Parse contextNote for situational buckets
      const note = pred.contextNote || '';
      if (note.includes('Back-to-Back') || note.includes('B2B')) {
        addToBucket(buckets, sport, `b2b_${cat}`, entry);
      }
      if (note.includes('Travel') || note.includes('✈️')) {
        addToBucket(buckets, sport, `travel_${cat}`, entry);
      }
      if (note.includes('Layoff') || note.includes('Rust')) {
        addToBucket(buckets, sport, `layoff_${cat}`, entry);
      }
    });

    // 3. Compute and upsert learned adjustments
    let updatedBuckets = 0;
    const adjustmentOps = [];
    
    for (const [key, entries] of Object.entries(buckets)) {
      const [sport, bucket] = key.split('|');
      
      // Compute weighted mean percentage error
      let totalWeight = 0;
      let weightedErrorSum = 0;
      
      entries.forEach(e => {
        weightedErrorSum += e.pctError * e.recencyWeight;
        totalWeight += e.recencyWeight;
      });
      
      const weightedMeanPctError = totalWeight > 0 ? weightedErrorSum / totalWeight : 0;
      
      // Fetch existing adjustment (if any)
      const existing = await prisma.learnedAdjustment.findUnique({
        where: { sport_bucket: { sport, bucket } }
      });
      
      const oldAdj = existing?.adjustment || 0;
      const oldSamples = existing?.sampleSize || 0;
      const newSamples = oldSamples + entries.length;
      
      // Exponential Moving Average update
      // New adjustment = old * (1 - lr) + observed_error * lr
      // We cap the adjustment to ±15% to prevent runaway corrections
      let newAdj;
      if (newSamples >= MIN_BUCKET_SIZE) {
        newAdj = oldAdj * (1 - LEARNING_RATE) + weightedMeanPctError * LEARNING_RATE;
        newAdj = Math.max(-0.15, Math.min(0.15, newAdj));
      } else {
        // Not enough data yet — store the error but don't activate
        newAdj = 0;
      }
      
      adjustmentOps.push(
        prisma.learnedAdjustment.upsert({
          where: { sport_bucket: { sport, bucket } },
          update: { 
            adjustment: newAdj, 
            sampleSize: newSamples,
            meanError: weightedMeanPctError
          },
          create: { 
            sport, 
            bucket, 
            adjustment: newAdj, 
            sampleSize: newSamples,
            meanError: weightedMeanPctError
          }
        })
      );
      updatedBuckets++;
    }
    
    // Execute all upserts in a transaction
    await prisma.$transaction(adjustmentOps);
    
    // 4. Mark all processed predictions as optimized
    const predIds = predictions.map(p => p.id);
    await prisma.predictionLog.updateMany({
      where: { id: { in: predIds } },
      data: { optimized: true }
    });

    // 5. Build summary report
    const summary = {
      message: `Ghhost Brain optimized successfully.`,
      processed: predictions.length,
      bucketsUpdated: updatedBuckets,
      timestamp: new Date().toISOString(),
      topAdjustments: await getTopAdjustments()
    };

    return NextResponse.json(summary);
    
  } catch (error) {
    console.error('Optimizer failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function addToBucket(buckets, sport, bucket, entry) {
  const key = `${sport}|${bucket}`;
  if (!buckets[key]) buckets[key] = [];
  buckets[key].push(entry);
}

async function getTopAdjustments() {
  try {
    const top = await prisma.learnedAdjustment.findMany({
      where: { sampleSize: { gte: MIN_BUCKET_SIZE } },
      orderBy: { adjustment: 'asc' },
      take: 20
    });
    return top.map(a => ({
      sport: a.sport,
      bucket: a.bucket,
      adjustment: `${(a.adjustment * 100).toFixed(2)}%`,
      samples: a.sampleSize,
      meanError: `${(a.meanError * 100).toFixed(2)}%`
    }));
  } catch {
    return [];
  }
}
