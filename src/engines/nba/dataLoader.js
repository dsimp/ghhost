/**
 * ═══════════════════════════════════════════════════════════════════
 * GHHOST V2 — ASSEMBLY LINE STATION 1: THE DATA LOADER
 * ═══════════════════════════════════════════════════════════════════
 *
 * Responsibility:
 *   Fetch ALL raw statistical data from the NBA Stats API in batched,
 *   rate-limit-aware waves. Handle Prisma cache reads. Return a single
 *   unified data envelope for downstream Assembly Line stations.
 *
 * Contract:
 *   IN  → (season: string, gameDate: string)
 *   OUT → { cached, error, payload, raw }
 *
 *   - cached === true  → payload is ready-to-serve JSON (skip the line)
 *   - error  === true  → payload is a graceful degradation message
 *   - otherwise        → raw contains every API response for the belt
 * ═══════════════════════════════════════════════════════════════════
 */

import { fetchNBA } from '../../app/api/nba/fetchNBA';
import { PrismaClient } from '@prisma/client';

/* ── Singleton Prisma (same pattern as the rest of the app) ─────── */
const globalForPrisma = global;
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/* ── Shared defaults for leaguedashplayerstats calls ────────────── */
const SEASON_DEFAULTS = {
  SeasonType: 'Regular Season',
  LeagueID: '00',
  Month: '0',
  OpponentTeamID: '0',
  PORound: '0',
  PaceAdjust: 'N',
  Period: '0',
  PlusMinus: 'N',
  Rank: 'N',
};

/* ── Small helper: polite pause between batches ─────────────────── */
const pause = (ms = 200) => new Promise(r => setTimeout(r, ms));

/* ═══════════════════════════════════════════════════════════════════
 * PUBLIC API
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * Load all NBA data required by the Assembly Line.
 *
 * @param {string} season   – e.g. '2025-26'
 * @param {string} gameDate – 'YYYY-MM-DD' (Central Time)
 * @returns {Promise<{
 *   cached?: boolean,
 *   error?: boolean,
 *   payload?: object,
 *   raw?: object
 * }>}
 */
export async function loadNBAData(season, gameDate) {
  /* ─── Step 0: Check the Prisma cache ──────────────────────────── */
  try {
    const cached = await prisma.dailyCache.findUnique({
      where: { sport_gameDate: { sport: 'NBA', gameDate } },
    });

    if (cached) {
      const ageMs = Date.now() - Number(cached.timestamp);
      const ONE_HOUR = 3_600_000;

      if (ageMs < ONE_HOUR) {
        return { cached: true, payload: cached.payload };
      }
    }
  } catch (_) {
    // Cache read failures are non-fatal — continue to live fetch
  }

  /* ─── Step 1 (Batch 1): Core datasets ─────────────────────────── */
  const [
    scoreboardData,
    teamDefenseData,
    playerStatsData,
    playerAdvancedData,
    teamGeneralData,
    playerIndexData,
  ] = await Promise.all([
    fetchNBA('scoreboardv3', {
      GameDate: gameDate,
      LeagueID: '00',
    }).catch(() => null),

    fetchNBA('leaguedashteamstats', {
      MeasureType: 'Opponent',
      PerMode: 'PerGame',
      Season: season,
      LastNGames: '0',
      ...SEASON_DEFAULTS,
    }).catch(() => null),

    fetchNBA('leaguedashplayerstats', {
      MeasureType: 'Base',
      PerMode: 'PerGame',
      Season: season,
      LastNGames: '0',
      ...SEASON_DEFAULTS,
    }).catch(() => null),

    fetchNBA('leaguedashplayerstats', {
      MeasureType: 'Advanced',
      PerMode: 'PerGame',
      Season: season,
      LastNGames: '0',
      ...SEASON_DEFAULTS,
    }).catch(() => null),

    fetchNBA('leaguedashteamstats', {
      MeasureType: 'Base',
      PerMode: 'PerGame',
      Season: season,
      LastNGames: '0',
      ...SEASON_DEFAULTS,
    }).catch(() => null),

    fetchNBA('playerindex', {
      LeagueID: '00',
      Season: season,
    }).catch(() => null),
  ]);

  /* ─── Rate-limit check ────────────────────────────────────────── */
  if (!scoreboardData || !teamDefenseData || !playerStatsData) {
    return {
      error: true,
      payload: {
        matchups: [],
        players: [],
        message:
          'NBA Stats API is temporarily rate-limiting our servers. ' +
          'The engine will retry automatically soon. Please check back later.',
      },
    };
  }

  await pause();

  /* ─── Step 2 (Batch 2): Game logs & shot locations ────────────── */
  const [gameLogsData, playerShotData] = await Promise.all([
    fetchNBA('leaguegamelog', {
      Counter: '1000',
      Direction: 'DESC',
      LeagueID: '00',
      PlayerOrTeam: 'P',
      Season: season,
      SeasonType: 'Regular Season',
      Sorter: 'DATE',
    }).catch(() => null),

    fetchNBA('leaguedashplayershotlocations', {
      DistanceRange: 'By Zone',
      LastNGames: '0',
      LeagueID: '00',
      MeasureType: 'Base',
      Month: '0',
      OpponentTeamID: '0',
      Outcome: '',
      PORound: '0',
      PaceAdjust: 'N',
      PerMode: 'PerGame',
      Period: '0',
      PlayerExperience: '',
      PlayerPosition: '',
      PlusMinus: 'N',
      Rank: 'N',
      Season: season,
      SeasonSegment: '',
      SeasonType: 'Regular Season',
      ShotClockRange: '',
      StarterBench: '',
      TeamID: '0',
      VsConference: '',
      VsDivision: '',
    }).catch(() => null),
  ]);

  await pause();

  /* ─── Step 3 (Batch 3): Last 10, Home, Road splits ────────────── */
  const [last10StatsData, homeStatsData, roadStatsData] = await Promise.all([
    fetchNBA('leaguedashplayerstats', {
      MeasureType: 'Base',
      PerMode: 'PerGame',
      Season: season,
      LastNGames: '10',
      ...SEASON_DEFAULTS,
    }).catch(() => null),

    fetchNBA('leaguedashplayerstats', {
      MeasureType: 'Base',
      PerMode: 'PerGame',
      Season: season,
      LastNGames: '0',
      Location: 'Home',
      ...SEASON_DEFAULTS,
    }).catch(() => null),

    fetchNBA('leaguedashplayerstats', {
      MeasureType: 'Base',
      PerMode: 'PerGame',
      Season: season,
      LastNGames: '0',
      Location: 'Road',
      ...SEASON_DEFAULTS,
    }).catch(() => null),
  ]);

  /* ─── Assemble the raw data envelope ──────────────────────────── */
  return {
    cached: false,
    error: false,
    raw: {
      scoreboardData,
      teamDefenseData,
      playerStatsData,
      playerAdvancedData,
      teamGeneralData,
      playerIndexData,
      gameLogsData,
      playerShotData,
      last10StatsData,
      homeStatsData,
      roadStatsData,
    },
  };
}
