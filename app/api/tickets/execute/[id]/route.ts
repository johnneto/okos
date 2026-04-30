import { NextRequest } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { findTicket, moveTicket, COLUMNS } from '@/lib/tickets';
import { syncTicket } from '@/lib/sheets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function enc(obj: object): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ticketId = params.id;
  const modelId = req.nextUrl.searchParams.get('model') ?? 'claude-sonnet-4-6';
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (obj: object) => {
        try {
          controller.enqueue(encoder.encode(enc(obj)));
        } catch {
          // client disconnected
        }
      };

      // Find the ticket
      const ticket = findTicket(ticketId);
      if (!ticket) {
        send({ type: 'error', message: `Ticket ${ticketId} not found` });
        controller.close();
        return;
      }

      // Determine the relative path to the ticket file for the claude command
      const ticketsBase = process.env.TICKETS_BASE_PATH ?? '../tickets';
      const ticketsAbs = path.isAbsolute(ticketsBase)
        ? ticketsBase
        : path.resolve(process.cwd(), ticketsBase);

      const colDir = COLUMNS.find(c => c.id === ticket.column)?.dir ?? '';
      const ticketRelPath = path.join(ticketsAbs, colDir, ticket.filename);

      // Build the prompt
      const claudePrompt = [
        `Execute the implementation plan in the ticket file: ${ticketRelPath}`,
        '',
        'Instructions:',
        '1. Read the full plan from the ticket file',
        '2. Pull the latest code from the dev branch (git pull origin dev)',
        '3. Implement all changes described in the plan',
        '4. Run the test suite and fix any failures',
        '5. If all tests pass, commit the changes with a descriptive message referencing ticket ID: ' + ticketId,
        '6. Report what was done at the end',
      ].join('\n');

      send({ type: 'start', ticketId, modelId, message: `Launching ${modelId} for ${ticketId}…` });

      const child = spawn('claude', ['--model', modelId, '-p', claudePrompt], {
        cwd: process.env.APP_BASE_PATH
          ? path.isAbsolute(process.env.APP_BASE_PATH)
            ? process.env.APP_BASE_PATH
            : path.resolve(process.cwd(), process.env.APP_BASE_PATH)
          : process.cwd(),
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const outputChunks: string[] = [];

      child.stdout.on('data', (data: Buffer) => {
        const text = data.toString();
        outputChunks.push(text);
        send({ type: 'stdout', data: text });
      });

      child.stderr.on('data', (data: Buffer) => {
        const text = data.toString();
        outputChunks.push(text);
        send({ type: 'stderr', data: text });
      });

      child.on('error', (err) => {
        send({ type: 'error', message: `Failed to start claude: ${err.message}` });
        controller.close();
      });

      child.on('close', async (code) => {
        const fullReport = outputChunks.join('');
        send({ type: 'done', exitCode: code, report: fullReport });

        // Move ticket to validation
        try {
          if (ticket.column === 'todo') {
            const moved = moveTicket(ticketId, 'todo', 'validation');
            syncTicket(moved).catch(() => {});
            send({ type: 'moved', to: 'validation' });
          }
        } catch (moveErr) {
          send({ type: 'warning', message: `Could not move ticket: ${moveErr}` });
        }

        // Trigger Gemini validation in the background
        try {
          const origin = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
          fetch(`${origin}/api/tickets/validate/${ticketId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ claudeReport: fullReport }),
          }).then(async (r) => {
            const data = await r.json();
            send({ type: 'validation', summary: data.summary, approved: data.approved });
            controller.close();
          }).catch((e) => {
            send({ type: 'warning', message: `Validation error: ${e}` });
            controller.close();
          });
        } catch {
          controller.close();
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
