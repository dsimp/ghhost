import { NextResponse } from 'next/server';

export async function GET(request) {
  return NextResponse.json([]); // Return empty for shot charts in NFL for now
}
