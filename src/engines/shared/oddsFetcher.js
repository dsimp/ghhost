// src/engines/shared/oddsFetcher.js

// In-memory cache with TTL (10 minutes)
const oddsCache = {};
const CACHE_TTL = 10 * 60 * 1000;

export async function fetchAvailableProps(sport) {
  // 1. Check cache first
  const cacheKey = `odds_${sport}`;
  if (oddsCache[cacheKey] && Date.now() - oddsCache[cacheKey].ts < CACHE_TTL) {
    return oddsCache[cacheKey].data;
  }

  const API_KEY = process.env.ODDS_API_KEY;
  if (!API_KEY) {
    console.warn('[OddsFetcher] No ODDS_API_KEY set. Skipping odds filtering.');
    return null; // null = no filtering, engine runs unfiltered
  }

  const sportKey = {
    'NBA': 'basketball_nba',
    'WNBA': 'basketball_wnba',
    'MLB': 'baseball_mlb',
    'NFL': 'americanfootball_nfl'
  }[sport];

  if (!sportKey) return null;

  // 2. Fetch today's events
  const eventsRes = await fetch(
    `https://api.the-odds-api.com/v4/sports/${sportKey}/events?apiKey=${API_KEY}&dateFormat=iso`
  );
  
  if (!eventsRes.ok) {
    console.warn(`[OddsFetcher] Failed to fetch events for ${sportKey}. Status: ${eventsRes.status}`);
    return null;
  }
  
  const events = await eventsRes.json();

  // 3. For each event, fetch player prop markets
  //    CRITICAL: Batch these with delays to avoid rate limits
  const propMap = {};
  
  // Define which markets to request per sport
  const marketsBySort = {
    'NBA': 'player_points,player_rebounds,player_assists,player_threes,player_blocks,player_steals',
    'WNBA': 'player_points,player_rebounds,player_assists,player_threes,player_blocks,player_steals',
    'MLB': 'batter_hits,batter_total_bases,batter_home_runs,batter_rbis,batter_stolen_bases,pitcher_strikeouts',
    'NFL': 'player_passing_yards,player_rushing_yards,player_receiving_yards,player_passing_tds,player_receptions'
  };

  for (const event of events) {
    try {
      await new Promise(r => setTimeout(r, 200)); // Rate limit protection
      
      const oddsRes = await fetch(
        `https://api.the-odds-api.com/v4/sports/${sportKey}/events/${event.id}/odds` +
        `?apiKey=${API_KEY}&regions=us&markets=${marketsBySort[sport]}&oddsFormat=american`
      );
      
      if (!oddsRes.ok) continue;
      
      const oddsData = await oddsRes.json();

      // 4. Parse bookmaker outcomes into our normalized map
      //    Use the FIRST bookmaker that has each market (typically DraftKings or FanDuel)
      if (oddsData.bookmakers) {
        for (const bookmaker of oddsData.bookmakers) {
          for (const market of bookmaker.markets) {
            for (const outcome of market.outcomes) {
              // outcome.description = player name
              // outcome.point = the line (e.g., 24.5)
              // market.key = "player_points", "batter_total_bases", etc.
              
              const category = mapMarketToCategory(market.key, sport);
              if (!category) continue;
              
              const playerKey = normalizePlayerName(outcome.description);
              const compositeKey = `${playerKey}_${category}`;
              
              // Only store the first bookmaker's line we encounter
              if (!propMap[compositeKey]) {
                propMap[compositeKey] = {
                  player: outcome.description,
                  category: category,
                  line: outcome.point,
                  bookmaker: bookmaker.key
                };
              }
            }
          }
        }
      }
    } catch (e) {
      console.error(`[OddsFetcher] Failed to fetch odds for event ${event.id}`, e);
    }
  }

  // 5. Cache and return
  oddsCache[cacheKey] = { ts: Date.now(), data: propMap };
  return propMap;
}

// Maps The Odds API market keys to Ghhost's internal category codes
function mapMarketToCategory(marketKey, sport) {
  const map = {
    // NBA / WNBA
    'player_points': 'PTS',
    'player_rebounds': 'REB',
    'player_assists': 'AST',
    'player_threes': '3PM',
    'player_blocks': 'BLK',
    'player_steals': 'STL',
    // MLB
    'batter_hits': 'H',
    'batter_total_bases': 'TB',
    'batter_home_runs': 'HR',
    'batter_rbis': 'RBI',
    'batter_stolen_bases': 'SB',
    'batter_runs_scored': 'R',
    'pitcher_strikeouts': 'K',
    // NFL
    'player_passing_yards': 'PASS YDS',
    'player_rushing_yards': 'RUSH YDS',
    'player_receiving_yards': 'REC YDS',
    'player_passing_tds': 'PASS TD',
    'player_receptions': 'REC'
  };
  return map[marketKey] || null;
}

function normalizePlayerName(name) {
  // Lowercase, strip accents, trim whitespace for fuzzy matching
  if (!name) return "";
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

// Utility: check if a specific player+category is available on the books
export function isLineLive(propMap, playerName, category) {
  if (!propMap) return true; // No odds data = don't filter
  const key = `${normalizePlayerName(playerName)}_${category}`;
  return !!propMap[key];
}

// Utility: get the sportsbook's exact line for a player+category
export function getLiveLine(propMap, playerName, category) {
  if (!propMap) return null;
  const key = `${normalizePlayerName(playerName)}_${category}`;
  return propMap[key]?.line || null;
}
