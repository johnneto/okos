import { NextRequest, NextResponse } from 'next/server';
import { generateTicketPlan } from '@/lib/gemini';
import { findTicket, updateTicket, readAppContext } from '@/lib/tickets';
import { syncTicket } from '@/lib/sheets';

export const runtime = 'nodejs';

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ticketId = params.id;

    // Find the ticket
    const ticket = findTicket(ticketId);
    if (!ticket) {
      return NextResponse.json({ error: `Ticket ${ticketId} not found` }, { status: 404 });
    }

    // Only allow rethink on backlog or todo tickets
    if (ticket.column !== 'backlog' && ticket.column !== 'todo') {
      return NextResponse.json(
        { error: 'Rethink is only available for backlog and to-do tickets' },
        { status: 400 }
      );
    }

    // Read app context for Gemini
    const appContext = readAppContext();

    // Use the ticket title as the feature request prompt so Gemini rewrites
    // the plan from scratch with fresh context
    const { plan } = await generateTicketPlan(ticket.title, appContext);

    // Keep the existing title — only the body is replaced
    const updated = updateTicket(ticketId, ticket.title, plan);

    // Fire-and-forget Sheets sync
    syncTicket(updated).catch(e => console.warn('[Sheets sync]', e));

    return NextResponse.json({ ticket: updated });
  } catch (err) {
    console.error('[POST /api/tickets/rethink/[id]]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
