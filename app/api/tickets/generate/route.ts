import { NextRequest, NextResponse } from 'next/server';
import { generateTicketPlan } from '@/lib/gemini';
import { createTicket, readAppContext } from '@/lib/tickets';
import { syncTicket } from '@/lib/sheets';
import { saveGeminiLog } from '@/lib/geminiLogs';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { featureRequest, useThinking = false } = await req.json();
    if (!featureRequest) {
      return NextResponse.json({ error: 'featureRequest is required' }, { status: 400 });
    }

    const startedAt = new Date().toISOString();
    const startMs = Date.now();

    // Read app context for Gemini
    const appContext = readAppContext();

    // Generate plan with Gemini Flash
    const { title, plan, thinking } = await generateTicketPlan(featureRequest, appContext, useThinking);

    const completedAt = new Date().toISOString();

    // Build ticket body with the original feature request visible to Claude
    const body = `## Feature Request\n\n> ${featureRequest.replace(/\n/g, '\n> ')}\n\n---\n\n${plan}`;

    // Save as a new ticket in backlog
    const ticket = createTicket(title, body);

    // Save Gemini log
    const safeTs = startedAt.replace(/[:.]/g, '-');
    saveGeminiLog({
      logId: `${ticket.id}_generate_${safeTs}`,
      ticketId: ticket.id,
      phase: 'generate',
      model: 'gemini-2.5-flash',
      useThinking,
      featureRequest,
      thinking,
      output: plan,
      startedAt,
      completedAt,
      durationMs: Date.now() - startMs,
    });

    // Fire-and-forget Sheets sync
    syncTicket(ticket).catch(e => console.warn('[Sheets sync]', e));

    return NextResponse.json({ ticket });
  } catch (err) {
    console.error('[POST /api/tickets/generate]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
