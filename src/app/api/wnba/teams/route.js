import { NextResponse } from 'next/server';

const WNBA_TEAMS = [
  { id: '1611661330', name: 'Atlanta Dream', abbreviation: 'ATL' },
  { id: '1611661329', name: 'Chicago Sky', abbreviation: 'CHI' },
  { id: '1611661323', name: 'Connecticut Sun', abbreviation: 'CON' },
  { id: '1611661321', name: 'Dallas Wings', abbreviation: 'DAL' },
  { id: '1611661331', name: 'Golden State Valkyries', abbreviation: 'GSW' },
  { id: '1611661325', name: 'Indiana Fever', abbreviation: 'IND' },
  { id: '1611661319', name: 'Las Vegas Aces', abbreviation: 'LVA' },
  { id: '1611661320', name: 'Los Angeles Sparks', abbreviation: 'LAS' },
  { id: '1611661324', name: 'Minnesota Lynx', abbreviation: 'MIN' },
  { id: '1611661313', name: 'New York Liberty', abbreviation: 'NYL' },
  { id: '1611661317', name: 'Phoenix Mercury', abbreviation: 'PHO' },
  { id: '1611661328', name: 'Seattle Storm', abbreviation: 'SEA' },
  { id: '1611661322', name: 'Washington Mystics', abbreviation: 'WAS' }
];

export async function GET() {
  return NextResponse.json(WNBA_TEAMS);
}
