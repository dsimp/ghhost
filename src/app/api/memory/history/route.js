import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';

const VAULT_PATH = path.join(process.cwd(), 'src', 'data', 'ghhost_memory.json');

export async function GET() {
  try {
    const data = await fs.readFile(VAULT_PATH, 'utf-8');
    const vault = JSON.parse(data);
    
    // We can just return the predictions history to the client.
    return NextResponse.json({
       predictions: vault.predictions || {},
       playerHistory: vault.playerHistory || {}
    });
  } catch (error) {
    console.error("Failed to fetch memory history:", error);
    return NextResponse.json({ error: "Failed to read Vault data." }, { status: 500 });
  }
}
