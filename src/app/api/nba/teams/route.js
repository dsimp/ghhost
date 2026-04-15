import { NextResponse } from 'next/server';

const TEAMS = [
  { id: '1610612737', name: 'Atlanta Hawks', abbreviation: 'ATL' },
  { id: '1610612738', name: 'Boston Celtics', abbreviation: 'BOS' },
  { id: '1610612751', name: 'Brooklyn Nets', abbreviation: 'BKN' },
  { id: '1610612766', name: 'Charlotte Hornets', abbreviation: 'CHA' },
  { id: '1610612741', name: 'Chicago Bulls', abbreviation: 'CHI' },
  { id: '1610612739', name: 'Cleveland Cavaliers', abbreviation: 'CLE' },
  { id: '1610612742', name: 'Dallas Mavericks', abbreviation: 'DAL' },
  { id: '1610612743', name: 'Denver Nuggets', abbreviation: 'DEN' },
  { id: '1610612765', name: 'Detroit Pistons', abbreviation: 'DET' },
  { id: '1610612744', name: 'Golden State Warriors', abbreviation: 'GSW' },
  { id: '1610612745', name: 'Houston Rockets', abbreviation: 'HOU' },
  { id: '1610612754', name: 'Indiana Pacers', abbreviation: 'IND' },
  { id: '1610612746', name: 'Los Angeles Clippers', abbreviation: 'LAC' },
  { id: '1610612747', name: 'Los Angeles Lakers', abbreviation: 'LAL' },
  { id: '1610612763', name: 'Memphis Grizzlies', abbreviation: 'MEM' },
  { id: '1610612748', name: 'Miami Heat', abbreviation: 'MIA' },
  { id: '1610612749', name: 'Milwaukee Bucks', abbreviation: 'MIL' },
  { id: '1610612750', name: 'Minnesota Timberwolves', abbreviation: 'MIN' },
  { id: '1610612740', name: 'New Orleans Pelicans', abbreviation: 'NOP' },
  { id: '1610612752', name: 'New York Knicks', abbreviation: 'NYK' },
  { id: '1610612760', name: 'Oklahoma City Thunder', abbreviation: 'OKC' },
  { id: '1610612753', name: 'Orlando Magic', abbreviation: 'ORL' },
  { id: '1610612755', name: 'Philadelphia 76ers', abbreviation: 'PHI' },
  { id: '1610612756', name: 'Phoenix Suns', abbreviation: 'PHX' },
  { id: '1610612757', name: 'Portland Trail Blazers', abbreviation: 'POR' },
  { id: '1610612758', name: 'Sacramento Kings', abbreviation: 'SAC' },
  { id: '1610612759', name: 'San Antonio Spurs', abbreviation: 'SAS' },
  { id: '1610612761', name: 'Toronto Raptors', abbreviation: 'TOR' },
  { id: '1610612762', name: 'Utah Jazz', abbreviation: 'UTA' },
  { id: '1610612764', name: 'Washington Wizards', abbreviation: 'WAS' }
];

export async function GET() {
  return NextResponse.json(TEAMS);
}
