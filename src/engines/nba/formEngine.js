/**
 * ═══════════════════════════════════════════════════════════════════
 * GHHOST V2 — ASSEMBLY LINE STATION 2: THE FORM ENGINE
 * ═══════════════════════════════════════════════════════════════════
 *
 * Responsibility:
 *   Evaluate a player's current physical and statistical form by
 *   analyzing rest days, recent game logs, head-to-head history,
 *   home/road splits, and last-10 frequency. Detect regression
 *   triggers (Gambler's Fallacy correction) and compute the
 *   data-driven weighted baseline projection.
 *
 * Contract:
 *   IN  → (statCat, call, logs, avg, h2hStats, splitStats,
 *           last10Stats, isHomePlayer, opponentAbbr)
 *   OUT → { confidenceScoreAdjustment, streakText, restText,
 *           restDays, baseProjection, restModifier, trendModifier,
 *           call }
 *
 *   - call may be FLIPPED (OVER ↔ UNDER) if regression is triggered
 *   - confidenceScoreAdjustment is a delta, not an absolute value
 * ═══════════════════════════════════════════════════════════════════
 */
/* ── Rest-day thresholds ────────────────────────────────────────── */
const REST_MODIFIERS = {
  0: 0.92,   // Back-to-back: -8%
  1: 1.0,    // Normal rest
  2: 1.02,   // Extra rest: +2%
  3: 1.01,   // Slightly positive
};
const REST_RUST = 0.96; // 4+ days without playing: -4% (rust)
/* ── Projection blend weights ───────────────────────────────────── */
const W_SEASON = 0.30;
const W_LAST10 = 0.40;
const W_SPLIT  = 0.20;
const W_H2H    = 0.10;
/* ── Regression & streak thresholds ─────────────────────────────── */
const REGRESSION_THRESHOLD   = 8;  // out of last 10
const HOT_COLD_THRESHOLD     = 6;  // out of last 10
const REGRESSION_PENALTY     = -20;
const OPPOSING_TREND_PENALTY = -15;
const H2H_DEVIATION          = 0.2; // 20% above/below avg
const SPLIT_DEVIATION        = 0.2;
/* ═══════════════════════════════════════════════════════════════════
 * INTERNAL HELPERS
 * ═══════════════════════════════════════════════════════════════════ */
/**
 * Count how many of the last N games went OVER or UNDER the average.
 */
function countOverUnder(recentLogs, statCat, avg) {
  let overCount = 0;
  let underCount = 0;
  for (const log of recentLogs) {
    const val = log[statCat];
    if (val > avg) overCount++;
    else if (val < avg) underCount++;
  }
  return { overCount, underCount };
}
/**
 * Determine rest days and the corresponding text label.
 */
function evaluateRest(logs) {
  if (!logs || logs.length === 0) {
    return { restDays: null, restText: '', confidenceAdj: 0 };
  }
  const lastGameDate = new Date(logs[0].GAME_DATE);
  const today = new Date();
  const restDays = Math.floor((today - lastGameDate) / (1000 * 60 * 60 * 24));
  let restText = '';
  let confidenceAdj = 0;
  if (restDays === 0) {
    confidenceAdj = -10;
    restText = ' (Back-to-Back)';
  } else if (restDays >= 4 && restDays <= 10) {
    confidenceAdj = -5;
    restText = ` (${restDays}-Day Rest)`;
  } else if (restDays > 10 && restDays <= 30) {
    restText = ' (Extended Rest)';
  }
  // restDays > 30 → likely offseason data, skip entirely
  return { restDays, restText, confidenceAdj };
}
/**
 * Apply regression logic (Gambler's Fallacy correction) and
 * streak detection to adjust confidence and potentially flip the call.
 */
function applyStreakLogic(call, overCount, underCount, recentLength) {
  let adj = 0;
  let streakText = '';
  if (call.includes('OVER') && overCount >= REGRESSION_THRESHOLD) {
    adj = REGRESSION_PENALTY;
    call = 'UNDER';
    streakText = `👻 Ghhost Prediction: Regression Expected (Reverting after ${overCount} Overs)`;
  } else if (call.includes('UNDER') && underCount >= REGRESSION_THRESHOLD) {
    adj = REGRESSION_PENALTY;
    call = 'OVER';
    streakText = `👻 Ghhost Prediction: Breakout Expected (Positive regression)`;
  } else if (call.includes('OVER') && overCount >= HOT_COLD_THRESHOLD) {
    adj = (overCount - 5) * 4;
    streakText = `🔥 Hot: Over in ${overCount} of last ${recentLength}`;
  } else if (call.includes('UNDER') && underCount >= HOT_COLD_THRESHOLD) {
    adj = (underCount - 5) * 4;
    streakText = `🧊 Cold: Under in ${underCount} of last ${recentLength}`;
  } else if (call.includes('OVER') && underCount >= HOT_COLD_THRESHOLD) {
    adj = OPPOSING_TREND_PENALTY;
    streakText = `⚠️ Cold Trend: Under in ${underCount} of last ${recentLength}`;
  } else if (call.includes('UNDER') && overCount >= HOT_COLD_THRESHOLD) {
    adj = OPPOSING_TREND_PENALTY;
    streakText = `⚠️ Hot Trend: Over in ${overCount} of last ${recentLength}`;
  }
  return { adj, streakText, call };
}
/**
 * Evaluate head-to-head performance against the specific opponent.
 */
function applyH2H(call, h2hStats, statCat, avg, opponentAbbr) {
  if (!h2hStats) return { adj: 0, text: '' };
  const h2hAvg = h2hStats[statCat];
  let adj = 0;
  let text = '';
  if (call.includes('OVER') && h2hAvg < avg * (1 - H2H_DEVIATION)) {
    adj = -15;
    text = ` ⚠️ Struggles vs ${opponentAbbr} (${h2hAvg} avg).`;
  } else if (call.includes('OVER') && h2hAvg > avg * (1 + H2H_DEVIATION)) {
    adj = 10;
    text = ` 🔥 Dominates ${opponentAbbr} (${h2hAvg} avg).`;
  } else if (call.includes('UNDER') && h2hAvg > avg * (1 + H2H_DEVIATION)) {
    adj = -15;
    text = ` ⚠️ Usually dominates ${opponentAbbr} (${h2hAvg} avg).`;
  }
  return { adj, text };
}
/**
 * Evaluate home/road split performance.
 */
function applySplit(call, splitStats, statCat, avg, isHomePlayer) {
  if (!splitStats) return { adj: 0, text: '' };
  const splitAvg = splitStats[statCat];
  const loc = isHomePlayer ? 'Home' : 'Road';
  let adj = 0;
  let text = '';
  if (call.includes('OVER') && splitAvg < avg * (1 - SPLIT_DEVIATION)) {
    adj = -10;
    text = ` ⚠️ Poor ${loc} split (${splitAvg} avg).`;
  } else if (call.includes('OVER') && splitAvg > avg * (1 + SPLIT_DEVIATION)) {
    adj = 10;
    text = ` 🔥 Strong ${loc} split (${splitAvg} avg).`;
  }
  return { adj, text };
}
/**
 * Evaluate last-10 frequency trend.
 */
function applyLast10Frequency(call, last10Stats, statCat, avg) {
  if (!last10Stats) return { adj: 0, text: '' };
  const last10Avg = last10Stats[statCat];
  let adj = 0;
  let text = '';
  if (call.includes('OVER') && last10Avg > avg * 1.2) {
    adj = 10;
    text = ` 📈 High Frequency: Averaging ${last10Avg} L10.`;
  } else if (call.includes('UNDER') && last10Avg < avg * 0.8) {
    adj = 10;
    text = ` 📉 Cold Frequency: Averaging ${last10Avg} L10.`;
  }
  return { adj, text };
}
/* ═══════════════════════════════════════════════════════════════════
 * PUBLIC API
 * ═══════════════════════════════════════════════════════════════════ */
/**
 * Analyze a player's current form for a specific stat category.
 *
 * @param {string}  statCat       – The stat column (e.g. 'PTS', 'REB', 'AST')
 * @param {string}  call          – Current call direction ('OVER' or 'UNDER')
 * @param {Array}   logs          – Player game logs, most recent first
 * @param {number}  avg           – Player's season average for this stat
 * @param {object}  h2hStats      – Head-to-head stats vs. tonight's opponent
 * @param {object}  splitStats    – Home or Road split stats
 * @param {object}  last10Stats   – Last 10 games stats
 * @param {boolean} isHomePlayer  – Whether the player is at home tonight
 * @param {string}  opponentAbbr  – Opponent abbreviation (e.g. 'BOS')
 *
 * @returns {{
 *   confidenceScoreAdjustment: number,
 *   streakText: string,
 *   restText: string,
 *   restDays: number|null,
 *   baseProjection: number,
 *   restModifier: number,
 *   trendModifier: number,
 *   call: string
 * }}
 */
export function analyzePlayerForm(
  statCat,
  call,
  logs,
  avg,
  h2hStats,
  splitStats,
  last10Stats,
  isHomePlayer,
  opponentAbbr
) {
  let totalAdj = 0;
  let streakText = '';
  /* ─── Rest evaluation ─────────────────────────────────────────── */
  const { restDays, restText, confidenceAdj: restAdj } = evaluateRest(logs);
  totalAdj += restAdj;
  /* ─── Streak & regression analysis ────────────────────────────── */
  if (logs && logs.length > 0) {
    const recent = logs.slice(0, 10);
    const { overCount, underCount } = countOverUnder(recent, statCat, avg);
    const streak = applyStreakLogic(call, overCount, underCount, recent.length);
    totalAdj += streak.adj;
    streakText = streak.streakText;
    call = streak.call; // may have been flipped by regression
  }
  /* ─── Head-to-head modifier ───────────────────────────────────── */
  const h2h = applyH2H(call, h2hStats, statCat, avg, opponentAbbr);
  totalAdj += h2h.adj;
  streakText += h2h.text;
  /* ─── Home/Road split modifier ────────────────────────────────── */
  const split = applySplit(call, splitStats, statCat, avg, isHomePlayer);
  totalAdj += split.adj;
  streakText += split.text;
  /* ─── Last-10 frequency modifier ──────────────────────────────── */
  const freq = applyLast10Frequency(call, last10Stats, statCat, avg);
  totalAdj += freq.adj;
  streakText += freq.text;
  streakText = streakText.trim();
  /* ─── Weighted baseline projection (30/40/20/10 blend) ────────── */
  const seasonAvg  = avg || 0;
  const l10Avg     = last10Stats ? (parseFloat(last10Stats[statCat]) || seasonAvg) : seasonAvg;
  const splitAvgV  = splitStats  ? (parseFloat(splitStats[statCat])  || seasonAvg) : seasonAvg;
  const h2hAvgV    = (h2hStats && h2hStats[statCat] !== undefined)
                       ? parseFloat(h2hStats[statCat])
                       : seasonAvg;
  const baseProjection =
    (seasonAvg * W_SEASON) +
    (l10Avg    * W_LAST10) +
    (splitAvgV * W_SPLIT)  +
    (h2hAvgV   * W_H2H);
  /* ─── Rest modifier ───────────────────────────────────────────── */
  const restModifier = restDays !== null
    ? (REST_MODIFIERS[restDays] ?? REST_RUST)
    : 1.0;
  /* ─── Trend modifier (15% weight on recent trajectory) ────────── */
  const trendModifier = (l10Avg > 0 && seasonAvg > 0)
    ? 1.0 + ((l10Avg - seasonAvg) / seasonAvg) * 0.15
    : 1.0;
  return {
    confidenceScoreAdjustment: totalAdj,
    streakText,
    restText,
    restDays,
    baseProjection,
    restModifier,
    trendModifier,
    call,
    h2hAvg: h2hAvgV,
    splitAvg: splitAvgV,
    last10Avg: l10Avg,
  };
}
