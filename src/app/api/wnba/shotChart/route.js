import { NextResponse } from 'next/server';
import { fetchNBA } from '../fetchNBA';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const playerId = searchParams.get('playerId');
  const teamId = searchParams.get('teamId');
  const defenseMode = searchParams.get('defenseMode') === 'true';
  const season = searchParams.get('season') || '2026';

  if (!playerId && !teamId) {
    return NextResponse.json({ error: 'Missing playerId or teamId' }, { status: 400 });
  }

  // If defenseMode is true, we want shots where Opponent = teamId and Player = anyone.
  const targetPlayerId = defenseMode ? '0' : playerId;
  const targetOpponentId = defenseMode ? teamId : '0';

  try {
    const data = await fetchNBA('shotchartdetail', {
      ContextMeasure: 'FGA',
      LastNGames: '0',
      LeagueID: '10',
      Month: '0',
      OpponentTeamID: targetOpponentId,
      Period: '0',
      PlayerID: targetPlayerId,
      Position: '',
      SeasonType: 'Regular Season',
      TeamID: '0', 
      VsConference: '',
      VsDivision: '',
      GameSegment: '',
      ClutchTime: '',
      Outcome: '',
      Location: '',
      Season: season,
      DateFrom: '',
      DateTo: '',
      PlayerPosition: ''
    });

    const shotSet = data.resultSets[0];
    const headers = shotSet.headers;
    
    // We only need a subset for the court mapping
    const shots = shotSet.rowSet.map(row => ({
      id: row[headers.indexOf('GAME_EVENT_ID')],
      game_id: row[headers.indexOf('GAME_ID')],
      game_date: row[headers.indexOf('GAME_DATE')],
      period: row[headers.indexOf('PERIOD')],
      minutes_remaining: row[headers.indexOf('MINUTES_REMAINING')],
      seconds_remaining: row[headers.indexOf('SECONDS_REMAINING')],
      event_type: row[headers.indexOf('EVENT_TYPE')], // 'Made Shot' or 'Missed Shot'
      action_type: row[headers.indexOf('ACTION_TYPE')], 
      shot_type: row[headers.indexOf('SHOT_TYPE')], // '2PT Field Goal' or '3PT'
      shot_zone_basic: row[headers.indexOf('SHOT_ZONE_BASIC')],
      shot_zone_area: row[headers.indexOf('SHOT_ZONE_AREA')],
      shot_distance: row[headers.indexOf('SHOT_DISTANCE')],
      loc_x: row[headers.indexOf('LOC_X')], // court X coordinate
      loc_y: row[headers.indexOf('LOC_Y')], // court Y coordinate
      shot_made: row[headers.indexOf('SHOT_MADE_FLAG')] === 1,
      opponent: row[headers.indexOf('VTM')] === row[headers.indexOf('TEAM_NAME')] ? row[headers.indexOf('HTM')] : row[headers.indexOf('VTM')]
    }));

    return NextResponse.json(shots);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
