import { NextRequest, NextResponse } from 'next/server';
import { updateTicket } from '@/lib/tickets';
import { syncTicket } from '@/lib/sheets';

export const runtime = 'nodejs';

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { title, body } = await req.json() as { title: string; body: string };

    if (!title?.trim()) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }

    const ticket = updateTicket(params.id, title.trim(), body ?? '');
    syncTicket(ticket).catch(e => console.warn('[Sheets sync]', e));

    return NextResponse.json({ ticket });
  } catch (err) {
    console.error('[PUT /api/tickets/[id]]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
