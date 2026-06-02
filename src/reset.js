const fs = require('fs');
const path = require('path');
const vaultPath = path.join(__dirname, 'data', 'ghhost_memory.json');
const vault = JSON.parse(fs.readFileSync(vaultPath, 'utf8'));

if (vault.predictions['2026-05-08'] && vault.predictions['2026-05-08'].NBA) {
   vault.predictions['2026-05-08'].NBA.forEach(player => {
      player.evaluations.forEach(eval => {
         if (eval.contextNote === "DNP / No Game Played") {
            eval.graded = false;
            eval.hit = null;
            eval.actualResult = null;
            eval.contextNote = null;
            
            // Clean player history
            const hist = vault.playerHistory[player.playerId]?.[eval.category];
            if (hist) {
               hist.total--;
               hist.misses--;
            }
         }
      });
   });
}

fs.writeFileSync(vaultPath, JSON.stringify(vault, null, 2));
console.log('Reset complete');
