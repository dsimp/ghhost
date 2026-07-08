import { NextResponse } from 'next/server';
import { fetchAvailableProps, isLineLive } from '../../../../engines/shared/oddsFetcher';
import { fetchMLB } from '../fetchMLB';
import { logPredictionsToVault, getFullPlayerHistory, getLearnedAdjustments } from '../../memory/vault';
import { PrismaClient } from '@prisma/client';

const PARK_FACTORS = {
  ARI: { H: 1.04, TB: 1.08 }, ATL: { H: 0.99, TB: 1.01 }, BAL: { H: 1.02, TB: 1.05 },
  BOS: { H: 1.03, TB: 1.06 }, CHC: { H: 0.98, TB: 0.97 }, CWS: { H: 1.01, TB: 1.04 },
  CIN: { H: 1.05, TB: 1.10 }, CLE: { H: 0.97, TB: 0.95 }, COL: { H: 1.15, TB: 1.30 },
  DET: { H: 0.98, TB: 0.96 }, HOU: { H: 0.99, TB: 1.01 }, KC:  { H: 1.02, TB: 0.98 },
  LAA: { H: 0.99, TB: 1.00 }, LAD: { H: 0.96, TB: 0.97 }, MIA: { H: 0.95, TB: 0.92 },
  MIL: { H: 1.00, TB: 1.02 }, MIN: { H: 1.02, TB: 1.05 }, NYM: { H: 0.97, TB: 0.96 },
  NYY: { H: 1.01, TB: 1.08 }, OAK: { H: 0.96, TB: 0.93 }, PHI: { H: 1.02, TB: 1.04 },
  PIT: { H: 0.98, TB: 0.96 }, SD:  { H: 0.95, TB: 0.93 }, SF:  { H: 0.96, TB: 0.90 },
  SEA: { H: 0.97, TB: 0.94 }, STL: { H: 0.99, TB: 1.00 }, TB:  { H: 0.97, TB: 0.96 },
  TEX: { H: 1.03, TB: 1.07 }, TOR: { H: 1.00, TB: 1.01 }, WSH: { H: 1.01, TB: 1.02 }
};

// Phase 4: Stadium coordinates for weather API (lat, lng, isRetractable)
const STADIUM_COORDS = {
  ARI: { lat: 33.445, lng: -112.067, dome: true },
  ATL: { lat: 33.890, lng: -84.468, dome: false },
  BAL: { lat: 39.284, lng: -76.622, dome: false },
  BOS: { lat: 42.346, lng: -71.098, dome: false },
  CHC: { lat: 41.948, lng: -87.656, dome: false },
  CWS: { lat: 41.830, lng: -87.634, dome: false },
  CIN: { lat: 39.097, lng: -84.508, dome: false },
  CLE: { lat: 41.496, lng: -81.685, dome: false },
  COL: { lat: 39.756, lng: -104.994, dome: false },
  DET: { lat: 42.339, lng: -83.049, dome: false },
  HOU: { lat: 29.757, lng: -95.355, dome: true },
  KC:  { lat: 39.051, lng: -94.481, dome: false },
  LAA: { lat: 33.800, lng: -117.883, dome: false },
  LAD: { lat: 34.074, lng: -118.240, dome: false },
  MIA: { lat: 25.778, lng: -80.220, dome: true },
  MIL: { lat: 43.028, lng: -87.971, dome: true },
  MIN: { lat: 44.982, lng: -93.278, dome: false },
  NYM: { lat: 40.757, lng: -73.846, dome: false },
  NYY: { lat: 40.829, lng: -73.927, dome: false },
  OAK: { lat: 37.752, lng: -122.201, dome: false },
  PHI: { lat: 39.906, lng: -75.167, dome: false },
  PIT: { lat: 40.447, lng: -80.006, dome: false },
  SD:  { lat: 32.707, lng: -117.157, dome: false },
  SF:  { lat: 37.779, lng: -122.389, dome: false },
  SEA: { lat: 47.591, lng: -122.332, dome: true },
  STL: { lat: 38.623, lng: -90.193, dome: false },
  TB:  { lat: 27.768, lng: -82.653, dome: true },
  TEX: { lat: 32.747, lng: -97.083, dome: true },
  TOR: { lat: 43.641, lng: -79.389, dome: true },
  WSH: { lat: 38.873, lng: -77.008, dome: false }
};

// Phase 4: Fetch current weather from Open-Meteo (free, no API key)
async function getGameWeather(homeTeamAbbr) {
  const stadium = STADIUM_COORDS[homeTeamAbbr];
  if (!stadium) return null;
  if (stadium.dome) return { dome: true, temp: 72, wind: 0, humidity: 50, desc: '🏟️ Dome/Retractable Roof' };
  
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${stadium.lat}&longitude=${stadium.lng}&current=temperature_2m,wind_speed_10m,relative_humidity_2m&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    const current = data?.current;
    if (!current) return null;
    
    const temp = Math.round(current.temperature_2m || 72);
    const wind = Math.round(current.wind_speed_10m || 0);
    const humidity = Math.round(current.relative_humidity_2m || 50);
    
    let desc = `${temp}°F, ${wind}mph wind, ${humidity}% humidity`;
    return { dome: false, temp, wind, humidity, desc };
  } catch {
    return null;
  }
}

// Phase 4: Calculate weather impact on hitting
function calcWeatherModifier(weather, statCat) {
  if (!weather || weather.dome) return { modifier: 1.0, text: '' };
  
  let modifier = 1.0;
  let factors = [];
  
  // Temperature: Hot air = less dense = balls carry further
  if (weather.temp >= 90) { 
    modifier *= (statCat === 'TB') ? 1.06 : 1.03;
    factors.push(`🌡️ Hot (${weather.temp}°F)`);
  } else if (weather.temp >= 80) {
    modifier *= (statCat === 'TB') ? 1.03 : 1.01;
  } else if (weather.temp <= 50) {
    modifier *= (statCat === 'TB') ? 0.94 : 0.97;
    factors.push(`🥶 Cold (${weather.temp}°F)`);
  } else if (weather.temp <= 60) {
    modifier *= (statCat === 'TB') ? 0.97 : 0.99;
  }
  
  // Wind: High wind suppresses fly balls, adds randomness
  if (weather.wind >= 20) {
    modifier *= (statCat === 'TB') ? 0.92 : 0.96;
    factors.push(`💨 Heavy Wind (${weather.wind}mph)`);
  } else if (weather.wind >= 15) {
    modifier *= (statCat === 'TB') ? 0.96 : 0.98;
    factors.push(`🌬️ Windy (${weather.wind}mph)`);
  }
  
  // Humidity: High humidity = ball doesn't carry as well (contrary to belief)
  if (weather.humidity >= 85) {
    modifier *= 0.98;
    factors.push('💧 High Humidity');
  }
  
  const text = factors.length > 0 ? ` ${factors.join(', ')}` : '';
  return { modifier, text };
}


const globalForPrisma = global;
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export async function GET(request) {
  const liveOdds = await fetchAvailableProps('MLB');
  const gameDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });

  try {
     const cached = await prisma.dailyCache.findUnique({
       where: { sport_gameDate: { sport: 'MLB', gameDate } }
     });
     if (cached) {
        const now = Date.now();
        // Return cache if less than 1 hour old
        if ((now - Number(cached.timestamp)) < 3600000) {
            return NextResponse.json(cached.payload);
        }
     }
  } catch (e) {}

  try {
    // 1. Fetch Today's Games with Probable Pitchers
    const scheduleData = await fetchMLB('schedule', {
      sportId: 1,
      hydrate: 'probablePitcher,team'
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
    const teamIdToAbbr = {};
    const teamIdToHomeTeamAbbr = {};

    gamesRowSet.forEach(g => {
      const homeTeam = g.teams.home.team;
      const awayTeam = g.teams.away.team;
      const homePitcher = g.teams.home.probablePitcher;
      const awayPitcher = g.teams.away.probablePitcher;

      playingTeamIds.add(homeTeam.id);
      playingTeamIds.add(awayTeam.id);
      
      const homeAbbr = homeTeam.abbreviation || homeTeam.name.substring(0, 3).toUpperCase();
      const awayAbbr = awayTeam.abbreviation || awayTeam.name.substring(0, 3).toUpperCase();

      teamIdToName[homeTeam.id] = homeTeam.name;
      teamIdToName[awayTeam.id] = awayTeam.name;
      teamIdToAbbr[homeTeam.id] = homeAbbr;
      teamIdToAbbr[awayTeam.id] = awayAbbr;
      
      // Both teams in this game play in the home team's park
      teamIdToHomeTeamAbbr[homeTeam.id] = homeAbbr;
      teamIdToHomeTeamAbbr[awayTeam.id] = homeAbbr;

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

    // 2. Fetch Top Hitters in the League (Limit 200 for broad starter coverage)
    const topHittersData = await fetchMLB('stats', {
      stats: 'season',
      group: 'hitting',
      playerPool: 'ALL',
      season: 2026,
      limit: 200,
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

    // Phase 3: Fetch the Brain's Learned Adjustments
    const learnedAdj = await getLearnedAdjustments('MLB');

    if (!hittersDeepData || !pitchersDeepData) {
       return NextResponse.json({ matchups: [], players: [], message: 'MLB Stats API is temporarily rate-limiting our servers. Please try again later.' });
    }

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
    // Phase 4: Fetch weather for all unique stadiums
    const uniqueHomeAbbrs = [...new Set(Object.values(teamIdToHomeTeamAbbr))];
    const weatherMap = {};
    await Promise.all(uniqueHomeAbbrs.map(async (abbr) => {
      weatherMap[abbr] = await getGameWeather(abbr);
    }));

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
          const playerName = hitter.fullName;

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

           // Evaluate Hitter Stats: H, TB, R, RBI, HR, SB, BB
           const statEvaluations = [];

            ['hits', 'totalBases', 'runs', 'rbi', 'homeRuns', 'stolenBases', 'baseOnBalls'].forEach(statCat => {
               const displayCatMap = { hits: 'H', totalBases: 'TB', runs: 'R', rbi: 'RBI', homeRuns: 'HR', stolenBases: 'SB', baseOnBalls: 'BB' };
               const displayCat = displayCatMap[statCat];
               if (!isLineLive(liveOdds, playerName, displayCat)) { return; }
               const statMapping = statCat; // gameLog key matches statCat for hitters
               const splitAvg = parseFloat(relevantSplit[statCat] / relevantSplit.atBats) || 0; // Per AB approximation
               const seasonTotal = parseInt(relevantSplit[statCat]);

              // Rarer stats (HR, SB, BB) use a lower minimum data threshold
              const minDataThreshold = ['homeRuns', 'stolenBases', 'baseOnBalls'].includes(statCat) ? 1 : 3;
              if (seasonTotal < minDataThreshold) return; // Not enough data vs this handedness

              // Determine abbreviations for park factor and learned adjustment lookups
              const homeTeamAbbr = teamIdToHomeTeamAbbr[teamId] || '';
              // Derive opponent abbreviation from the opponent's team name
              let oppTeamId = null;
              gamesRowSet.forEach(g => {
                 if (g.teams.home.team.id === teamId) oppTeamId = g.teams.away.team.id;
                 if (g.teams.away.team.id === teamId) oppTeamId = g.teams.home.team.id;
              });
              const oppAbbr = teamIdToAbbr[oppTeamId] || oppName.substring(0, 3).toUpperCase();

              let call = 'UNDER';
              let color = '#ef4444';
              let confidenceScore = 50;

               // Matchup Baseline (Pitcher ERA) — applies to H, TB, R, RBI, HR
               const eraAffectedStats = ['hits', 'totalBases', 'runs', 'rbi', 'homeRuns'];
               if (eraAffectedStats.includes(statCat)) {
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
               }

               // Handedness Split Advantage
               // Average MLB hitter hits ~0.240. If they hit >.300 vs this hand, huge advantage.
               const splitThresholds = { hits: 0.300, totalBases: 0.500, runs: 0.180, rbi: 0.200, homeRuns: 0.060, stolenBases: 0.030, baseOnBalls: 0.120 };
               const isAvgHigh = splitAvg > (splitThresholds[statCat] || 0.200);
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
                      restText = " (Back-to-Back)";
                   } else if (restDays >= 4 && restDays <= 10) {
                      confidenceScore -= 5;
                      restText = ` (${restDays}-Day Rest)`;
                   } else if (restDays > 10 && restDays <= 30) {
                      restText = ' (Extended Rest)';
                   }

                  const recent = gameLogs.slice(0, 10);
                  let overCount = 0;
                  let underCount = 0;
                  // Target lines per stat category
                  const targetLineMap = { hits: 0.5, totalBases: 1.5, runs: 0.5, rbi: 0.5, homeRuns: 0.5, stolenBases: 0.5, baseOnBalls: 0.5 };
                  const targetLine = targetLineMap[statCat] || 0.5;
                  recent.forEach(log => {
                     const val = parseInt(log.stat[statCat]) || 0;
                     if (val > targetLine) overCount++;
                     else underCount++;
                  });

                 // Advanced Regression Mechanics (The Gambler's Fallacy correction)
                 if (call.includes('OVER') && overCount >= 8) {
                     confidenceScore -= 20; 
                     call = 'UNDER'; // The engine predicts regression
                     color = '#ef4444';
                     streakText = `👻 Ghhost Prediction: Regression Expected (Reverting after ${overCount} Overs)`;
                 } else if (call.includes('UNDER') && underCount >= 8) {
                     confidenceScore -= 20;
                     call = 'OVER';
                     color = '#22c55e';
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

              // Data-driven projection
              const hitterGameLog = gameLogs;
              const gamesPlayed = hitterGameLog.length;
              // Default target lines for projection baselines
              const baseAvgMap = { hits: 0.5, totalBases: 1.5, runs: 0.5, rbi: 0.5, homeRuns: 0.2, stolenBases: 0.1, baseOnBalls: 0.3 };
              const baseAvg = baseAvgMap[statCat] || 0.5;
              const seasonLogTotal = hitterGameLog.reduce((sum, g) => sum + (parseInt(g.stat?.[statMapping] || g.stat?.[statCat]) || 0), 0);
              const playerSeasonAvg = gamesPlayed > 0 ? seasonLogTotal / gamesPlayed : baseAvg;

              const recentGames = hitterGameLog.slice(0, 10);
              const recentTotal = recentGames.reduce((sum, g) => sum + (parseInt(g.stat?.[statMapping] || g.stat?.[statCat]) || 0), 0);
              const recentAvg = recentGames.length > 0 ? recentTotal / recentGames.length : playerSeasonAvg;

              const expectedABs = 4;
              const splitPerAB = relevantSplit && relevantSplit.atBats > 0 ? relevantSplit[statCat] / relevantSplit.atBats : null;
              const splitProjection = splitPerAB !== null ? splitPerAB * expectedABs : playerSeasonAvg;

              let baseProjection = (playerSeasonAvg * 0.30) + (recentAvg * 0.40) + (splitProjection * 0.30);

              // Park factor — only applies to H and TB (other stats use 1.0)
              const parkFactorStats = ['H', 'TB'];
              const parkFactor = parkFactorStats.includes(displayCat) ? (PARK_FACTORS[homeTeamAbbr]?.[displayCat] || 1.0) : 1.0;
              baseProjection *= parkFactor;

              // ERA modifier — applies to H, TB, R, RBI, HR
              if (eraAffectedStats.includes(statCat)) {
                const eraModifier = oppPitcher.era > 0 ? 1.0 + ((oppPitcher.era - 4.00) / 4.00) * 0.08 : 1.0;
                baseProjection *= eraModifier;
              }

              // Phase 4: Weather modifier — applies to H, TB, HR, R, RBI
              const weatherAffectedStats = ['hits', 'totalBases', 'homeRuns', 'runs', 'rbi'];
              const gameWeather = weatherMap[homeTeamAbbr];
              if (weatherAffectedStats.includes(statCat)) {
                const weatherDisplayCat = (statCat === 'homeRuns' || statCat === 'runs' || statCat === 'rbi') ? 'TB' : (statCat === 'hits' ? 'H' : 'TB');
                const { modifier: weatherMod, text: weatherText } = calcWeatherModifier(gameWeather, weatherDisplayCat);
                baseProjection *= weatherMod;
              }
              // Always compute weatherText for oppDesc display
              const { text: weatherText } = calcWeatherModifier(gameWeather, displayCat);

              const confidenceScale = 1.0 + ((confidenceScore - 50) / 500);
              let projectedTarget = Math.max(0, +(baseProjection * confidenceScale).toFixed(1));

              // Phase 3: Apply Learned Adjustments
              let learnedModifier = 0;
              if (learnedAdj[`overall_${displayCat}`]) learnedModifier += learnedAdj[`overall_${displayCat}`];
              if (learnedAdj[isHomePlayer ? `home_${displayCat}` : `away_${displayCat}`]) learnedModifier += learnedAdj[isHomePlayer ? `home_${displayCat}` : `away_${displayCat}`];
              if (oppAbbr && learnedAdj[`vs_${oppAbbr}_${displayCat}`]) learnedModifier += learnedAdj[`vs_${oppAbbr}_${displayCat}`];
              learnedModifier = Math.max(-0.12, Math.min(0.12, learnedModifier));
              if (Math.abs(learnedModifier) > 0.005) {
                 projectedTarget = Math.max(0, +(projectedTarget * (1 + learnedModifier)).toFixed(1));
              }

              let historyStr = "";
              let numAccuracy = null;
              const pHistory = autopsyHistory[hitter.id]?.[displayCat];
              if (pHistory && pHistory.total > 0) {
                  const hitRate = pHistory.hits / pHistory.total;
                  numAccuracy = hitRate;
                  const sampleWeight = Math.min(1.0, (pHistory.total - 2) / 8);
                  
                  if (pHistory.total >= 3 && hitRate < 0.4) {
                      confidenceScore -= Math.round(15 * sampleWeight);
                      historyStr = ` Proceed with caution. Historical struggle (${(hitRate * 100).toFixed(0)}% accuracy).`;
                  } else if (pHistory.total >= 3 && hitRate > 0.8) {
                      confidenceScore += Math.round(10 * sampleWeight);
                      historyStr = ` Historical lock (${(hitRate * 100).toFixed(0)}% accuracy).`;
                  }
                  
                  const oppAbbr = oppName.substring(0, 3).toUpperCase();
                  const oppSplits = pHistory.opponentSplits?.[oppAbbr];
                  if (oppSplits && (oppSplits.hits + oppSplits.misses >= 3)) {
                      const oppHitRate = oppSplits.hits / (oppSplits.hits + oppSplits.misses);
                      if (oppHitRate <= 0.25) {
                          confidenceScore -= Math.round(25 * sampleWeight); 
                          historyStr += ` 👻 Auto-Corrected: Poor historical accuracy predicting against ${oppAbbr}.`;
                          call = call.includes('OVER') ? 'UNDER' : 'OVER'; 
                          color = call === 'OVER' ? '#4ade80' : '#ef4444';
                      } else if (oppHitRate >= 0.75) {
                          confidenceScore += Math.round(15 * sampleWeight);
                          historyStr += ` 🎯 Genius Lock: Very high accuracy predicting against ${oppAbbr}.`;
                      }
                  }
                  
                  const homeGames = pHistory.homeHits + pHistory.homeMisses;
                  const awayGames = pHistory.awayHits + pHistory.awayMisses;
                  if (isHomePlayer && homeGames >= 3) {
                      const homeRate = pHistory.homeHits / homeGames;
                      if (homeRate <= 0.3) { confidenceScore -= Math.round(20 * sampleWeight); historyStr += ` 👻 Auto-Corrected: Low Home accuracy.`; }
                      else if (homeRate >= 0.8) { confidenceScore += Math.round(10 * sampleWeight); }
                  } else if (!isHomePlayer && awayGames >= 3) {
                      const awayRate = pHistory.awayHits / awayGames;
                      if (awayRate <= 0.3) { confidenceScore -= Math.round(20 * sampleWeight); historyStr += ` 👻 Auto-Corrected: Low Road accuracy.`; }
                      else if (awayRate >= 0.8) { confidenceScore += Math.round(10 * sampleWeight); }
                  }

                  const handSplits = pHistory.pitcherHandednessSplits?.[oppPitcher.hand];
                  if (handSplits && (handSplits.hits + handSplits.misses >= 3)) {
                      const handHitRate = handSplits.hits / (handSplits.hits + handSplits.misses);
                      if (handHitRate <= 0.3) {
                          confidenceScore -= Math.round(20 * sampleWeight); 
                          historyStr += ` 👻 Auto-Corrected: Poor historical accuracy vs ${oppPitcher.hand}HP.`;
                          if (call.includes('OVER') && handHitRate <= 0.2) {
                              call = 'UNDER';
                              color = '#ef4444';
                          }
                      } else if (handHitRate >= 0.75) {
                          confidenceScore += Math.round(15 * sampleWeight);
                          historyStr += ` 🎯 Genius Lock: High accuracy predicting vs ${oppPitcher.hand}HP.`;
                      }
                  }
              }

              const callDirection = call.includes('OVER') ? 'OVER' : 'UNDER';
              const memoryText = `👻 Ghhost Prediction: ${callDirection} for today. Pinpoint projection: ${projectedTarget} ${displayCat}.${historyStr}`;

              if (confidenceScore >= 60) {
                 statEvaluations.push({
                    category: displayCat,
                    avg: baseAvg.toString(),
                    projectedTarget: projectedTarget,
                    call: call,
                    color: color,
                    rank: oppPitcher.era,
                    confidence: confidenceScore,
                    oppDesc: `vs ${oppPitcher.hand}HP (${oppPitcher.era.toFixed(2)} ERA)${restText}${weatherText}`,
                    streakDesc: streakText,
                    spatialDesc: spatialText,
                    memoryDesc: memoryText,
                    historicalAccuracy: numAccuracy,
                    totalGames: pHistory ? pHistory.total : 0,
                    pitcherHand: oppPitcher.hand
                 });
              }
           });

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
       });
    }

    // 5. Evaluate Pitchers for Strikeouts (K) and Earned Runs (ER)
     if (pitchersDeepData && pitchersDeepData.people) {
        pitchersDeepData.people.forEach(pitcher => {
           const teamId = pitcherIdToTeamId[pitcher.id];
           if (!teamId) return;
           
           const oppName = teamIdToOppositeName[teamId];
           const isHomePlayer = todayMatchups.some(m => m.home === teamIdToName[teamId]);
           const playerName = pitcher.fullName;
           
           const pProfile = pitcherProfiles[pitcher.id];
           if (!pProfile || !pProfile.gameLogs || pProfile.gameLogs.length === 0) return;

           const gameLogs = pProfile.gameLogs;
           
           const statEvaluations = [];
           
           ['strikeOuts', 'earnedRuns', 'hitsAllowed', 'baseOnBalls', 'inningsPitched'].forEach(statCat => {
                const displayCatMap = { strikeOuts: 'K', earnedRuns: 'ER', hitsAllowed: 'HA', baseOnBalls: 'BB', inningsPitched: 'IP' };
                const displayCat = displayCatMap[statCat];
                if (!isLineLive(liveOdds, playerName, displayCat)) { return; }
                const targetLineMap = { strikeOuts: 5.5, earnedRuns: 2.5, hitsAllowed: 5.5, baseOnBalls: 2.5, inningsPitched: 5.0 };
                const targetLine = targetLineMap[statCat];
                // For hitsAllowed, the gameLog stat key is 'hits' (in the pitching stat group)
                const gameLogKey = statCat === 'hitsAllowed' ? 'hits' : statCat;
                
                let call = 'UNDER';
                let color = '#ef4444';
                let confidenceScore = 50;

                // Pitcher Projection Data
                const gamesStarted = gameLogs.length;
                const seasonAvg = gameLogs.reduce((s, g) => {
                   const raw = g.stat[gameLogKey];
                   // inningsPitched comes as string like '6.0', parse with parseFloat
                   return s + (statCat === 'inningsPitched' ? (parseFloat(raw) || 0) : (parseInt(raw) || 0));
                }, 0) / gamesStarted;
                
                if (gamesStarted < 2) return; // Not enough data

                const recentStarts = gameLogs.slice(0, 5);
                const recentAvg = recentStarts.reduce((s, g) => {
                   const raw = g.stat[gameLogKey];
                   return s + (statCat === 'inningsPitched' ? (parseFloat(raw) || 0) : (parseInt(raw) || 0));
                }, 0) / recentStarts.length;

                let baseProjection = (seasonAvg * 0.4 + recentAvg * 0.6);
                
                // Base evaluation per stat
                // K OVER = good (strikeout pitcher), ER OVER = bad, HA OVER = bad, BB OVER = bad, IP OVER = good
                if (statCat === 'strikeOuts' && seasonAvg > 6) { call = 'OVER'; color = '#4ade80'; confidenceScore += 10; }
                if (statCat === 'earnedRuns' && seasonAvg > 3.5) { call = 'OVER'; color = '#4ade80'; confidenceScore += 10; }
                if (statCat === 'earnedRuns' && pProfile.era < 3.20) { call = 'STRONG UNDER'; color = '#ef4444'; confidenceScore += 15; }
                if (statCat === 'hitsAllowed' && seasonAvg > 6) { call = 'OVER'; color = '#4ade80'; confidenceScore += 10; }
                if (statCat === 'hitsAllowed' && pProfile.era < 3.20) { call = 'STRONG UNDER'; color = '#ef4444'; confidenceScore += 10; }
                if (statCat === 'baseOnBalls' && seasonAvg > 3.5) { call = 'OVER'; color = '#4ade80'; confidenceScore += 10; }
                if (statCat === 'baseOnBalls' && seasonAvg < 1.5) { call = 'STRONG UNDER'; color = '#ef4444'; confidenceScore += 10; }
                if (statCat === 'inningsPitched' && seasonAvg > 5.5) { call = 'OVER'; color = '#4ade80'; confidenceScore += 10; }
                if (statCat === 'inningsPitched' && seasonAvg < 4.5) { call = 'UNDER'; color = '#ef4444'; confidenceScore += 10; }
                
                // Momentum
                let streakText = "";
                const recent = gameLogs.slice(0, 10);
                let overCount = 0;
                let underCount = 0;
                recent.forEach(log => {
                   const raw = log.stat[gameLogKey];
                   const val = statCat === 'inningsPitched' ? (parseFloat(raw) || 0) : (parseInt(raw) || 0);
                   if (val > targetLine) overCount++;
                   else underCount++;
                });
                if (call.includes('OVER') && overCount >= 7) { confidenceScore += 15; streakText = `🔥 Dominant: Over in ${overCount} of last ${recent.length}`; }
                else if (call.includes('UNDER') && underCount >= 7) { confidenceScore += 15; streakText = `🧊 Shutdown: Under in ${underCount} of last ${recent.length}`; }
                
                // Gambler's Fallacy
                if (call.includes('OVER') && overCount >= 9) {
                    confidenceScore -= 20; 
                    call = 'UNDER'; 
                    color = '#ef4444';
                    streakText = `👻 Regression Alert: Reverting after ${overCount} straight Overs`;
                }
                
                if (confidenceScore < 60) call = call.replace('STRONG ', '');
                if (confidenceScore > 99) confidenceScore = 99;
                if (confidenceScore < 1) confidenceScore = 1;

                // Confidence scaling for projection
                const confidenceScale = 1.0 + ((confidenceScore - 50) / 500);
                let projectedTarget = Math.max(0, +(baseProjection * confidenceScale).toFixed(1));

                // Phase 3: Apply Learned Adjustments
                let learnedModifier = 0;
                if (learnedAdj[`overall_${displayCat}`]) learnedModifier += learnedAdj[`overall_${displayCat}`];
                if (learnedAdj[isHomePlayer ? `home_${displayCat}` : `away_${displayCat}`]) learnedModifier += learnedAdj[isHomePlayer ? `home_${displayCat}` : `away_${displayCat}`];
                learnedModifier = Math.max(-0.12, Math.min(0.12, learnedModifier));
                if (Math.abs(learnedModifier) > 0.005) {
                   projectedTarget = Math.max(0, +(projectedTarget * (1 + learnedModifier)).toFixed(1));
                }

                let historyStr = "";
                let numAccuracy = null;
                const pHistory = autopsyHistory[pitcher.id]?.[displayCat];
                if (pHistory && pHistory.total > 0) {
                   const hitRate = pHistory.hits / pHistory.total;
                   numAccuracy = hitRate;
                   const sampleWeight = Math.min(1.0, (pHistory.total - 2) / 8);
                   if (pHistory.total >= 3 && hitRate < 0.4) {
                       confidenceScore -= Math.round(15 * sampleWeight);
                       historyStr = ` Struggle History (${(hitRate * 100).toFixed(0)}% accuracy).`;
                   } else if (pHistory.total >= 3 && hitRate > 0.8) {
                       confidenceScore += Math.round(10 * sampleWeight);
                       historyStr = ` Highly Reliable (${(hitRate * 100).toFixed(0)}% accuracy).`;
                   }

                   const oppAbbr = oppName.substring(0, 3).toUpperCase();
                   const oppSplits = pHistory.opponentSplits?.[oppAbbr];
                   if (oppSplits && oppSplits.hits + oppSplits.misses >= 3) {
                       const oppHitRate = oppSplits.hits / (oppSplits.hits + oppSplits.misses);
                       if (oppHitRate <= 0.25) {
                           confidenceScore -= Math.round(25 * sampleWeight); 
                           historyStr += ` 👻 Auto-Corrected: Poor historical accuracy predicting against ${oppAbbr}.`;
                           call = call.includes('OVER') ? 'UNDER' : 'OVER'; 
                           color = call === 'OVER' ? '#4ade80' : '#ef4444';
                       } else if (oppHitRate >= 0.75) {
                           confidenceScore += Math.round(15 * sampleWeight);
                           historyStr += ` 🎯 Genius Lock: Very high accuracy predicting against ${oppAbbr}.`;
                       }
                   }

                   const homeGames = pHistory.homeHits + pHistory.homeMisses;
                   const awayGames = pHistory.awayHits + pHistory.awayMisses;
                   if (isHomePlayer && homeGames >= 3) {
                       const homeRate = pHistory.homeHits / homeGames;
                       if (homeRate <= 0.3) { confidenceScore -= Math.round(20 * sampleWeight); historyStr += ` 👻 Auto-Corrected: Low accuracy at Home.`; }
                       else if (homeRate >= 0.8) { confidenceScore += Math.round(10 * sampleWeight); }
                   } else if (!isHomePlayer && awayGames >= 3) {
                       const awayRate = pHistory.awayHits / awayGames;
                       if (awayRate <= 0.3) { confidenceScore -= Math.round(20 * sampleWeight); historyStr += ` 👻 Auto-Corrected: Low accuracy on the Road.`; }
                       else if (awayRate >= 0.8) { confidenceScore += Math.round(10 * sampleWeight); }
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
                      memoryDesc: memoryText,
                      historicalAccuracy: numAccuracy,
                      totalGames: pHistory ? pHistory.total : 0
                   });
                }
            });
           
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
        });
     }

    playerPredictions.sort((a, b) => {
       const aMaxConf = a.evaluations.length > 0 ? Math.max(...a.evaluations.map(e => e.confidence)) : 0;
       const bMaxConf = b.evaluations.length > 0 ? Math.max(...b.evaluations.map(e => e.confidence)) : 0;
       return bMaxConf - aMaxConf;
    });

    // Log predictions to the Memory Vault asynchronously, enforcing the correct gameDate
    logPredictionsToVault('MLB', playerPredictions, gameDate).catch(console.error);

    const payload = {
       matchups: todayMatchups,
       players: playerPredictions
    };

    try {
       await prisma.dailyCache.upsert({
          where: { sport_gameDate: { sport: 'MLB', gameDate } },
          update: { timestamp: Date.now(), payload: payload },
          create: { sport: 'MLB', gameDate, timestamp: Date.now(), payload: payload }
       });
    } catch (e) {
       console.error('Failed to write cache', e);
    }

    return NextResponse.json(payload);

  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
