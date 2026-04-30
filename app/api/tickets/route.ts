import { NextResponse } from 'next/server';
import { readAllTickets } from '@/lib/tickets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const tickets = readAllTickets();
    return NextResponse.json({ tickets });
  } catch (err) {
    console.error('[GET /api/tickets]', err);
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}
