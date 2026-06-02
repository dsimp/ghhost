import { NextResponse } from 'next/server';
import { fetchMLB } from '../fetchMLB';
import { logPredictionsToVault, getFullPlayerHistory } from '../../memory/vault';

export async function GET(request) {
  try {
    // 1. Fetch Today's Games with Probable Pitchers
    const scheduleData = await fetchMLB('schedule', {
      sportId: 1,
      hydrate: 'probablePitcher'
    });

    const gamesRowSet = scheduleData?.dates?.[0]?.games || [];
    if (gamesRowSet.length === 0) {
      return NextResponse.json({ matchups: [], players: [], message: 'No MLB games scheduled for today.' });
    }

    const todayMatchups = [];
    const playingTeamIds = new Set();
    const teamIdToOppositeName = {}; 
    const teamIdToOpposingPitcherId = {};
    const teamIdToName = {};

    gamesRowSet.forEach(g => {
      const homeTeam = g.teams.home.team;
      const awayTeam = g.teams.away.team;
      const homePitcher = g.teams.home.probablePitcher;
      const awayPitcher = g.teams.away.probablePitcher;

      playingTeamIds.add(homeTeam.id);
      playingTeamIds.add(awayTeam.id);
      
      teamIdToName[homeTeam.id] = homeTeam.name;
      teamIdToName[awayTeam.id] = awayTeam.name;
      
      teamIdToOppositeName[homeTeam.id] = awayTeam.name;
      teamIdToOppositeName[awayTeam.id] = homeTeam.name;

      if (awayPitcher) {
         teamIdToOpposingPitcherId[homeTeam.id] = awayPitcher.id;
         awayPitcher.teamId = awayTeam.id; // Tag team ID
      }
      if (homePitcher) {
         teamIdToOpposingPitcherId[awayTeam.id] = homePitcher.id;
         homePitcher.teamId = homeTeam.id; // Tag team ID
      }
      
      todayMatchups.push({ home: homeTeam.name, away: awayTeam.name });
    });

    const pitcherIdToTeamId = {};
    gamesRowSet.forEach(g => {
       if (g.teams.away.probablePitcher) pitcherIdToTeamId[g.teams.away.probablePitcher.id] = g.teams.away.team.id;
       if (g.teams.home.probablePitcher) pitcherIdToTeamId[g.teams.home.probablePitcher.id] = g.teams.home.team.id;
    });

    // 2. Fetch Top Hitters in the League (Limit 60)
    const topHittersData = await fetchMLB('stats', {
      stats: 'season',
      group: 'hitting',
      playerPool: 'ALL',
      season: 2026,
      limit: 60,
      sortStat: 'totalBases' // We care about Total Bases / Hits
    });

    const topHitters = (topHittersData.stats?.[0]?.splits || []).filter(s => playingTeamIds.has(s.team.id));
    const activeHitterIds = topHitters.map(h => h.player.id);
    
    // We also need to get the active pitchers to determine their throwing hand and ERA
    const activePitcherIds = Object.values(teamIdToOpposingPitcherId).filter(id => id);

    if (activeHitterIds.length === 0 || activePitcherIds.length === 0) {
       return NextResponse.json({ matchups: todayMatchups, players: [], message: 'Insufficient data for prediction engine.' });
    }

    // 3. Batch Fetch Deep Details (Handedness Splits, Spray Charts, Pitcher Profiles)
    const [hittersDeepData, pitchersDeepData] = await Promise.all([
      fetchMLB('people', {
        personIds: activeHitterIds.join(','),
        hydrate: 'stats(group=[hitting],type=[statSplits,sprayChart,gameLog],sitCodes=[vl,vr],season=2026)'
      }).catch(() => null),
      fetchMLB('people', {
        personIds: activePitcherIds.join(','),
        hydrate: 'stats(group=[pitching],type=[season,gameLog],season=2026)'
      }).catch(() => null)
    ]);

    // Fetch the Vault's Historical Memory
    const autopsyHistory = await getFullPlayerHistory();

    // Map Pitcher Data
    const pitcherProfiles = {};
    if (pitchersDeepData && pitchersDeepData.people) {
       pitchersDeepData.people.forEach(p => {
          const throwingHand = p.pitchHand?.code || 'R'; // L or R
          let era = 4.00; // default average
          let gameLogs = [];
          
          p.stats?.forEach(s => {
             if (s.type.displayName === 'season' && s.splits && s.splits[0]) {
                era = parseFloat(s.splits[0].stat.era) || 4.00;
             }
             if (s.type.displayName === 'gameLog' && s.splits) {
                gameLogs = s.splits;
             }
          });
          
          pitcherProfiles[p.id] = { id: p.id, name: p.fullName, hand: throwingHand, era, gameLogs };
       });
    }

    // 4. Ghhost Brain Evaluation Logic
    const playerPredictions = [];

    if (hittersDeepData && hittersDeepData.people) {
       hittersDeepData.people.forEach(hitter => {
          const teamId = topHitters.find(t => t.player.id === hitter.id)?.team.id;
          if (!teamId) return;

          const oppPitcherId = teamIdToOpposingPitcherId[teamId];
          if (!oppPitcherId || !pitcherProfiles[oppPitcherId]) return;

          const oppPitcher = pitcherProfiles[oppPitcherId];
          const oppName = teamIdToOppositeName[teamId];
          const isHomePlayer = todayMatchups.some(m => m.home === teamIdToName[teamId]);

          // Extract Splits
          let vsLHP = null;
          let vsRHP = null;
          let sprayData = null;
          let gameLogs = [];

          hitter.stats?.forEach(statGroup => {
             if (statGroup.type.displayName === 'statSplits') {
                statGroup.splits?.forEach(split => {
                   if (split.split?.code === 'vl') vsLHP = split.stat;
                   if (split.split?.code === 'vr') vsRHP = split.stat;
                });
             } else if (statGroup.type.displayName === 'sprayChart') {
                sprayData = statGroup.splits?.[0]?.stat;
             } else if (statGroup.type.displayName === 'gameLog') {
                gameLogs = statGroup.splits || [];
             }
          });

          const relevantSplit = oppPitcher.hand === 'L' ? vsLHP : vsRHP;
          if (!relevantSplit) return;

          // Determine Hot Zone from Spray Chart
          let hotZone = 'Balanced';
          let maxHits = 0;
          if (sprayData) {
             const zones = [
               { k: 'leftField', n: 'Left Field' },
               { k: 'leftCenterField', n: 'Left-Center' },
               { k: 'centerField', n: 'Center Field' },
               { k: 'rightCenterField', n: 'Right-Center' },
               { k: 'rightField', n: 'Right Field' }
             ];
             zones.forEach(z => {
                if (sprayData[z.k] && sprayData[z.k] > maxHits) {
                   maxHits = sprayData[z.k];
                   hotZone = z.n;
                }
             });
          }

          // Evaluate Hits (H) and Total Bases (TB)
          const statEvaluations = [];

          ['hits', 'totalBases'].forEach(statCat => {
             const displayCat = statCat === 'hits' ? 'H' : 'TB';
             const splitAvg = parseFloat(relevantSplit[statCat] / relevantSplit.atBats) || 0; // Per AB approximation
             const seasonTotal = parseInt(relevantSplit[statCat]);
             
             if (seasonTotal < 10) return; // Not enough data vs this handedness

             let call = 'UNDER';
             let color = '#ef4444';
             let confidenceScore = 50;

             // Matchup Baseline (Pitcher ERA)
             if (oppPitcher.era > 4.50) {
                 call = 'OVER';
                 color = '#4ade80';
                 confidenceScore += 10;
                 if (oppPitcher.era > 5.50) {
                     call = 'STRONG OVER';
                     color = '#22c55e';
                     confidenceScore += 10;
                 }
             } else if (oppPitcher.era < 3.20) {
                 call = 'STRONG UNDER';
                 confidenceScore += 15;
             }

             // Handedness Split Advantage
             // Average MLB hitter hits ~0.240. If they hit >.300 vs this hand, huge advantage.
             const isAvgHigh = (statCat === 'hits' && splitAvg > 0.300) || (statCat === 'totalBases' && splitAvg > 0.500);
             if (isAvgHigh) {
                 if (call.includes('OVER')) confidenceScore += 15;
                 else confidenceScore -= 10; // Contradicts pitcher dominance
             }

             // Streak Momentum & Rest Days
             let streakText = "";
             let restText = "";
             if (gameLogs.length > 0) {
                // Calculate Rest Days from last game
                const lastGameDate = new Date(gameLogs[0].date);
                const today = new Date();
                const restDays = Math.floor((today - lastGameDate) / (1000 * 60 * 60 * 24));
                
                if (restDays === 0) {
                   confidenceScore -= 10;
                   restText = " (Back-to-Back Fatigue)";
                } else if (restDays >= 4) {
                   confidenceScore -= 5; // Layoff rust
                   restText = ` (${restDays} Day Layoff Rust)`;
                }

                const recent = gameLogs.slice(0, 10);
                let overCount = 0;
                let underCount = 0;
                // Target lines: 1.5 TB, 0.5 H
                const targetLine = statCat === 'hits' ? 0.5 : 1.5;
                recent.forEach(log => {
                   const val = parseInt(log.stat[statCat]) || 0;
                   if (val > targetLine) overCount++;
                   else underCount++;
                });

                // Advanced Regression Mechanics (The Gambler's Fallacy correction)
                if (call.includes('OVER') && overCount >= 8) {
                    confidenceScore -= 20; 
                    call = 'UNDER'; // The engine predicts regression
                    color = '#f87171';
                    streakText = `👻 Ghhost Prediction: Regression Expected (Reverting after ${overCount} Overs)`;
                } else if (call.includes('UNDER') && underCount >= 8) {
                    confidenceScore -= 20;
                    call = 'OVER';
                    color = '#4ade80';
                    streakText = `👻 Ghhost Prediction: Breakout Expected (Positive regression)`;
                } else if (call.includes('OVER') && overCount >= 7) {
                    confidenceScore += 15;
                    streakText = `🔥 Hot: Over in ${overCount} of last ${recent.length}`;
                } else if (call.includes('UNDER') && underCount >= 7) {
                    confidenceScore += 15;
                    streakText = `🧊 Cold: Under in ${underCount} of last ${recent.length}`;
                } else if (call.includes('OVER') && underCount >= 6) {
                    confidenceScore -= 15;
                    streakText = `⚠️ Cold Trend: Under in ${underCount} of last ${recent.length}`;
                } else if (call.includes('UNDER') && overCount >= 6) {
                    confidenceScore -= 15;
                    streakText = `⚠️ Hot Trend: Over in ${overCount} of last ${recent.length}`;
                }
             }

             // Spatial Context Text
             let spatialText = "";
             if (hotZone !== 'Balanced') {
                if (call.includes('OVER')) {
                   confidenceScore += 5;
                   spatialText = `🎯 Target Zone: ${hotZone}`;
                } else {
                   spatialText = `🛑 Spray Tendency: ${hotZone}`;
                }
             }

             // Cap constraints
             if (confidenceScore < 60) call = call.replace('STRONG ', '');
             if (confidenceScore > 99) confidenceScore = 99;
             if (confidenceScore < 1) confidenceScore = 1;

             let multiplier = 1.0;
             if (call.includes('STRONG OVER')) multiplier = 1.6;
             else if (call.includes('OVER')) multiplier = 1.3;
             else if (call.includes('STRONG UNDER')) multiplier = 0.4;
             else if (call.includes('UNDER')) multiplier = 0.7;

             const baseAvg = statCat === 'hits' ? 0.5 : 1.5;
             const projectedTarget = +(baseAvg * multiplier).toFixed(1);

             let historyStr = "";
             const pHistory = autopsyHistory[hitter.id]?.[displayCat];
             if (pHistory && pHistory.total > 0) {
                 const hitRate = pHistory.hits / pHistory.total;
                 if (pHistory.total >= 3 && hitRate < 0.4) {
                     confidenceScore -= 15;
                     historyStr = ` Proceed with caution. Historical struggle (${(hitRate * 100).toFixed(0)}% accuracy).`;
                 } else if (pHistory.total >= 3 && hitRate > 0.8) {
                     confidenceScore += 10;
                     historyStr = ` Historical lock (${(hitRate * 100).toFixed(0)}% accuracy).`;
                 }
                 
                 if (pHistory.contextWarnings?.length > 0) {
                     const earlySubs = pHistory.contextWarnings.filter(w => w.includes('Subbed')).length;
                     if (earlySubs > 0 && call.includes('OVER')) {
                         confidenceScore -= 10;
                         historyStr += ` ⚠️ Prone to early substitution.`;
                     }
                 }
             }

             const callDirection = call.includes('OVER') ? 'OVER' : 'UNDER';
             const memoryText = `👻 Ghhost Prediction: ${callDirection} for today. Pinpoint projection: ${projectedTarget} ${displayCat}.${historyStr}`;

             // Only push if confidence is high enough to be a "Play" (> 60%)
             if (confidenceScore >= 60) {
                statEvaluations.push({
                   category: displayCat,
                   avg: baseAvg.toString(),
                   projectedTarget: projectedTarget,
                   call: call,
                   color: color,
                   rank: oppPitcher.era,
                   confidence: confidenceScore,
                   oppDesc: `vs ${oppPitcher.hand}HP (${oppPitcher.era.toFixed(2)} ERA)${restText}`,
                   streakDesc: streakText,
                   spatialDesc: spatialText,
                   memoryDesc: memoryText
                });
             }
          });

          if (statEvaluations.length > 0) {
             playerPredictions.push({
                player: hitter.fullName,
                playerId: hitter.id,
                position: hitter.primaryPosition?.abbreviation || hitter.primaryPosition?.name || 'OF',
                team: teamIdToName[teamId].substring(0, 3).toUpperCase(),
                opponent: oppName,
                opponentAbbr: oppName.substring(0, 3).toUpperCase(),
                isHome: isHomePlayer,
                evaluations: statEvaluations
             });
          }
       });
    }

    // 5. Evaluate Pitchers for Strikeouts (K) and Earned Runs (ER)
     if (pitchersDeepData && pitchersDeepData.people) {
        pitchersDeepData.people.forEach(pitcher => {
           const teamId = pitcherIdToTeamId[pitcher.id];
           if (!teamId) return;
           
           const oppName = teamIdToOppositeName[teamId];
           const isHomePlayer = todayMatchups.some(m => m.home === teamIdToName[teamId]);
           
           const pProfile = pitcherProfiles[pitcher.id];
           if (!pProfile || !pProfile.gameLogs || pProfile.gameLogs.length === 0) return;

           const gameLogs = pProfile.gameLogs;
           const recent = gameLogs.slice(0, 10);
           
           const calcAvg = (arr, stat) => arr.length > 0 ? (arr.reduce((acc, l) => acc + parseInt(l.stat[stat]||0), 0) / arr.length).toFixed(1) : 0;
           const seasonK = parseFloat(calcAvg(gameLogs, 'strikeOuts'));
           const seasonER = parseFloat(calcAvg(gameLogs, 'earnedRuns'));
           
           if (seasonK === 0) return; // Not enough data
           
           const statEvaluations = [];
           
           ['strikeOuts', 'earnedRuns'].forEach(statCat => {
              const displayCat = statCat === 'strikeOuts' ? 'K' : 'ER';
              const targetLine = statCat === 'strikeOuts' ? 5.5 : 2.5; // Standard Pitcher Props
              
              let call = 'UNDER';
              let color = '#ef4444';
              let confidenceScore = 50;
              
              let overCount = 0;
              let underCount = 0;
              recent.forEach(log => {
                 const val = parseInt(log.stat[statCat]) || 0;
                 if (val > targetLine) overCount++;
                 else underCount++;
              });
              
              // Base evaluation
              if (statCat === 'strikeOuts' && seasonK > 6) { call = 'OVER'; color = '#4ade80'; confidenceScore += 10; }
              if (statCat === 'earnedRuns' && seasonER > 3.5) { call = 'OVER'; color = '#4ade80'; confidenceScore += 10; }
              if (statCat === 'earnedRuns' && pProfile.era < 3.20) { call = 'STRONG UNDER'; color = '#ef4444'; confidenceScore += 15; }
              
              // Momentum
              let streakText = "";
              if (call.includes('OVER') && overCount >= 7) { confidenceScore += 15; streakText = `🔥 Dominant: Over in ${overCount} of last ${recent.length}`; }
              else if (call.includes('UNDER') && underCount >= 7) { confidenceScore += 15; streakText = `🧊 Shutdown: Under in ${underCount} of last ${recent.length}`; }
              
              // Gambler's Fallacy
              if (call.includes('OVER') && overCount >= 9) {
                  confidenceScore -= 20; 
                  call = 'UNDER'; 
                  color = '#f87171';
                  streakText = `👻 Regression Alert: Reverting after ${overCount} straight Overs`;
              }
              
              if (confidenceScore < 60) call = call.replace('STRONG ', '');
              if (confidenceScore > 99) confidenceScore = 99;
              if (confidenceScore < 1) confidenceScore = 1;

              let multiplier = 1.0;
              if (call.includes('STRONG OVER')) multiplier = 1.35;
              else if (call.includes('OVER')) multiplier = 1.18;
              else if (call.includes('STRONG UNDER')) multiplier = 0.55;
              else if (call.includes('UNDER')) multiplier = 0.82;

              const projectedTarget = +(targetLine * multiplier).toFixed(1);

              let historyStr = "";
              const pHistory = autopsyHistory[pitcher.id]?.[displayCat];
              if (pHistory && pHistory.total > 0) {
                 const hitRate = pHistory.hits / pHistory.total;
                 if (pHistory.total >= 3 && hitRate < 0.4) {
                     confidenceScore -= 15;
                     historyStr = ` Struggle History (${(hitRate * 100).toFixed(0)}% accuracy).`;
                 } else if (pHistory.total >= 3 && hitRate > 0.8) {
                     confidenceScore += 10;
                     historyStr = ` Highly Reliable (${(hitRate * 100).toFixed(0)}% accuracy).`;
                 }
              }

              const callDirection = call.includes('OVER') ? 'OVER' : 'UNDER';
              const memoryText = `👻 Ghhost Prediction: ${callDirection} for today. Pinpoint projection: ${projectedTarget} ${displayCat}.${historyStr}`;

              if (confidenceScore >= 60) {
                 statEvaluations.push({
                    category: displayCat,
                    avg: targetLine.toString(),
                    projectedTarget: projectedTarget,
                    call: call,
                    color: color,
                    rank: pProfile.era,
                    confidence: confidenceScore,
                    oppDesc: `vs ${oppName}`,
                    streakDesc: streakText,
                    spatialDesc: `Season ERA: ${pProfile.era.toFixed(2)}`,
                    memoryDesc: memoryText
                 });
              }
           });
           
           if (statEvaluations.length > 0) {
              playerPredictions.push({
                 player: pitcher.fullName,
                 playerId: pitcher.id,
                 position: pitcher.primaryPosition?.abbreviation || pitcher.primaryPosition?.name || 'SP',
                 team: teamIdToName[teamId].substring(0, 3).toUpperCase(),
                 opponent: oppName,
                 opponentAbbr: oppName.substring(0, 3).toUpperCase(),
                 isHome: isHomePlayer,
                 isPitcher: true, // Tag as pitcher
                 evaluations: statEvaluations
              });
           }
        });
     }

    playerPredictions.sort((a, b) => {
       const aMaxConf = Math.max(...a.evaluations.map(e => e.confidence));
       const bMaxConf = Math.max(...b.evaluations.map(e => e.confidence));
       return bMaxConf - aMaxConf;
    });

    // Log predictions to the Memory Vault asynchronously
    logPredictionsToVault('MLB', playerPredictions).catch(console.error);

    return NextResponse.json({
       matchups: todayMatchups,
       players: playerPredictions
    });

  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
