import { NextRequest, NextResponse } from 'next/server';
import { moveTicket, ColumnId } from '@/lib/tickets';
import { syncTicket } from '@/lib/sheets';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { ticketId, from, to } = await req.json() as {
      ticketId: string;
      from: ColumnId;
      to: ColumnId;
    };

    if (!ticketId || !from || !to) {
      return NextResponse.json({ error: 'ticketId, from, and to are required' }, { status: 400 });
    }

    if (from === to) {
      return NextResponse.json({ error: 'Source and target columns are the same' }, { status: 400 });
    }

    const ticket = moveTicket(ticketId, from, to);

    // Fire-and-forget Sheets sync
    syncTicket(ticket).catch(e => console.warn('[Sheets sync]', e));

    return NextResponse.json({ ticket });
  } catch (err) {
    console.error('[POST /api/tickets/move]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
