import { NextRequest, NextResponse } from 'next/server';
import { validateImplementation } from '@/lib/gemini';
import { findTicket, appendToTicket, moveTicket } from '@/lib/tickets';
import { syncTicket } from '@/lib/sheets';
import { execSync } from 'child_process';
import path from 'path';

export const runtime = 'nodejs';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ticketId = params.id;
    const { claudeReport } = await req.json() as { claudeReport?: string };

    const ticket = findTicket(ticketId);
    if (!ticket) {
      return NextResponse.json({ error: `Ticket ${ticketId} not found` }, { status: 404 });
    }

    // Get git diff from the app directory
    const appBase = process.env.APP_BASE_PATH ?? '../app';
    const appPath = path.isAbsolute(appBase)
      ? appBase
      : path.resolve(process.cwd(), appBase);

    let gitDiff = '';
    try {
      gitDiff = execSync('git diff HEAD~1', { cwd: appPath, encoding: 'utf-8', timeout: 15_000 });
    } catch {
      try {
        gitDiff = execSync('git diff', { cwd: appPath, encoding: 'utf-8', timeout: 15_000 });
      } catch {
        gitDiff = '(git diff not available)';
      }
    }

    // Validate with Gemini
    const summary = await validateImplementation(
      ticket.body,
      gitDiff,
      claudeReport ?? '(no report provided)'
    );

    // Append validation summary to the ticket file
    appendToTicket(ticketId, summary);

    // The ticket should already be in validation — move to done if approved
    const approved = summary.toLowerCase().includes('approved');
    let finalTicket = ticket;
    if (approved && ticket.column === 'validation') {
      finalTicket = moveTicket(ticketId, 'validation', 'done');
    }

    // Sync to Sheets with summary
    syncTicket(finalTicket, summary).catch(e => console.warn('[Sheets sync]', e));

    return NextResponse.json({ summary, approved, ticket: finalTicket });
  } catch (err) {
    console.error('[POST /api/tickets/validate]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
