const { fetchNBA } = require('./app/api/nba/fetchNBA.js');

async function test() {
   const logData = await fetchNBA('playergamelog', {
      PlayerID: '1626162',
      Season: '2025-26', 
      SeasonType: 'Regular Season'
   });
   
   if (!logData || !logData.resultSets) {
      console.log('No resultSets:', logData);
      return;
   }
   const rowSet = logData.resultSets[0].rowSet || [];
   const headers = logData.resultSets[0].headers || [];
   
   console.log('Headers:', headers);
   console.log('First 5 rows game dates:');
   rowSet.slice(0, 5).forEach(row => {
       const gameDateStr = row[headers.indexOf('GAME_DATE')];
       const gameDate = new Date(gameDateStr);
       console.log(gameDateStr, '=>', gameDate);
   });
}
test().catch(console.error);
