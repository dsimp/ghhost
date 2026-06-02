import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { fetchNBA } from '../../nba/fetchNBA';
import { fetchMLB } from '../../mlb/fetchMLB';

const VAULT_PATH = path.join(process.cwd(), 'src', 'data', 'ghhost_memory.json');

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    // Optional date param, otherwise grades all ungraded past dates
    const specificDate = searchParams.get('date'); 

    const data = await fs.readFile(VAULT_PATH, 'utf-8');
    const vault = JSON.parse(data);

    let gradedCount = 0;
    
    // YYYY-MM-DD format for comparison
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });

    for (const [dateKey, sportsData] of Object.entries(vault.predictions)) {
      if (dateKey >= todayStr && !specificDate) continue; // Can't grade today or future until games finish
      if (specificDate && dateKey !== specificDate) continue;

      // Grade NBA
      if (sportsData.NBA && sportsData.NBA.length > 0) {
        for (const playerPrediction of sportsData.NBA) {
          const ungraded = playerPrediction.evaluations.filter(e => e.graded === false);
          if (ungraded.length === 0) continue;

           try {
             // Add a 500ms delay to avoid rate limits
             await new Promise(resolve => setTimeout(resolve, 500));

             // Determine season type based on date (Playoffs start mid-April)
             const isPlayoffs = dateKey >= '2026-04-15';

             // Fetch actual game log for this player
             const logData = await fetchNBA('playergamelog', {
                PlayerID: playerPrediction.playerId,
                Season: '2025-26',
                SeasonType: isPlayoffs ? 'Playoffs' : 'Regular Season'
             });

             const rowSet = logData?.resultSets?.[0]?.rowSet || [];
             const headers = logData?.resultSets?.[0]?.headers || [];
             
             // NBA Game Logs use "MON DD, YYYY" format usually.
             // We need to parse dateKey YYYY-MM-DD to match, or just grab the most recent game if dates are close
             // For precision, we just find the game where date matches or is closest
             const targetDateObj = new Date(dateKey);
             
             const actualGameLog = rowSet.find(row => {
                const gameDateStr = row[headers.indexOf('GAME_DATE')];
                const gameDate = new Date(gameDateStr);
                // If it happened on or within 1 day of the prediction (tz issues)
                return Math.abs(gameDate - targetDateObj) <= (1000 * 60 * 60 * 24); 
             });

             if (actualGameLog) {
                ungraded.forEach(evaluation => {
                   const actualStat = actualGameLog[headers.indexOf(evaluation.category)] || 0;
                   const targetLine = parseFloat(evaluation.target);
                   
                   let isHit = false;
                   if (evaluation.call === 'OVER') isHit = actualStat > targetLine;
                   if (evaluation.call === 'UNDER') isHit = actualStat < targetLine;

                   evaluation.graded = true;
                   evaluation.hit = isHit;
                   evaluation.actualResult = actualStat;

                   // Contextual Autopsy on Misses
                   if (!isHit) {
                      const mins = parseFloat(actualGameLog[headers.indexOf('MIN')]) || 0;
                      const fouls = parseInt(actualGameLog[headers.indexOf('PF')]) || 0;
                      
                      if (evaluation.call === 'OVER') {
                         if (mins < 25) evaluation.contextNote = `Blowout / Injury Risk (Played ${mins} mins)`;
                         else if (fouls >= 5) evaluation.contextNote = `Foul Trouble (${fouls} PF)`;
                         else evaluation.contextNote = "Pure Miss (Failed to execute)";
                      } else {
                         evaluation.contextNote = "Pure Miss (Opponent exploded)";
                      }
                   }

                   // Update Global Player History
                   if (!vault.playerHistory[playerPrediction.playerId]) vault.playerHistory[playerPrediction.playerId] = {};
                   if (!vault.playerHistory[playerPrediction.playerId][evaluation.category]) {
                      vault.playerHistory[playerPrediction.playerId][evaluation.category] = { total: 0, hits: 0, misses: 0, contextWarnings: [] };
                   }

                   const historyRef = vault.playerHistory[playerPrediction.playerId][evaluation.category];
                   historyRef.total++;
                   if (isHit) historyRef.hits++;
                   else {
                      historyRef.misses++;
                      if (evaluation.contextNote && !evaluation.contextNote.includes("Pure Miss")) {
                         historyRef.contextWarnings.push(evaluation.contextNote);
                      }
                   }
                   gradedCount++;
                });
             } else {
                // If there was no game log found for this date, the player didn't play (DNP) or the game didn't exist
                ungraded.forEach(evaluation => {
                   evaluation.graded = true;
                   evaluation.hit = false;
                   evaluation.actualResult = 0;
                   evaluation.contextNote = "DNP / No Game Played";
                   gradedCount++;
                });
             }
          } catch (e) {
             console.error(`Failed to grade NBA player ${playerPrediction.playerId}`, e);
          }
        }
      }

      // Grade MLB
      if (sportsData.MLB && sportsData.MLB.length > 0) {
        for (const playerPrediction of sportsData.MLB) {
          const ungraded = playerPrediction.evaluations.filter(e => e.graded === false);
          if (ungraded.length === 0) continue;

          try {
             // Add a 300ms delay to avoid rate limits
             await new Promise(resolve => setTimeout(resolve, 300));

             const peopleData = await fetchMLB('people', {
                personIds: playerPrediction.playerId,
                hydrate: 'stats(group=[hitting],type=[gameLog],season=2026)'
             });

             const player = peopleData?.people?.[0];
             let actualGameLog = null;
             
             player?.stats?.forEach(statGroup => {
                if (statGroup.type.displayName === 'gameLog') {
                   // MLB dates are YYYY-MM-DD exactly
                   actualGameLog = statGroup.splits.find(s => s.date === dateKey);
                }
             });

             if (actualGameLog) {
                ungraded.forEach(evaluation => {
                   const rawStatKey = evaluation.category === 'H' ? 'hits' : 'totalBases';
                   const actualStat = parseInt(actualGameLog.stat[rawStatKey]) || 0;
                   const targetLine = parseFloat(evaluation.target);
                   
                   let isHit = false;
                   if (evaluation.call === 'OVER') isHit = actualStat > targetLine;
                   if (evaluation.call === 'UNDER') isHit = actualStat < targetLine;

                   evaluation.graded = true;
                   evaluation.hit = isHit;
                   evaluation.actualResult = actualStat;

                   // Contextual Autopsy
                   if (!isHit) {
                      const atBats = parseInt(actualGameLog.stat.atBats) || 0;
                      if (evaluation.call === 'OVER' && atBats < 3) {
                         evaluation.contextNote = `Subbed Out Early (${atBats} AB)`;
                      } else {
                         evaluation.contextNote = "Pure Miss";
                      }
                   }

                   // Update Global Player History
                   if (!vault.playerHistory[playerPrediction.playerId]) vault.playerHistory[playerPrediction.playerId] = {};
                   if (!vault.playerHistory[playerPrediction.playerId][evaluation.category]) {
                      vault.playerHistory[playerPrediction.playerId][evaluation.category] = { total: 0, hits: 0, misses: 0, contextWarnings: [] };
                   }

                   const historyRef = vault.playerHistory[playerPrediction.playerId][evaluation.category];
                   historyRef.total++;
                   if (isHit) historyRef.hits++;
                   else {
                      historyRef.misses++;
                      if (evaluation.contextNote && !evaluation.contextNote.includes("Pure Miss")) {
                         historyRef.contextWarnings.push(evaluation.contextNote);
                      }
                   }
                   gradedCount++;
                });
             }
          } catch (e) {
             console.error(`Failed to grade MLB player ${playerPrediction.playerId}`, e);
          }
        }
      }
    }

    // Save graded data back to Vault
    await fs.writeFile(VAULT_PATH, JSON.stringify(vault, null, 2), 'utf-8');

    return NextResponse.json({ 
       message: `Autopsy Complete. Graded ${gradedCount} predictions.`,
       gradedCount 
    });

  } catch (error) {
    console.error("Autopsy Failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
