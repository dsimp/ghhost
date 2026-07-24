import { NextResponse } from 'next/server';
import { fetchAvailableProps, isLineLive } from '../../../../engines/shared/oddsFetcher';
import { safeWriteCache } from '../../../../engines/shared/cacheGuard';
import { fetchNFL } from '../fetchNFL';
import { logPredictionsToVault, getFullPlayerHistory, getLearnedAdjustments } from '../../memory/vault';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = global;
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// NFL Stadium coordinates for weather (lat, lng, isDome)
const NFL_STADIUMS = {
  ARI: { lat: 33.528, lng: -112.263, dome: true },
  ATL: { lat: 33.755, lng: -84.401, dome: true },
  BAL: { lat: 39.278, lng: -76.623, dome: false },
  BUF: { lat: 42.774, lng: -78.787, dome: false },
  CAR: { lat: 35.226, lng: -80.853, dome: false },
  CHI: { lat: 41.862, lng: -87.617, dome: false },
  CIN: { lat: 39.095, lng: -84.516, dome: false },
  CLE: { lat: 41.506, lng: -81.700, dome: false },
  DAL: { lat: 32.748, lng: -97.093, dome: true },
  DEN: { lat: 39.744, lng: -105.020, dome: false },
  DET: { lat: 42.340, lng: -83.046, dome: true },
  GB:  { lat: 44.501, lng: -88.062, dome: false },
  HOU: { lat: 29.685, lng: -95.411, dome: true },
  IND: { lat: 39.760, lng: -86.164, dome: true },
  JAX: { lat: 30.324, lng: -81.637, dome: false },
  KC:  { lat: 39.049, lng: -94.484, dome: false },
  LAC: { lat: 33.953, lng: -118.339, dome: true },
  LAR: { lat: 33.953, lng: -118.339, dome: true },
  LV:  { lat: 36.091, lng: -115.184, dome: true },
  MIA: { lat: 25.958, lng: -80.239, dome: false },
  MIN: { lat: 44.974, lng: -93.258, dome: true },
  NE:  { lat: 42.091, lng: -71.264, dome: false },
  NO:  { lat: 29.951, lng: -90.081, dome: true },
  NYG: { lat: 40.813, lng: -74.074, dome: false },
  NYJ: { lat: 40.813, lng: -74.074, dome: false },
  PHI: { lat: 39.901, lng: -75.167, dome: false },
  PIT: { lat: 40.447, lng: -80.016, dome: false },
  SEA: { lat: 47.595, lng: -122.332, dome: false },
  SF:  { lat: 37.403, lng: -121.970, dome: false },
  TB:  { lat: 27.976, lng: -82.503, dome: false },
  TEN: { lat: 36.166, lng: -86.771, dome: false },
  WAS: { lat: 38.908, lng: -76.865, dome: false }
};

// Fetch weather from Open-Meteo (free, no API key needed)
async function getGameWeather(teamAbbr) {
  const stadium = NFL_STADIUMS[teamAbbr];
  if (!stadium) return null;
  if (stadium.dome) return { dome: true, temp: 72, wind: 0, precip: 0, desc: '🏟️ Dome' };
  
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${stadium.lat}&longitude=${stadium.lng}&current=temperature_2m,wind_speed_10m,precipitation&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    const c = data?.current;
    if (!c) return null;
    
    return {
      dome: false,
      temp: Math.round(c.temperature_2m || 60),
      wind: Math.round(c.wind_speed_10m || 0),
      precip: c.precipitation || 0,
      desc: `${Math.round(c.temperature_2m)}°F, ${Math.round(c.wind_speed_10m)}mph wind`
    };
  } catch {
    return null;
  }
}

// Weather impact for NFL — affects passing significantly
function calcNFLWeatherModifier(weather, statCat) {
  if (!weather || weather.dome) return 1.0;
  
  let modifier = 1.0;
  
  // Passing-related stats: Pass Yds, Rec Yds, Completions, Pass TDs, Rec TDs, Receptions
  const passingCats = ['passYds', 'recYds', 'completions', 'passTDs', 'recTDs', 'receptions'];
  if (passingCats.includes(statCat)) {
    // Wind crushes passing games
    if (weather.wind >= 25) modifier *= 0.82;
    else if (weather.wind >= 20) modifier *= 0.88;
    else if (weather.wind >= 15) modifier *= 0.94;
    
    // Cold affects grip/throwing
    if (weather.temp <= 25) modifier *= 0.90;
    else if (weather.temp <= 35) modifier *= 0.95;
    
    // Rain/precipitation
    if (weather.precip > 0.5) modifier *= 0.90;
    else if (weather.precip > 0.1) modifier *= 0.95;
  }
  
  // Rushing-related stats: Rush Yds, Rush TDs, Rush Attempts
  const rushingCats = ['rushYds', 'rushTDs', 'rushAtt'];
  if (rushingCats.includes(statCat)) {
    // Bad weather BOOSTS rushing (teams run more)
    if (weather.wind >= 20 || weather.precip > 0.3) modifier *= 1.08;
    else if (weather.wind >= 15) modifier *= 1.04;
  }
  
  // Interceptions: bad weather increases INTs
  if (statCat === 'interceptions') {
    if (weather.wind >= 20 || weather.precip > 0.3) modifier *= 1.15;
    else if (weather.wind >= 15) modifier *= 1.08;
  }
  
  // Kicking/FGs would be affected but we don't track those
  // Defensive stats (sacks, tackles) are mostly weather-neutral
  
  return modifier;
}

export async function GET(request) {
  const liveOdds = await fetchAvailableProps('NFL');
  const gameDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });

  try {
     const cached = await prisma.dailyCache.findUnique({
       where: { sport_gameDate: { sport: 'NFL', gameDate } }
     });
     if (cached) {
        const now = Date.now();
        if ((now - Number(cached.timestamp)) < 3600000) {
            return NextResponse.json(cached.payload);
        }
     }
  } catch (e) {}

  try {
    // 1. Fetch today's scoreboard
    const dateObj = new Date();
    const year = dateObj.getFullYear();
    const scoreboardData = await fetchNFL(`scoreboard?dates=${year}`);
    const events = scoreboardData?.events || [];
    
    // Filter to pre-game events only (upcoming games)
    const upcomingGames = events.filter(e => 
      e.status.type.state === 'pre' || e.status.type.state === 'in'
    );
    
    if (upcomingGames.length === 0) {
       const emptyPayload = { matchups: [], players: [], message: 'No NFL games scheduled for today. Check back during the season!' };
       try {
         await safeWriteCache('NFL', gameDate, emptyPayload);
       } catch(e) {}
       return NextResponse.json(emptyPayload);
    }

    // 2. Parse matchups
    const todayMatchups = [];
    const gameTeamMap = {}; // teamAbbr → opponent info

    upcomingGames.forEach(event => {
      const competitors = event.competitions?.[0]?.competitors || [];
      if (competitors.length < 2) return;
      
      const homeTeam = competitors.find(c => c.homeAway === 'home');
      const awayTeam = competitors.find(c => c.homeAway === 'away');
      if (!homeTeam || !awayTeam) return;
      
      const homeAbbr = homeTeam.team.abbreviation;
      const awayAbbr = awayTeam.team.abbreviation;
      
      todayMatchups.push({ 
        home: homeTeam.team.displayName, 
        away: awayTeam.team.displayName 
      });
      
      gameTeamMap[homeAbbr] = { 
        opponent: awayAbbr, 
        oppName: awayTeam.team.displayName,
        isHome: true 
      };
      gameTeamMap[awayAbbr] = { 
        opponent: homeAbbr, 
        oppName: homeTeam.team.displayName,
        isHome: false,
        venueTeam: homeAbbr // Away team plays in home team's stadium
      };
    });

    // 3. Fetch team stats and player leaders
    const [teamsData, ...athleteResults] = await Promise.all([
      fetchNFL('teams?limit=32').catch(() => null),
      ...Object.keys(gameTeamMap).map(abbr => 
        fetchNFL(`teams/${abbr}/roster?limit=100`).catch(() => null)
      )
    ]);

    // 4. Fetch weather for each venue
    const venueTeams = [...new Set(upcomingGames.map(e => {
      const home = e.competitions?.[0]?.competitors?.find(c => c.homeAway === 'home');
      return home?.team?.abbreviation;
    }).filter(Boolean))];
    
    const weatherMap = {};
    await Promise.all(venueTeams.map(async (abbr) => {
      weatherMap[abbr] = await getGameWeather(abbr);
    }));

    // 5. Fetch full player season stats from ESPN
    // ESPN provides athletes with stats via the teams endpoint
    const playerStatsPromises = Object.keys(gameTeamMap).map(async (teamAbbr) => {
      try {
        const data = await fetchNFL(`teams/${teamAbbr}/statistics`);
        return { teamAbbr, data };
      } catch {
        return { teamAbbr, data: null };
      }
    });
    
    const teamStatsResults = await Promise.all(playerStatsPromises);
    
    // Build team stats map
    const teamStatsMap = {};
    teamStatsResults.forEach(({ teamAbbr, data }) => {
      if (data) teamStatsMap[teamAbbr] = data;
    });

    // 6. Fetch Vault Memory + Learned Adjustments
    const autopsyHistory = await getFullPlayerHistory();
    const learnedAdj = await getLearnedAdjustments('NFL');

    // 7. Build Player Predictions
    const playerPredictions = [];

    // Process each team's key players from the stats leaders
    for (const [teamAbbr, teamInfo] of Object.entries(gameTeamMap)) {
      const oppAbbr = teamInfo.opponent;
      const isHome = teamInfo.isHome;
      const venueAbbr = isHome ? teamAbbr : teamInfo.venueTeam;
      const weather = weatherMap[venueAbbr] || null;
      
      // Try to get team statistics
      const teamStats = teamStatsMap[teamAbbr];
      if (!teamStats) continue;
      
      // Extract statistical leaders from ESPN team stats
      const categories = teamStats?.results?.stats?.categories || teamStats?.statistics?.splits?.categories || [];
      
      // Get passing, rushing, receiving leaders
      const statLeaders = extractStatLeaders(teamStats, teamAbbr);
      
      statLeaders.forEach(player => {
        const statEvaluations = [];
        
        player.stats.forEach(({ category, displayCat, avg, targetLine }) => {
          if (!isLineLive(liveOdds, player.name, displayCat)) { return; }
          let call = avg > targetLine ? 'OVER' : 'UNDER';
          let color = call === 'OVER' ? '#4ade80' : '#ef4444';
          let confidenceScore = 50;
          
          // Home field advantage
          if (isHome) {
            if (call === 'OVER') confidenceScore += 5;
          } else {
            if (call === 'OVER') confidenceScore -= 3;
          }
          
          // Strong performance (>20% above line)
          if (avg > targetLine * 1.2) {
            call = 'STRONG OVER';
            color = '#22c55e';
            confidenceScore += 15;
          } else if (avg < targetLine * 0.8) {
            call = 'STRONG UNDER';
            color = '#ef4444';
            confidenceScore += 15;
          }
          
          // Weather impact
          const weatherMod = calcNFLWeatherModifier(weather, category);
          let weatherText = '';
          if (weatherMod < 0.95) {
            confidenceScore -= 10;
            weatherText = ` 🌧️ Weather Impact (${((1 - weatherMod) * 100).toFixed(0)}% suppression)`;
            // Flip to UNDER if weather is terrible for passing
            if (weatherMod < 0.88 && call.includes('OVER') && (category === 'passYds' || category === 'recYds')) {
              call = 'UNDER';
              color = '#ef4444';
              confidenceScore += 10;
            }
          } else if (weatherMod > 1.03) {
            confidenceScore += 5;
            weatherText = ` 🌧️ Rush Boost (bad weather = more carries)`;
          }
          
          // Vault memory
          let historyStr = '';
          let numAccuracy = null;
          const pHistory = autopsyHistory[player.id]?.[displayCat];
          if (pHistory && pHistory.total > 0) {
            const hitRate = pHistory.hits / pHistory.total;
            numAccuracy = hitRate;
            const sampleWeight = Math.min(1.0, (pHistory.total - 2) / 8);
            
            if (pHistory.total >= 3 && hitRate < 0.4) {
              confidenceScore -= Math.round(15 * sampleWeight);
              historyStr = ` Historical struggle (${(hitRate * 100).toFixed(0)}% accuracy).`;
            } else if (pHistory.total >= 3 && hitRate > 0.8) {
              confidenceScore += Math.round(10 * sampleWeight);
              historyStr = ` Historical lock (${(hitRate * 100).toFixed(0)}% accuracy).`;
            }
          }
          
          // Cap and clamp
          if (confidenceScore < 60) call = call.replace('STRONG ', '');
          if (confidenceScore > 99) confidenceScore = 99;
          if (confidenceScore < 1) confidenceScore = 1;
          
          // Data-driven projection
          let projectedTarget = avg * weatherMod;
          
          // Phase 3: Learned adjustments
          let learnedModifier = 0;
          if (learnedAdj[`overall_${displayCat}`]) learnedModifier += learnedAdj[`overall_${displayCat}`];
          if (learnedAdj[isHome ? `home_${displayCat}` : `away_${displayCat}`]) learnedModifier += learnedAdj[isHome ? `home_${displayCat}` : `away_${displayCat}`];
          if (learnedAdj[`vs_${oppAbbr}_${displayCat}`]) learnedModifier += learnedAdj[`vs_${oppAbbr}_${displayCat}`];
          learnedModifier = Math.max(-0.12, Math.min(0.12, learnedModifier));
          if (Math.abs(learnedModifier) > 0.005) {
            projectedTarget *= (1 + learnedModifier);
          }
          
          // Confidence scaling
          const confidenceScale = 1.0 + ((confidenceScore - 50) / 500);
          projectedTarget = Math.max(0, +(projectedTarget * confidenceScale).toFixed(1));
          
          const callDirection = call.includes('OVER') ? 'OVER' : 'UNDER';
          const memoryText = `👻 Ghhost Prediction: ${callDirection} for today. Pinpoint projection: ${projectedTarget} ${displayCat}.${historyStr}`;
          
          statEvaluations.push({
            category: displayCat,
            avg: targetLine.toString(),
            projectedTarget,
            call,
            color,
            rank: null,
            defensiveRank: null,
            confidence: confidenceScore,
            oppDesc: `vs ${oppAbbr}${weatherText}`,
            streakDesc: weather?.desc || '',
            spatialDesc: weather?.dome ? '🏟️ Indoor' : '',
            memoryDesc: memoryText,
            historicalAccuracy: numAccuracy,
            totalGames: pHistory ? pHistory.total : 0
          });
        });
        
        const highConfidenceEvals = statEvaluations.filter(e => e.confidence >= 55);
        if (highConfidenceEvals.length > 0) {
          playerPredictions.push({
            player: player.name,
            playerId: player.id,
            position: player.position,
            team: teamAbbr,
            opponent: teamInfo.oppName,
            opponentAbbr: oppAbbr,
            opponentId: oppAbbr,
            isHome,
            evaluations: highConfidenceEvals
          });
        }
      });
    }

    // Sort by strong call count
    playerPredictions.sort((a, b) => {
      const aStrong = a.evaluations.filter(e => e.call.includes('STRONG')).length;
      const bStrong = b.evaluations.filter(e => e.call.includes('STRONG')).length;
      return bStrong - aStrong;
    });

    // Log predictions to the Memory Vault asynchronously, enforcing the correct gameDate
    logPredictionsToVault('NFL', playerPredictions, gameDate).catch(console.error);

    const payload = { matchups: todayMatchups, players: playerPredictions };

    try {
       await safeWriteCache('NFL', gameDate, payload);
    } catch (e) {
       console.error('Failed to write NFL cache', e);
    }

    return NextResponse.json(payload);

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * Extract key statistical leaders from ESPN team stats response.
 * Returns array of player objects with their stat categories.
 */
function extractStatLeaders(teamStats, teamAbbr) {
  const leaders = [];
  
  try {
    // ESPN provides leaders in various stat categories
    const statCategories = teamStats?.leaders || teamStats?.results?.leaders || [];
    
    // If leaders are available in the standard format
    if (Array.isArray(statCategories)) {
      statCategories.forEach(cat => {
        const catName = (cat.name || cat.displayName || '').toLowerCase();
        const catLeaders = cat.leaders || [];
        
        catLeaders.forEach(leader => {
          const athlete = leader.athlete || leader.player || {};
          const displayValue = leader.displayValue || leader.value || '0';
          
          if (!athlete.id) return;
          
          const statInfos = [];
          const avgValue = parseFloat(displayValue) || 0;
          
          // Passing stats
          if (catName.includes('passing') && catName.includes('yard')) {
            statInfos.push({ category: 'passYds', displayCat: 'PASS YDS', avg: avgValue, targetLine: 225 });
          } else if (catName.includes('passing') && catName.includes('touchdown')) {
            statInfos.push({ category: 'passTDs', displayCat: 'PASS TDS', avg: avgValue, targetLine: 1.5 });
          } else if (catName.includes('completion') || (catName.includes('passing') && catName.includes('comp'))) {
            statInfos.push({ category: 'completions', displayCat: 'COMP', avg: avgValue, targetLine: 22 });
          } else if (catName.includes('interception') && !catName.includes('defense')) {
            statInfos.push({ category: 'interceptions', displayCat: 'INT', avg: avgValue, targetLine: 0.5 });
          }
          // Rushing stats
          else if (catName.includes('rushing') && catName.includes('yard')) {
            statInfos.push({ category: 'rushYds', displayCat: 'RUSH YDS', avg: avgValue, targetLine: 60 });
          } else if (catName.includes('rushing') && catName.includes('touchdown')) {
            statInfos.push({ category: 'rushTDs', displayCat: 'RUSH TDS', avg: avgValue, targetLine: 0.5 });
          } else if (catName.includes('rushing') && catName.includes('attempt')) {
            statInfos.push({ category: 'rushAtt', displayCat: 'RUSH ATT', avg: avgValue, targetLine: 14 });
          }
          // Receiving stats
          else if (catName.includes('receiving') && catName.includes('yard')) {
            statInfos.push({ category: 'recYds', displayCat: 'REC YDS', avg: avgValue, targetLine: 55 });
          } else if (catName.includes('reception')) {
            statInfos.push({ category: 'receptions', displayCat: 'REC', avg: avgValue, targetLine: 4.5 });
          } else if (catName.includes('receiving') && catName.includes('touchdown')) {
            statInfos.push({ category: 'recTDs', displayCat: 'REC TDS', avg: avgValue, targetLine: 0.5 });
          }
          // Defensive stats
          else if (catName.includes('sack')) {
            statInfos.push({ category: 'sacks', displayCat: 'SACKS', avg: avgValue, targetLine: 0.5 });
          } else if (catName.includes('tackle')) {
            statInfos.push({ category: 'tackles', displayCat: 'TACKLES', avg: avgValue, targetLine: 5.5 });
          }
          // Generic passing/rushing/receiving (single-word match fallback)
          else if (catName.includes('passing')) {
            statInfos.push({ category: 'passYds', displayCat: 'PASS YDS', avg: avgValue, targetLine: 225 });
          } else if (catName.includes('rushing')) {
            statInfos.push({ category: 'rushYds', displayCat: 'RUSH YDS', avg: avgValue, targetLine: 60 });
          } else if (catName.includes('receiving')) {
            statInfos.push({ category: 'recYds', displayCat: 'REC YDS', avg: avgValue, targetLine: 55 });
          }
          
          statInfos.forEach(statInfo => {
            const existing = leaders.find(l => l.id === String(athlete.id));
            if (existing) {
              // Don't add duplicate categories
              if (!existing.stats.some(s => s.category === statInfo.category)) {
                existing.stats.push(statInfo);
              }
            } else {
              leaders.push({
                id: String(athlete.id),
                name: athlete.displayName || athlete.fullName || 'Unknown',
                position: athlete.position?.abbreviation || '',
                team: teamAbbr,
                stats: [statInfo]
              });
            }
          });
        });
      });
    }
    
    // Fallback: If no leaders found, create team-level predictions
    if (leaders.length === 0) {
      const teamId = `team_${teamAbbr}`;
      leaders.push({
        id: teamId,
        name: `${teamAbbr} Offense`,
        position: 'TEAM',
        team: teamAbbr,
        stats: [
          { category: 'passYds', displayCat: 'PASS YDS', avg: 225, targetLine: 225 },
          { category: 'rushYds', displayCat: 'RUSH YDS', avg: 115, targetLine: 110 },
          { category: 'passTDs', displayCat: 'PASS TDS', avg: 1.8, targetLine: 1.5 }
        ]
      });
    }
  } catch (e) {
    // Return empty if parsing fails
  }
  
  return leaders;
}

