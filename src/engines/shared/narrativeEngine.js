/**
 * AI Narrative Engine
 * Takes a structured prediction evaluation object and composes a human-readable 
 * natural language paragraph explaining the reasoning behind the pick.
 */

export function generateNarrative(ev, sport) {
  if (!ev) return "Prediction context unavailable.";

  const {
    player, opponent, category, call, avg, target,
    defensiveRank, historicalAccuracy, totalGames,
    streakDesc, memoryDesc, spatialDesc, oppDesc,
    h2hAvg, splitAvg, last10Avg, restDays, travelText, confidence
  } = ev;

  const isOver = call.includes('OVER');
  const dir = isOver ? 'OVER' : 'UNDER';
  
  // 1. Intro Sentence
  let narrative = `${player} is projected for a ${call} on ${target ? `${target} ` : ''}${category} against the ${opponent}. `;

  // 2. Defensive Matchup Context
  if (defensiveRank) {
     if (isOver && defensiveRank >= 20) {
        narrative += `This is a highly favorable matchup, as the ${opponent} rank ${defensiveRank}th (bottom tier) in defending this category. `;
     } else if (isOver && defensiveRank <= 10) {
        narrative += `Despite the ${opponent} boasting a strong top-${defensiveRank} defense against this category, the engine projects an over based on other strong indicators. `;
     } else if (!isOver && defensiveRank <= 10) {
        narrative += `This is a brutal matchup, with the ${opponent} possessing a top-${defensiveRank} defense against this category. `;
     } else if (!isOver && defensiveRank >= 20) {
        narrative += `While the ${opponent} struggle defensively (ranked ${defensiveRank}th), the engine projects an under based on player-specific trends. `;
     } else {
        narrative += `The ${opponent} defense is roughly average (ranked ${defensiveRank}th), making this a neutral baseline matchup. `;
     }
  } else if (oppDesc) {
     narrative += `Matchup context: ${oppDesc.replace(/[🛡️🎯🛑]/g, '').trim()}. `;
  }

  // 3. Historical / Streak Data
  if (historicalAccuracy && totalGames >= 3) {
     const acc = (historicalAccuracy * 100).toFixed(0);
     narrative += `Historically, the engine's precision on this specific line is extremely sharp, hitting at a ${acc}% rate over ${totalGames} graded predictions. `;
  }

  if (streakDesc) {
     const cleanStreak = streakDesc.replace(/[🔥🧊⚠️]/g, '').trim();
     narrative += `Recent momentum is notable: ${cleanStreak}. `;
  }

  // 4. Splits & H2H (If available)
  if (h2hAvg) {
     if (isOver && h2hAvg > avg * 1.1) {
        narrative += `Furthermore, head-to-head history shows dominance, averaging ${h2hAvg} against this opponent compared to a ${avg} season baseline. `;
     } else if (!isOver && h2hAvg < avg * 0.9) {
        narrative += `Head-to-head history reveals struggles, averaging just ${h2hAvg} against this opponent compared to a ${avg} season baseline. `;
     }
  }

  if (splitAvg && splitAvg !== avg) {
     const loc = ev.isHome ? 'home' : 'road';
     if (isOver && splitAvg > avg * 1.1) {
        narrative += `The ${loc} split is also favorable, boosting production to ${splitAvg} on average. `;
     } else if (!isOver && splitAvg < avg * 0.9) {
        narrative += `The ${loc} split is a concern, dropping production to ${splitAvg} on average. `;
     }
  }

  // 5. Rest / Travel Context
  if (restDays === 0) {
     narrative += `Note that this is a back-to-back game, which historically increases fatigue risk. `;
  } else if (restDays >= 4) {
     narrative += `Coming off ${restDays} days of extended rest, physical freshness is an asset. `;
  }

  if (travelText && travelText.includes('Travel')) {
     const cleanTravel = travelText.replace(/[✈️]/g, '').trim();
     narrative += `Factor in ${cleanTravel}, which slightly depreciates the projection. `;
  }

  // 6. Memory/Spatial specific (Ghhost specific features)
  if (memoryDesc) {
     const cleanMem = memoryDesc.replace(/[👻]/g, '').trim();
     narrative += `The Ghhost Memory AI notes: ${cleanMem}. `;
  }
  
  if (spatialDesc) {
     const cleanSpace = spatialDesc.replace(/[🎯🛑]/g, '').trim();
     narrative += `Spatial tracking indicates: ${cleanSpace}. `;
  }

  // 7. Conclusion
  let confLevel = "moderate";
  if (confidence >= 75) confLevel = "extremely high";
  else if (confidence >= 60) confLevel = "high";
  
  narrative += `Overall, the engine views this ${dir} as a ${confLevel}-confidence play.`;

  return narrative;
}
