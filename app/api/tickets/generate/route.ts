import { NextRequest, NextResponse } from 'next/server';
import { generateTicketPlan } from '@/lib/gemini';
import { createTicket, readAppContext } from '@/lib/tickets';
import { syncTicket } from '@/lib/sheets';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { featureRequest } = await req.json();
    if (!featureRequest) {
      return NextResponse.json({ error: 'featureRequest is required' }, { status: 400 });
    }

    // Read app context for Gemini
    const appContext = readAppContext();

    // Generate plan with Gemini Flash
    const plan = await generateTicketPlan(featureRequest, appContext);

    // Extract a title from the first heading in the plan, or use first 60 chars of the request
    const titleMatch = plan.match(/^#{1,3}\s+(.+)$/m);
    const title = titleMatch
      ? titleMatch[1].trim().slice(0, 120)
      : featureRequest.split('\n')[0].trim().slice(0, 120);

    // Save as a new ticket in backlog
    const ticket = createTicket(title, plan);

    // Fire-and-forget Sheets sync
    syncTicket(ticket).catch(e => console.warn('[Sheets sync]', e));

    return NextResponse.json({ ticket });
  } catch (err) {
    console.error('[POST /api/tickets/generate]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
