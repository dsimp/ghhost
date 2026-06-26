async function testWNBA() {
  try {
    const { fetchNBA } = await import('./src/app/api/nba/fetchNBA.js');
    const data = await fetchNBA('commonallplayers', {
      IsOnlyCurrentSeason: '1',
      LeagueID: '10',
      Season: '2024-25'
    });
    console.log("WNBA Players count:", data.resultSets[0].rowSet.length);
    console.log("First player:", data.resultSets[0].rowSet[0]);
  } catch (e) {
    console.error(e);
  }
}

testWNBA();
