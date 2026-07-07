/**
 * ═══════════════════════════════════════════════════════════════════
 * GHHOST V2 — ASSEMBLY LINE STATION 4: THE SPATIAL ENGINE
 * ═══════════════════════════════════════════════════════════════════
 *
 * Responsibility:
 *   Cross-reference a player's shooting Hot Zone data against the
 *   current prediction call. A player with a dominant Hot Zone
 *   bolsters OVER confidence; an UNDER call against a hot shooter
 *   still earns a small confidence bump (the zone is "denied" by
 *   the opposing defense).
 *
 * Contract:
 *   IN  → (statCat, call, hotZone)
 *   OUT → { confidenceAdj, spatialText }
 *
 *   - Only activates for scoring stats (PTS, 3PM)
 *   - Returns zeroed output for non-scoring stats or unknown zones
 * ═══════════════════════════════════════════════════════════════════
 */

/* ── Confidence adjustments ─────────────────────────────────────── */
const OVER_HOT_ZONE_BOOST  = 5;  // Player shoots well here + we predict OVER
const UNDER_ZONE_DENIED    = 2;  // Player shoots well here but defense should limit

/* ── Stat categories that benefit from spatial analysis ──────────── */
const SPATIAL_STATS = new Set(['PTS', '3PM']);

/* ═══════════════════════════════════════════════════════════════════
 * PUBLIC API
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * Analyze a player's Hot Zone relevance for the current prediction.
 *
 * @param {string} statCat – The stat category ('PTS', 'REB', etc.)
 * @param {string} call    – Current call direction ('OVER', 'UNDER', etc.)
 * @param {string} hotZone – Player's dominant shooting zone name
 *
 * @returns {{ confidenceAdj: number, spatialText: string }}
 */
export function analyzeSpatial(statCat, call, hotZone) {
  /* ─── Gate: only scoring stats with a known zone ──────────────── */
  if (!SPATIAL_STATS.has(statCat) || hotZone === 'Unknown') {
    return { confidenceAdj: 0, spatialText: '' };
  }

  /* ─── OVER: the hot zone works in the player's favor ──────────── */
  if (call.includes('OVER')) {
    return {
      confidenceAdj: OVER_HOT_ZONE_BOOST,
      spatialText: `🎯 Hot Zone: ${hotZone}`,
    };
  }

  /* ─── UNDER: the zone exists but defense should suppress it ───── */
  if (call.includes('UNDER')) {
    return {
      confidenceAdj: UNDER_ZONE_DENIED,
      spatialText: `🛑 ZONE DENIED: ${hotZone}`,
    };
  }

  return { confidenceAdj: 0, spatialText: '' };
}
