import { NextRequest, NextResponse } from 'next/server';
import { createTicket } from '@/lib/tickets';
import { syncTicket } from '@/lib/sheets';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { title, body } = await req.json();
    if (!title || !body) {
      return NextResponse.json({ error: 'title and body are required' }, { status: 400 });
    }

    const ticket = createTicket(title, body);

    // Fire-and-forget Sheets sync
    syncTicket(ticket).catch(e => console.warn('[Sheets sync]', e));

    return NextResponse.json({ ticket });
  } catch (err) {
    console.error('[POST /api/tickets/create]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
