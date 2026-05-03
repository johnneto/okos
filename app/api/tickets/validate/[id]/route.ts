import { NextRequest, NextResponse } from 'next/server';
import { validateImplementation } from '@/lib/gemini';
import { findTicket, appendToTicket, moveTicket } from '@/lib/tickets';
import { syncTicket } from '@/lib/sheets';
import { saveGeminiLog } from '@/lib/geminiLogs';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

function resolveGh(): string {
  if (process.env.GH_BINARY) return process.env.GH_BINARY;
  try {
    return execSync('which gh', { env: process.env, timeout: 3000 }).toString().trim();
  } catch { /* fall through */ }
  const candidates = [
    '/usr/local/bin/gh',
    '/opt/homebrew/bin/gh',
    `${process.env.HOME}/.local/bin/gh`,
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return 'gh';
}

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

    const ghBin = resolveGh();
    let gitDiff = '';

    // Strategy 1: diff from the open PR Claude created via gh pr create
    try {
      gitDiff = execSync(`${ghBin} pr diff --patch`, {
        cwd: appPath, encoding: 'utf-8', timeout: 15_000,
      });
    } catch {
      // Strategy 2: Claude committed directly to branch
      try {
        gitDiff = execSync('git diff HEAD~1', { cwd: appPath, encoding: 'utf-8', timeout: 15_000 });
      } catch {
        // Strategy 3: uncommitted working tree changes
        try {
          gitDiff = execSync('git diff', { cwd: appPath, encoding: 'utf-8', timeout: 15_000 });
        } catch {
          gitDiff = '(git diff not available)';
        }
      }
    }

    const startedAt = new Date().toISOString();
    const startMs = Date.now();

    // Validate with Gemini
    const { summary, thinking } = await validateImplementation(
      ticket.body,
      gitDiff,
      claudeReport ?? '(no report provided)'
    );

    const completedAt = new Date().toISOString();

    // Save Gemini validation log
    const safeTs = startedAt.replace(/[:.]/g, '-');
    saveGeminiLog({
      logId: `${ticketId}_validate_${safeTs}`,
      ticketId,
      phase: 'validate',
      model: 'gemini-2.5-flash',
      useThinking: false,
      thinking,
      output: summary,
      startedAt,
      completedAt,
      durationMs: Date.now() - startMs,
    });

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
