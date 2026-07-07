/**
 * ═══════════════════════════════════════════════════════════════════
 * GHHOST V2 — ASSEMBLY LINE STATION 3: THE MATCHUP ENGINE
 * ═══════════════════════════════════════════════════════════════════
 *
 * Responsibility:
 *   Evaluate all external, environmental factors outside of a
 *   player's individual control: opponent defensive strength,
 *   game pace, travel fatigue, and offensive usage efficiency.
 *   These modifiers act as multipliers on the base projection
 *   computed by Station 2 (Form Engine).
 *
 * Contract:
 *   IN  → (statCat, oppName, rankMaps, isHomePlayer,
 *           playerTeamName, advStats, playerTeamPace,
 *           opponentPace, leagueAvgPace)
 *   OUT → { defensiveRank, initialCall, initialColor,
 *           initialConfidenceAdj, travelModifier, travelText,
 *           matchupModifier, usageModifier, paceEffect }
 * ═══════════════════════════════════════════════════════════════════
 */
/* ═══════════════════════════════════════════════════════════════════
 * NBA ARENA COORDINATES & TIMEZONE OFFSETS (relative to Eastern)
 *
 * Used by the Travel Fatigue calculator to compute Haversine distance
 * and circadian rhythm disruption between two franchises.
 * ═══════════════════════════════════════════════════════════════════ */
const NBA_CITIES = {
  'Atlanta Hawks':          { lat: 33.757, lng: -84.396,  tz:  0 },
  'Boston Celtics':         { lat: 42.366, lng: -71.062,  tz:  0 },
  'Brooklyn Nets':          { lat: 40.682, lng: -73.975,  tz:  0 },
  'Charlotte Hornets':      { lat: 35.225, lng: -80.839,  tz:  0 },
  'Chicago Bulls':          { lat: 41.880, lng: -87.674,  tz: -1 },
  'Cleveland Cavaliers':    { lat: 41.496, lng: -81.688,  tz:  0 },
  'Dallas Mavericks':       { lat: 32.790, lng: -96.810,  tz: -1 },
  'Denver Nuggets':         { lat: 39.748, lng: -105.007, tz: -2 },
  'Detroit Pistons':        { lat: 42.341, lng: -83.055,  tz:  0 },
  'Golden State Warriors':  { lat: 37.768, lng: -122.387, tz: -3 },
  'Houston Rockets':        { lat: 29.750, lng: -95.362,  tz: -1 },
  'Indiana Pacers':         { lat: 39.764, lng: -86.155,  tz:  0 },
  'Los Angeles Clippers':   { lat: 34.043, lng: -118.267, tz: -3 },
  'Los Angeles Lakers':     { lat: 34.043, lng: -118.267, tz: -3 },
  'Memphis Grizzlies':      { lat: 35.138, lng: -90.050,  tz: -1 },
  'Miami Heat':             { lat: 25.781, lng: -80.187,  tz:  0 },
  'Milwaukee Bucks':        { lat: 43.045, lng: -87.917,  tz: -1 },
  'Minnesota Timberwolves': { lat: 44.979, lng: -93.276,  tz: -1 },
  'New Orleans Pelicans':   { lat: 29.949, lng: -90.082,  tz: -1 },
  'New York Knicks':        { lat: 40.750, lng: -73.993,  tz:  0 },
  'Oklahoma City Thunder':  { lat: 35.463, lng: -97.515,  tz: -1 },
  'Orlando Magic':          { lat: 28.539, lng: -81.383,  tz:  0 },
  'Philadelphia 76ers':     { lat: 39.901, lng: -75.172,  tz:  0 },
  'Phoenix Suns':           { lat: 33.445, lng: -112.071, tz: -2 },
  'Portland Trail Blazers': { lat: 45.531, lng: -122.666, tz: -3 },
  'Sacramento Kings':       { lat: 38.580, lng: -121.499, tz: -3 },
  'San Antonio Spurs':      { lat: 29.427, lng: -98.437,  tz: -1 },
  'Toronto Raptors':        { lat: 43.643, lng: -79.379,  tz:  0 },
  'Utah Jazz':              { lat: 40.768, lng: -111.901, tz: -2 },
  'Washington Wizards':     { lat: 38.898, lng: -77.021,  tz:  0 },
};
/* ── Travel thresholds ──────────────────────────────────────────── */
const HEAVY_TRAVEL_MILES    = 2000;
const HEAVY_TRAVEL_TZ       = 3;
const MODERATE_TRAVEL_MILES  = 1000;
const MODERATE_TRAVEL_TZ     = 2;
const HEAVY_TRAVEL_PENALTY   = 0.96;  // -4%
const MODERATE_TRAVEL_PENALTY = 0.98; // -2%
/* ── Defensive rank sliding scale ───────────────────────────────── */
const MIDPOINT       = 15.5;  // middle of 1–30 scale
const MAX_DEF_SWING  = 0.12;  // ±12% at the extremes
/* ── Usage efficiency thresholds ────────────────────────────────── */
const HIGH_USG_EFFICIENT = { usg: 0.25, ts: 0.58, mod: 1.04 };
const HIGH_USG_VOLUME    = { usg: 0.28, mod: 1.02 };
const LOW_USG            = { usg: 0.15, mod: 0.97 };
/* ═══════════════════════════════════════════════════════════════════
 * INTERNAL HELPERS
 * ═══════════════════════════════════════════════════════════════════ */
/**
 * Haversine distance between two NBA arenas in miles.
 */
function calcTravelMiles(teamA, teamB) {
  const a = NBA_CITIES[teamA];
  const b = NBA_CITIES[teamB];
  if (!a || !b) return 0;
  const R = 3959; // Earth radius in miles
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) *
    Math.cos(b.lat * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
/**
 * Absolute timezone offset (in hours) between two teams.
 */
function calcTimezoneShift(awayTeam, homeTeam) {
  const a = NBA_CITIES[awayTeam];
  const b = NBA_CITIES[homeTeam];
  if (!a || !b) return 0;
  return Math.abs(a.tz - b.tz);
}
/**
 * Evaluate travel fatigue for away players.
 */
function evaluateTravel(isHomePlayer, playerTeamName, oppName) {
  if (isHomePlayer) {
    return { travelModifier: 1.0, travelText: '' };
  }
  const miles   = calcTravelMiles(playerTeamName, oppName);
  const tzShift = calcTimezoneShift(playerTeamName, oppName);
  if (miles > HEAVY_TRAVEL_MILES || tzShift >= HEAVY_TRAVEL_TZ) {
    return {
      travelModifier: HEAVY_TRAVEL_PENALTY,
      travelText: ` ✈️ Heavy Travel (${Math.round(miles)} mi, ${tzShift}hr TZ shift)`,
    };
  }
  if (miles > MODERATE_TRAVEL_MILES || tzShift >= MODERATE_TRAVEL_TZ) {
    return {
      travelModifier: MODERATE_TRAVEL_PENALTY,
      travelText: ` ✈️ Travel (${Math.round(miles)} mi)`,
    };
  }
  return { travelModifier: 1.0, travelText: '' };
}
/**
 * Resolve the defensive rank for a given stat category.
 * PRA uses the average of PTS, REB, and AST defensive ranks.
 */
function resolveDefensiveRank(statCat, oppName, rankMaps) {
  if (statCat === 'PRA') {
    const ptsRank = rankMaps['PTS']?.[oppName] || 15;
    const rebRank = rankMaps['REB']?.[oppName] || 15;
    const astRank = rankMaps['AST']?.[oppName] || 15;
    return Math.round((ptsRank + rebRank + astRank) / 3);
  }
  return rankMaps[statCat]?.[oppName] || 15;
}
/**
 * Determine the initial call direction and color based on defensive rank.
 */
function deriveInitialCall(defensiveRank) {
  let call  = defensiveRank <= 15 ? 'OVER' : 'UNDER';
  let color = '#a1a1aa';
  let adj   = 0;
  if (defensiveRank <= 5) {
    call  = 'STRONG OVER';
    color = '#22c55e';
    adj   = 15;
  } else if (defensiveRank <= 10) {
    color = '#4ade80';
    adj   = 5;
  } else if (defensiveRank >= 26) {
    call  = 'STRONG UNDER';
    color = '#ef4444';
    adj   = 15;
  } else if (defensiveRank >= 20) {
    color = '#f87171';
    adj   = 5;
  }
  return { call, color, adj };
}
/* ═══════════════════════════════════════════════════════════════════
 * PUBLIC API
 * ═══════════════════════════════════════════════════════════════════ */
/**
 * Analyze matchup and environmental factors for a stat prediction.
 *
 * @param {string}  statCat        – Stat column ('PTS', 'REB', 'PRA', etc.)
 * @param {string}  oppName        – Opponent full team name
 * @param {object}  rankMaps       – { PTS: { teamName: rank }, REB: {...}, ... }
 * @param {boolean} isHomePlayer   – Whether the player is at home tonight
 * @param {string}  playerTeamName – Player's full team name
 * @param {object}  advStats       – Player's advanced stats { USG_PCT, TS_PCT, ... }
 * @param {number}  playerTeamPace – Player's team pace rating
 * @param {number}  opponentPace   – Opponent's team pace rating
 * @param {number}  leagueAvgPace  – League average pace
 *
 * @returns {{
 *   defensiveRank: number,
 *   initialCall: string,
 *   initialColor: string,
 *   initialConfidenceAdj: number,
 *   travelModifier: number,
 *   travelText: string,
 *   matchupModifier: number,
 *   usageModifier: number,
 *   paceEffect: number
 * }}
 */
export function analyzeMatchup(
  statCat,
  oppName,
  rankMaps,
  isHomePlayer,
  playerTeamName,
  advStats,
  playerTeamPace,
  opponentPace,
  leagueAvgPace
) {
  /* ─── Defensive rank ──────────────────────────────────────────── */
  const defensiveRank = resolveDefensiveRank(statCat, oppName, rankMaps);
  /* ─── Initial call direction from rank alone ──────────────────── */
  const { call: initialCall, color: initialColor, adj: initialConfidenceAdj } =
    deriveInitialCall(defensiveRank);
  /* ─── Travel fatigue ──────────────────────────────────────────── */
  const { travelModifier, travelText } =
    evaluateTravel(isHomePlayer, playerTeamName, oppName);
  /* ─── Continuous defensive modifier (sliding scale) ───────────── */
  // Rank 1 → ~1.12 (worst defense, allows most)
  // Rank 15.5 → 1.0 (league average)
  // Rank 30 → ~0.88 (best defense)
  const matchupModifier = 1.0 + ((MIDPOINT - defensiveRank) / MIDPOINT) * MAX_DEF_SWING;
  /* ─── Usage efficiency modifier (PTS and 3PM only) ────────────── */
  const playerUSG = advStats?.USG_PCT || 0.20;
  const playerTS  = advStats?.TS_PCT  || 0.55;
  let usageModifier = 1.0;
  if (statCat === 'PTS' || statCat === '3PM') {
    if (playerUSG > HIGH_USG_EFFICIENT.usg && playerTS > HIGH_USG_EFFICIENT.ts) {
      usageModifier = HIGH_USG_EFFICIENT.mod;
    } else if (playerUSG > HIGH_USG_VOLUME.usg) {
      usageModifier = HIGH_USG_VOLUME.mod;
    } else if (playerUSG < LOW_USG.usg) {
      usageModifier = LOW_USG.mod;
    }
  }
  /* ─── Pace effect ─────────────────────────────────────────────── */
  // Fast-paced games generate more possessions = more counting stats
  const gamePace     = (playerTeamPace + opponentPace) / 2;
  const paceModifier = leagueAvgPace > 0 ? gamePace / leagueAvgPace : 1.0;
  const paceEffect =
    statCat === 'PTS' ? paceModifier :
    (statCat === 'REB' || statCat === 'AST') ? 1.0 + (paceModifier - 1.0) * 0.5 :
    1.0;
  return {
    defensiveRank,
    initialCall,
    initialColor,
    initialConfidenceAdj,
    travelModifier,
    travelText,
    matchupModifier,
    usageModifier,
    paceEffect,
  };
}
