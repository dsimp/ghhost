/**
 * ═══════════════════════════════════════════════════════════════════
 * GHHOST V2 — ASSEMBLY LINE STATION 5: THE MEMORY ENGINE
 * ═══════════════════════════════════════════════════════════════════
 *
 * Responsibility:
 *   The "Vault" — Ghhost's long-term memory. Consults the autopsy
 *   history database to evaluate how accurately the engine has
 *   predicted this player in the past. Applies confidence boosts
 *   for historically reliable predictions and harsh penalties
 *   (including call flips) for patterns of failure.
 *
 *   This is the final quality gate on the Assembly Line. If the
 *   math says OVER but history says "you've been wrong about this
 *   player vs. this team 75% of the time," the Memory Engine
 *   overrides the call.
 *
 * Contract:
 *   IN  → (call, statCat, pHistory, pNotes, isHomePlayer, opponentAbbr,
 *           defensiveRank, projectedTarget)
 *   OUT → { confidenceAdj, historyStr, memoryText, call,
 *           numAccuracy, totalGames }
 *
 *   - call may be FLIPPED if opponent-specific accuracy is ≤ 25%
 *   - confidenceAdj is a delta applied to the running score
 *   - Scouting Notes are integrated as heavy modifiers.
 * ═══════════════════════════════════════════════════════════════════
 */

/* ── Sample-size gates ──────────────────────────────────────────── */
const MIN_GAMES_FOR_CORRECTION = 3;
const SAMPLE_RAMP_RANGE        = 8;   // confidence ramps from 0→1 over games 2–10
const SAMPLE_RAMP_OFFSET       = 2;

/* ── Hit-rate thresholds ────────────────────────────────────────── */
const STRUGGLE_RATE     = 0.4;
const LOCK_RATE         = 0.8;
const OPP_FLIP_RATE     = 0.25;  // flip the call if accuracy is this bad
const OPP_GENIUS_RATE   = 0.75;
const VENUE_STRUGGLE    = 0.3;
const VENUE_LOCK        = 0.8;

/* ── Confidence deltas ──────────────────────────────────────────── */
const STRUGGLE_PENALTY       = -15;
const LOCK_BONUS             = 10;
const OPP_FLIP_PENALTY       = -25;
const OPP_GENIUS_BONUS       = 15;
const VENUE_STRUGGLE_PENALTY = -20;
const VENUE_LOCK_BONUS       = 10;
const BLOWOUT_PENALTY        = -15;
const BLOWOUT_DEF_THRESHOLD  = 25;  // defensive rank must be ≥ this

/* ═══════════════════════════════════════════════════════════════════
 * PUBLIC API
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * Consult the Vault for historical prediction accuracy and apply
 * confidence corrections, auto-flips, and narrative text.
 *
 * @param {string}  call            – Current call ('OVER', 'UNDER', etc.)
 * @param {string}  statCat         – Stat category ('PTS', 'REB', etc.)
 * @param {object}  pHistory        – Player history from the Vault
 * @param {object}  pNotes          – Scouting Notes from the Data Lake
 * @param {boolean} isHomePlayer    – Whether the player is at home
 * @param {string}  opponentAbbr    – Opponent abbreviation ('BOS', etc.)
 * @param {number}  defensiveRank   – Opponent's defensive rank (1–30)
 * @param {number}  projectedTarget – The projected stat value from upstream
 *
 * @returns {{
 *   confidenceAdj: number,
 *   historyStr: string,
 *   memoryText: string,
 *   call: string,
 *   numAccuracy: number|null,
 *   totalGames: number
 * }}
 */
export function analyzeMemory(
  call,
  statCat,
  pHistory,
  pNotes,
  isHomePlayer,
  opponentAbbr,
  defensiveRank,
  projectedTarget
) {
  let confidenceAdj = 0;
  let historyStr    = '';
  let numAccuracy   = null;
  
  // Determine direction to pull specific stats
  const isOver = call.includes('OVER');

  const totalGames  = pHistory ? (isOver ? pHistory.overTotal : pHistory.underTotal) : 0;
  const hits        = pHistory ? (isOver ? pHistory.overHits : pHistory.underHits) : 0;

  if (pHistory && totalGames > 0) {
    const hitRate = hits / totalGames;
    numAccuracy   = hitRate;

    /* ─── Sample-size weighted confidence ramp ────────────────── */
    const sampleWeight = Math.min(
      1.0,
      (totalGames - SAMPLE_RAMP_OFFSET) / SAMPLE_RAMP_RANGE
    );

    /* ─── Overall accuracy correction ─────────────────────────── */
    if (totalGames >= MIN_GAMES_FOR_CORRECTION && hitRate < STRUGGLE_RATE) {
      confidenceAdj += Math.round(STRUGGLE_PENALTY * sampleWeight);
      historyStr = ` Proceed with caution. Historical struggle (${(hitRate * 100).toFixed(0)}% accuracy on ${isOver ? 'OVERs' : 'UNDERs'}).`;
    } else if (totalGames >= MIN_GAMES_FOR_CORRECTION && hitRate > LOCK_RATE) {
      confidenceAdj += Math.round(LOCK_BONUS * sampleWeight);
      historyStr = ` Historical lock (${(hitRate * 100).toFixed(0)}% accuracy on ${isOver ? 'OVERs' : 'UNDERs'}).`;
    }

    /* ─── Opponent-specific correction (can flip the call) ────── */
    const oppSplits = pHistory.opponentSplits?.[opponentAbbr];
    if (oppSplits && oppSplits.hits + oppSplits.misses >= MIN_GAMES_FOR_CORRECTION) {
      const oppHitRate = oppSplits.hits / (oppSplits.hits + oppSplits.misses);

      if (oppHitRate <= OPP_FLIP_RATE) {
        confidenceAdj += OPP_FLIP_PENALTY;
        historyStr += ` 👻 Auto-Corrected: Poor historical accuracy predicting against ${opponentAbbr}.`;
        call = call.includes('OVER') ? 'UNDER' : 'OVER';
      } else if (oppHitRate >= OPP_GENIUS_RATE) {
        confidenceAdj += OPP_GENIUS_BONUS;
        historyStr += ` 🎯 Genius Lock: Very high accuracy predicting against ${opponentAbbr}.`;
      }
    }

    /* ─── Home / Away venue correction ────────────────────────── */
    const homeGames = pHistory.homeHits + pHistory.homeMisses;
    const awayGames = pHistory.awayHits + pHistory.awayMisses;

    if (isHomePlayer && homeGames >= MIN_GAMES_FOR_CORRECTION) {
      const homeRate = pHistory.homeHits / homeGames;
      if (homeRate <= VENUE_STRUGGLE) {
        confidenceAdj += VENUE_STRUGGLE_PENALTY;
        historyStr += ` 👻 Auto-Corrected: Low accuracy at Home.`;
      } else if (homeRate >= VENUE_LOCK) {
        confidenceAdj += VENUE_LOCK_BONUS;
      }
    } else if (!isHomePlayer && awayGames >= MIN_GAMES_FOR_CORRECTION) {
      const awayRate = pHistory.awayHits / awayGames;
      if (awayRate <= VENUE_STRUGGLE) {
        confidenceAdj += VENUE_STRUGGLE_PENALTY;
        historyStr += ` 👻 Auto-Corrected: Low accuracy on the Road.`;
      } else if (awayRate >= VENUE_LOCK) {
        confidenceAdj += VENUE_LOCK_BONUS;
      }
    }

    /* ─── Blowout risk from context warnings ──────────────────── */
    if (pHistory.contextWarnings?.length > 0) {
      const blowouts = pHistory.contextWarnings.filter(w =>
        w.includes('Blowout')
      ).length;

      if (defensiveRank >= BLOWOUT_DEF_THRESHOLD && blowouts > 0 && call.includes('OVER')) {
        confidenceAdj += BLOWOUT_PENALTY;
        historyStr += ` ⚠️ High Blowout Risk logged in Vault.`;
      }
    }
  }

  /* ─── Phase 8: Data Lake / Scouting Notes Injection ─────────── */
  if (pNotes) {
    const venueContext = isHomePlayer ? 'HOME_GAME' : 'AWAY_GAME';
    
    // Check if we have a note for this specific venue
    if (pNotes[venueContext]) {
      const noteData = pNotes[venueContext];
      
      // If the engine is calling OVER but the note says they underperform (negative adjustment), penalize.
      if (call.includes('OVER') && noteData.adjustment < 0) {
        confidenceAdj += (noteData.adjustment * 10); // scale adjustment 
        historyStr += ` 🧠 **Scouting Note:** ${noteData.note}`;
      }
      
      // If the engine is calling UNDER but the note says they overperform, penalize.
      if (call.includes('UNDER') && noteData.adjustment > 0) {
        confidenceAdj -= (noteData.adjustment * 10);
        historyStr += ` 🧠 **Scouting Note:** ${noteData.note}`;
      }
    }
  }

  /* ─── Compose the final narrative ─────────────────────────────── */
  const callDirection = call.includes('OVER') ? 'OVER' : 'UNDER';
  const memoryText =
    `👻 Ghhost Prediction: ${callDirection} for tonight. ` +
    `Pinpoint projection: ${projectedTarget} ${statCat}.${historyStr}`;

  return {
    confidenceAdj,
    historyStr,
    memoryText,
    call,
    numAccuracy,
    totalGames,
  };
}
