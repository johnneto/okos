import { NextRequest, NextResponse } from 'next/server';
import { readAllTickets } from '@/lib/tickets';
import { syncAllTickets, isSheetsConfigured } from '@/lib/sheets';

export const runtime = 'nodejs';

export async function POST(_req: NextRequest) {
  try {
    if (!isSheetsConfigured()) {
      return NextResponse.json(
        { error: 'Google Sheets is not configured. Check .env.local.' },
        { status: 503 }
      );
    }

    const tickets = readAllTickets();
    await syncAllTickets(tickets);

    return NextResponse.json({ synced: tickets.length });
  } catch (err) {
    console.error('[POST /api/sheets/sync]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
