import { NextResponse } from 'next/server';
import { fetchNBA } from '../../nba/fetchNBA';
import { fetchMLB } from '../../mlb/fetchMLB';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = global;
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * MLB category → gameLog stat key mapping
 * Hitter stats use the hitting gameLog; pitcher stats use the pitching gameLog
 */
const MLB_STAT_MAP = {
  'H': 'hits', 'TB': 'totalBases', 'R': 'runs', 'RBI': 'rbi',
  'HR': 'homeRuns', 'SB': 'stolenBases', 'BB': 'baseOnBalls',
  'K': 'strikeOuts', 'ER': 'earnedRuns', 'HA': 'hits', 'IP': 'inningsPitched'
};
const MLB_PITCHER_CATS = new Set(['K', 'ER', 'HA', 'BB', 'IP']);

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const specificDate = searchParams.get('date'); 

    let gradedCount = 0;
    let dnpCount = 0;
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });

    const whereClause = { graded: false };
    if (specificDate) {
      whereClause.dateKey = specificDate;
    } else {
      // Grade all past days that haven't been graded yet
      whereClause.dateKey = { lt: todayStr };
    }

    const pendingLogs = await prisma.predictionLog.findMany({ where: whereClause });
    if (pendingLogs.length === 0) {
      return NextResponse.json({ message: 'No pending predictions to grade.', gradedCount: 0, dnpCount: 0 });
    }

    // Group logs by date -> sport -> player
    const vault = { predictions: {}, playerHistory: {} };
    for (const log of pendingLogs) {
       if (!vault.predictions[log.dateKey]) vault.predictions[log.dateKey] = {};
       if (!vault.predictions[log.dateKey][log.sport]) vault.predictions[log.dateKey][log.sport] = [];
       
       const sportArr = vault.predictions[log.dateKey][log.sport];
       let playerPrediction = sportArr.find(p => p.playerId === log.playerId);
       if (!playerPrediction) {
          playerPrediction = { playerId: log.playerId, evaluations: [] };
          sportArr.push(playerPrediction);
       }
       playerPrediction.evaluations.push({
         _id: log.id,
         category: log.category,
         call: log.call,
         target: log.target,
         graded: log.graded,
         isHome: log.isHome,
         opponentAbbr: log.opponentAbbr
       });
    }

    // Pre-load all history into memory
    const allHistory = await prisma.playerHistory.findMany();
    for (const h of allHistory) {
       if (!vault.playerHistory[h.playerId]) vault.playerHistory[h.playerId] = {};
       vault.playerHistory[h.playerId][h.category] = {
          total: h.total, hits: h.hits, misses: h.misses, contextWarnings: h.contextWarnings || [],
          homeHits: h.homeHits || 0, homeMisses: h.homeMisses || 0,
          awayHits: h.awayHits || 0, awayMisses: h.awayMisses || 0,
          opponentSplits: h.opponentSplits || {},
          pitcherHandednessSplits: h.pitcherHandednessSplits || {}
       };
    }

    /**
     * Helper: update memory history for a single evaluation
     * ONLY called for players who actually played — DNPs are excluded from history
     */
    function updateHistory(playerId, evaluation, isHit) {
       if (!vault.playerHistory[playerId]) vault.playerHistory[playerId] = {};
       if (!vault.playerHistory[playerId][evaluation.category]) {
          vault.playerHistory[playerId][evaluation.category] = { 
             total: 0, hits: 0, misses: 0, contextWarnings: [],
             homeHits: 0, homeMisses: 0, awayHits: 0, awayMisses: 0, opponentSplits: {}, pitcherHandednessSplits: {}
          };
       }
       const historyRef = vault.playerHistory[playerId][evaluation.category];
       historyRef.total++;
       
       const opp = evaluation.opponentAbbr || "UNK";
       if (!historyRef.opponentSplits[opp]) historyRef.opponentSplits[opp] = { hits: 0, misses: 0 };
       
       let handRef = null;
       if (evaluation.pitcherHandedness) {
           if (!historyRef.pitcherHandednessSplits[evaluation.pitcherHandedness]) {
               historyRef.pitcherHandednessSplits[evaluation.pitcherHandedness] = { hits: 0, misses: 0 };
           }
           handRef = historyRef.pitcherHandednessSplits[evaluation.pitcherHandedness];
       }

       const isOver = evaluation.call === 'OVER';
       if (isOver) {
          historyRef.overTotal = (historyRef.overTotal || 0) + 1;
       } else {
          historyRef.underTotal = (historyRef.underTotal || 0) + 1;
       }

       if (isHit) {
          historyRef.hits++;
          if (evaluation.isHome) historyRef.homeHits++; else historyRef.awayHits++;
          historyRef.opponentSplits[opp].hits++;
          if (handRef) handRef.hits++;
          
          if (isOver) historyRef.overHits = (historyRef.overHits || 0) + 1;
          else historyRef.underHits = (historyRef.underHits || 0) + 1;
       } else {
          historyRef.misses++;
          if (evaluation.isHome) historyRef.homeMisses++; else historyRef.awayMisses++;
          historyRef.opponentSplits[opp].misses++;
          if (handRef) handRef.misses++;
          
          if (isOver) historyRef.overMisses = (historyRef.overMisses || 0) + 1;
          else historyRef.underMisses = (historyRef.underMisses || 0) + 1;

          if (evaluation.contextNote && !evaluation.contextNote.includes("Pure Miss")) {
             historyRef.contextWarnings.push(evaluation.contextNote);
          }
       }
    }

    /**
     * Helper: mark a player's predictions as DNP — excluded from hit rate entirely
     */
    async function markDNP(evaluations) {
       for (const evaluation of evaluations) {
          await prisma.predictionLog.update({
            where: { id: evaluation._id },
            data: { graded: true, hit: null, actualResult: null, contextNote: "DNP / No Game Data" }
          });
          dnpCount++;
       }
    }

    // Process each date
    for (const [dateKey, sportsData] of Object.entries(vault.predictions)) {
      
      // ═══════════════════════ GRADE NBA ═══════════════════════
      if (sportsData.NBA && sportsData.NBA.length > 0) {
        const result = await gradeBasketball(sportsData.NBA, dateKey, '00', '2025-26', updateHistory);
        gradedCount += result.graded;
        dnpCount += result.dnp;
      }

      // ═══════════════════════ GRADE WNBA ═══════════════════════
      if (sportsData.WNBA && sportsData.WNBA.length > 0) {
        const result = await gradeBasketball(sportsData.WNBA, dateKey, '10', '2026', updateHistory);
        gradedCount += result.graded;
        dnpCount += result.dnp;
      }

      // ═══════════════════════ GRADE MLB ═══════════════════════
      if (sportsData.MLB && sportsData.MLB.length > 0) {
        for (const playerPrediction of sportsData.MLB) {
          const ungraded = playerPrediction.evaluations;
          if (ungraded.length === 0) continue;

          try {
             await new Promise(resolve => setTimeout(resolve, 300));
             
             // Determine if this player is a pitcher or hitter from their categories
             const isPitcher = ungraded.some(e => MLB_PITCHER_CATS.has(e.category));
             const statGroup = isPitcher ? 'pitching' : 'hitting';
             
             const peopleData = await fetchMLB('people', {
                personIds: playerPrediction.playerId,
                hydrate: `stats(group=[${statGroup}],type=[gameLog],season=2026)`
             });

             const player = peopleData?.people?.[0];
             let actualGameLog = null;
             
             player?.stats?.forEach(sg => {
                if (sg.type.displayName === 'gameLog') {
                   actualGameLog = sg.splits.find(s => s.date === dateKey);
                }
             });

             if (actualGameLog) {
                for (const evaluation of ungraded) {
                   const rawStatKey = MLB_STAT_MAP[evaluation.category] || evaluation.category.toLowerCase();
                   let actualStat;
                   
                   // IP comes as string like '6.0', parse with float
                   if (evaluation.category === 'IP') {
                      actualStat = parseFloat(actualGameLog.stat[rawStatKey]) || 0;
                   } else {
                      actualStat = parseInt(actualGameLog.stat[rawStatKey]) || 0;
                   }
                   
                   const targetLine = parseFloat(evaluation.target);
                   
                   let isHit = false;
                   if (evaluation.call === 'OVER') isHit = actualStat > targetLine;
                   if (evaluation.call === 'UNDER') isHit = actualStat < targetLine;

                   evaluation.contextNote = null;
                   if (!isHit) {
                      if (!isPitcher) {
                         const atBats = parseInt(actualGameLog.stat.atBats) || 0;
                         if (evaluation.call === 'OVER' && atBats < 3) {
                            evaluation.contextNote = `Subbed Out Early (${atBats} AB)`;
                         } else {
                            evaluation.contextNote = "Pure Miss";
                         }
                      } else {
                         const ip = parseFloat(actualGameLog.stat.inningsPitched) || 0;
                         if (ip < 4) {
                            evaluation.contextNote = `Early Hook (${ip} IP)`;
                         } else {
                            evaluation.contextNote = "Pure Miss";
                         }
                      }
                   }

                   updateHistory(playerPrediction.playerId, evaluation, isHit);
                   
                   await prisma.predictionLog.update({
                     where: { id: evaluation._id },
                     data: { graded: true, hit: isHit, actualResult: actualStat, contextNote: evaluation.contextNote || null }
                   });
                   gradedCount++;
                }
             } else {
                // No game log found — player didn't play: DNP (excluded from hit rate)
                await markDNP(ungraded);
             }
          } catch (e) {
             console.error(`Failed to grade MLB player ${playerPrediction.playerId}`, e);
          }
        }
      }

      // ═══════════════════════ GRADE NFL ═══════════════════════
      if (sportsData.NFL && sportsData.NFL.length > 0) {
        for (const playerPrediction of sportsData.NFL) {
          const ungraded = playerPrediction.evaluations;
          if (ungraded.length === 0) continue;

          try {
             await new Promise(resolve => setTimeout(resolve, 300));
             
             // ESPN game log for the player
             const espnRes = await fetch(
               `https://site.api.espn.com/apis/site/v2/sports/football/nfl/athletes/${playerPrediction.playerId}/gamelog`,
               { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 3600 } }
             ).then(r => r.json()).catch(() => null);

             let actualStats = null;
             if (espnRes?.events) {
                // Find the game on the target date
                const targetDate = new Date(dateKey);
                for (const event of espnRes.events) {
                   const eventDate = new Date(event.gameDate || event.date);
                   if (Math.abs(eventDate - targetDate) <= (1000 * 60 * 60 * 24)) {
                      actualStats = event.stats || event.categories || null;
                      break;
                   }
                }
             }

             if (actualStats) {
                for (const evaluation of ungraded) {
                   // NFL stat mapping is complex — try to extract the actual value
                   let actualStat = 0;
                   const cat = evaluation.category;
                   
                   // Try to extract from ESPN gamelog format
                   if (typeof actualStats === 'object') {
                      // ESPN uses different structures, try common patterns
                      actualStat = parseFloat(actualStats[cat]) || 0;
                   }
                   
                   const targetLine = parseFloat(evaluation.target);
                   let isHit = false;
                   if (evaluation.call === 'OVER') isHit = actualStat > targetLine;
                   if (evaluation.call === 'UNDER') isHit = actualStat < targetLine;

                   evaluation.contextNote = isHit ? null : "Pure Miss";
                   updateHistory(playerPrediction.playerId, evaluation, isHit);
                   
                   await prisma.predictionLog.update({
                     where: { id: evaluation._id },
                     data: { graded: true, hit: isHit, actualResult: actualStat, contextNote: evaluation.contextNote }
                   });
                   gradedCount++;
                }
             } else {
                // Mark as DNP — excluded from hit rate
                await markDNP(ungraded);
             }
          } catch (e) {
             console.error(`Failed to grade NFL player ${playerPrediction.playerId}`, e);
          }
        }
      }
    }

    // Save all modified player histories to DB
    for (const [playerId, categories] of Object.entries(vault.playerHistory)) {
       for (const [category, stats] of Object.entries(categories)) {
          const hitRate = stats.total > 0 ? (stats.hits / stats.total) : 0;
          const overHitRate = stats.overTotal > 0 ? (stats.overHits / stats.overTotal) : 0;
          const underHitRate = stats.underTotal > 0 ? (stats.underHits / stats.underTotal) : 0;

          await prisma.playerHistory.upsert({
             where: { playerId_category: { playerId, category } },
             create: { 
                playerId, category, total: stats.total, hits: stats.hits, misses: stats.misses, hitRate, contextWarnings: stats.contextWarnings,
                overTotal: stats.overTotal || 0, overHits: stats.overHits || 0, overMisses: stats.overMisses || 0, overHitRate,
                underTotal: stats.underTotal || 0, underHits: stats.underHits || 0, underMisses: stats.underMisses || 0, underHitRate,
                homeHits: stats.homeHits, homeMisses: stats.homeMisses, awayHits: stats.awayHits, awayMisses: stats.awayMisses, opponentSplits: stats.opponentSplits, pitcherHandednessSplits: stats.pitcherHandednessSplits
             },
             update: { 
                total: stats.total, hits: stats.hits, misses: stats.misses, hitRate, contextWarnings: stats.contextWarnings,
                overTotal: stats.overTotal || 0, overHits: stats.overHits || 0, overMisses: stats.overMisses || 0, overHitRate,
                underTotal: stats.underTotal || 0, underHits: stats.underHits || 0, underMisses: stats.underMisses || 0, underHitRate,
                homeHits: stats.homeHits, homeMisses: stats.homeMisses, awayHits: stats.awayHits, awayMisses: stats.awayMisses, opponentSplits: stats.opponentSplits, pitcherHandednessSplits: stats.pitcherHandednessSplits
             }
          });
       }
    }

    return NextResponse.json({ 
       message: `Autopsy Complete. Graded ${gradedCount} predictions. ${dnpCount} marked as DNP (excluded from hit rate).`,
       gradedCount,
       dnpCount
    });

  } catch (error) {
    console.error("Autopsy Failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * Shared grading logic for NBA and WNBA (both use the NBA Stats API)
 * Returns { graded, dnp } counts
 */
async function gradeBasketball(playerPredictions, dateKey, leagueId, season, updateHistory) {
  let gradedCount = 0;
  let dnpCount = 0;
  const isPlayoffs = leagueId === '10' ? dateKey >= '2026-09-20' : dateKey >= '2026-04-15';

  for (const playerPrediction of playerPredictions) {
    const ungraded = playerPrediction.evaluations;
    if (ungraded.length === 0) continue;

    try {
       await new Promise(resolve => setTimeout(resolve, 500));

       const logData = await fetchNBA('playergamelog', {
          PlayerID: playerPrediction.playerId,
          Season: season,
          SeasonType: isPlayoffs ? 'Playoffs' : 'Regular Season',
          LeagueID: leagueId
       });

       const rowSet = logData?.resultSets?.[0]?.rowSet || [];
       const headers = logData?.resultSets?.[0]?.headers || [];
       const targetDateObj = new Date(dateKey);
       
       const actualGameLog = rowSet.find(row => {
          const gameDateStr = row[headers.indexOf('GAME_DATE')];
          const gameDate = new Date(gameDateStr);
          return Math.abs(gameDate - targetDateObj) <= (1000 * 60 * 60 * 24); 
       });

       if (actualGameLog) {
          for (const evaluation of ungraded) {
             let actualStat;
             
             // PRA is a combo stat — sum PTS + REB + AST
             if (evaluation.category === 'PRA') {
                actualStat = (actualGameLog[headers.indexOf('PTS')] || 0) +
                             (actualGameLog[headers.indexOf('REB')] || 0) +
                             (actualGameLog[headers.indexOf('AST')] || 0);
             } else {
                // Map 3PM -> FG3M in the headers
                const headerKey = evaluation.category === '3PM' ? 'FG3M' : evaluation.category;
                actualStat = actualGameLog[headers.indexOf(headerKey)] || 0;
             }
             
             const targetLine = parseFloat(evaluation.target);
             
             let isHit = false;
             if (evaluation.call === 'OVER') isHit = actualStat > targetLine;
             if (evaluation.call === 'UNDER') isHit = actualStat < targetLine;

             evaluation.contextNote = null;
             if (!isHit) {
                const mins = parseFloat(actualGameLog[headers.indexOf('MIN')]) || 0;
                const fouls = parseInt(actualGameLog[headers.indexOf('PF')]) || 0;
                if (evaluation.call === 'OVER') {
                   if (mins < 25) evaluation.contextNote = `Blowout / Injury Risk (Played ${mins} mins)`;
                   else if (fouls >= 5) evaluation.contextNote = `Foul Trouble (${fouls} PF)`;
                   else evaluation.contextNote = "Pure Miss (Failed to execute)";
                } else {
                   evaluation.contextNote = "Pure Miss (Opponent exploded)";
                }
             }

             updateHistory(playerPrediction.playerId, evaluation, isHit);
             
             await prisma.predictionLog.update({
               where: { id: evaluation._id },
               data: { graded: true, hit: isHit, actualResult: actualStat, contextNote: evaluation.contextNote || null }
             });
             gradedCount++;
          }
       } else {
          // Player didn't play — DNP: excluded from hit rate, not counted as hit or miss
          for (const evaluation of ungraded) {
             await prisma.predictionLog.update({
               where: { id: evaluation._id },
               data: { graded: true, hit: null, actualResult: null, contextNote: "DNP / No Game Played" }
             });
             dnpCount++;
          }
       }
    } catch (e) {
       console.error(`Failed to grade basketball player ${playerPrediction.playerId}`, e);
    }
  }

  return { graded: gradedCount, dnp: dnpCount };
}
