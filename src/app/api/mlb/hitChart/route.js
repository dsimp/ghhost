import { NextResponse } from 'next/server';
import { fetchMLB } from '../fetchMLB';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const playerId = searchParams.get('playerId');
  const isPitcher = searchParams.get('isPitcher') === 'true';

  if (!playerId) {
    return NextResponse.json({ error: "Missing playerId" }, { status: 400 });
  }

  try {
    const group = isPitcher ? 'pitching' : 'hitting';
    const data = await fetchMLB(`people/${playerId}/stats`, {
      stats: 'sprayChart',
      group: group,
      season: 2024
    });

    if (!data || !data.stats || data.stats.length === 0) {
      return NextResponse.json({ sprayChart: null, simulatedHits: [] });
    }

    const sprayStats = data.stats[0].splits[0].stat;
    
    // We simulate hit coordinates based on the zones since the official StatsAPI only gives zone distribution.
    // This provides interactive coordinates for our D3 FieldMap component.
    const simulatedHits = [];
    let idCounter = 1;
    
    const generateHitsForZone = (count, zoneKey) => {
      // Base generation parameters for D3 Field
      // Angles are from -45 (left foul line) to +45 (right foul line)
      for(let i=0; i<count; i++) {
        let x, y;
        // Mock distances (0 to 100 scale where 100 is home run fence)
        // Hit distribution: skew towards 50-90 for outfield zones
        const distance = 30 + Math.random() * 70; 
        let angle;
        
        switch(zoneKey) {
          case 'leftField': angle = Math.random() * 20 - 45; break; // -45 to -25 deg
          case 'leftCenterField': angle = Math.random() * 20 - 25; break; // -25 to -5 deg
          case 'centerField': angle = Math.random() * 10 - 5; break; // -5 to 5 deg
          case 'rightCenterField': angle = Math.random() * 20 + 5; break; // 5 to 25 deg
          case 'rightField': angle = Math.random() * 20 + 25; break; // 25 to 45 deg
          default: angle = 0;
        }
        
        // Convert to Cartesian (0,0 is home plate)
        const rad = angle * Math.PI / 180;
        x = distance * Math.sin(rad); // negative is left, positive is right
        y = distance * Math.cos(rad); // positive is forward into field
        
        simulatedHits.push({ id: idCounter++, x, y, zone: zoneKey });
      }
    };
    
    if (sprayStats) {
      if (sprayStats.leftField) generateHitsForZone(sprayStats.leftField, 'leftField');
      if (sprayStats.leftCenterField) generateHitsForZone(sprayStats.leftCenterField, 'leftCenterField');
      if (sprayStats.centerField) generateHitsForZone(sprayStats.centerField, 'centerField');
      if (sprayStats.rightCenterField) generateHitsForZone(sprayStats.rightCenterField, 'rightCenterField');
      if (sprayStats.rightField) generateHitsForZone(sprayStats.rightField, 'rightField');
    }

    return NextResponse.json({ 
      sprayChart: sprayStats, 
      simulatedHits 
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
