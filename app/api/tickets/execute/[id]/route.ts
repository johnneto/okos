import { NextRequest } from 'next/server';
import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { findTicket, moveTicket, COLUMNS } from '@/lib/tickets';
import { syncTicket } from '@/lib/sheets';
import { readConfig } from '@/lib/config';

function resolveClaude(): string {
  if (process.env.CLAUDE_BINARY) return process.env.CLAUDE_BINARY;
  try {
    return execSync('which claude', { env: process.env, timeout: 3000 }).toString().trim();
  } catch {
    // not on PATH — try common locations
  }
  const candidates = [
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude',
    `${process.env.HOME}/.npm-global/bin/claude`,
    `${process.env.HOME}/.npm/bin/claude`,
    `${process.env.HOME}/.local/bin/claude`,
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return 'claude';
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function enc(obj: object): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

function buildExecutionPrompt(ticketId: string, ticketRelPath: string): string {
  return [
    `Execute the implementation plan in the ticket file: ${ticketRelPath}`,
    '',
    'Instructions:',
    '1. Read the full plan from the ticket file',
    '2. Pull the latest code from the dev branch (git pull origin dev)',
    '3. Implement all changes described in the plan following the project guidelines you have been given',
    '4. Run the test suite and fix any failures',
    '5. If all tests pass, commit the changes with a descriptive message referencing ticket ID: ' + ticketId,
    '6. Report what was done at the end',
  ].join('\n');
}

function isThinkingLine(line: string): boolean {
  const lowerLine = line.toLowerCase().trim();
  if (!lowerLine) return false;

  // Thinking pattern prefixes
  const thinkingPrefixes = [
    'i think', 'i should', 'i need', 'i will', 'i can',
    'i\'m', 'i am', 'let me', 'let\'s',
    'now i', 'first i', 'next i', 'then i',
    'this means', 'this suggests', 'this shows',
    'i understand', 'i realize', 'i see that',
  ];

  // Check for thinking prefixes
  if (thinkingPrefixes.some(prefix => lowerLine.startsWith(prefix))) {
    return true;
  }

  // Check for reasoning keywords
  const reasoningKeywords = [
    'because', 'since', 'therefore', 'however', 'thus',
    'based on', 'according to', 'it appears', 'it seems',
    'in other words', 'in summary', 'in conclusion',
    'the reason', 'the issue', 'the problem',
  ];

  if (reasoningKeywords.some(keyword => lowerLine.includes(keyword))) {
    return true;
  }

  // Check for thinking/analysis blocks
  if (lowerLine.includes('<thinking>') || lowerLine.includes('</thinking>') ||
      lowerLine.includes('## thinking') || lowerLine.includes('# thinking')) {
    return true;
  }

  // Status/progress messages
  const progressPatterns = [
    /^(now|next|then|first|let me)/i,
    /^(analyzing|checking|reading|examining|running|executing|testing|building|compiling)/i,
  ];

  if (progressPatterns.some(pattern => pattern.test(lowerLine))) {
    return true;
  }

  return false;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ticketId = params.id;
  const modelId = req.nextUrl.searchParams.get('model') ?? 'claude-sonnet-4-6';
  const effort = req.nextUrl.searchParams.get('effort') ?? 'medium';
  const encoder = new TextEncoder();

  const config = readConfig();
  const maxBudget = parseFloat(config.CLAUDE_MAX_BUDGET_USD) || 1.0;

  // Read CLAUDE.md from orchestrator root and inject it as the system prompt
  const claudeMdPath = path.resolve(process.cwd(), 'CLAUDE.md');
  const claudeMdContent = fs.existsSync(claudeMdPath)
    ? fs.readFileSync(claudeMdPath, 'utf-8').trim()
    : '';

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

      // Build the prompt with Swift guidelines
      const claudePrompt = buildExecutionPrompt(ticketId, ticketRelPath);

      send({ type: 'start', ticketId, modelId, effort, budget: maxBudget, message: `Launching ${modelId} (effort: ${effort}, budget: $${maxBudget.toFixed(2)}) for ${ticketId}…` });

      const claudeBin = resolveClaude();
      let spawnError = false;

      // Strip ANTHROPIC_API_KEY so the CLI uses local OAuth auth (claude auth login)
      const claudeEnv = { ...process.env };
      delete claudeEnv.ANTHROPIC_API_KEY;

      const spawnArgs = [
        '--model', modelId,
        '-p', claudePrompt,
        '--effort', effort,
        '--max-budget-usd', String(maxBudget),
        '--dangerously-skip-permissions',
      ];
      if (claudeMdContent) {
        spawnArgs.push('--append-system-prompt', claudeMdContent);
      }

      const child = spawn(claudeBin, spawnArgs, {
          cwd: process.env.APP_BASE_PATH
            ? path.isAbsolute(process.env.APP_BASE_PATH)
              ? process.env.APP_BASE_PATH
              : path.resolve(process.cwd(), process.env.APP_BASE_PATH)
            : process.cwd(),
          env: claudeEnv,
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      );

      const outputChunks: string[] = [];
      let thinkingBuffer: string[] = [];

      child.stdout.on('data', (data: Buffer) => {
        const text = data.toString();
        outputChunks.push(text);

        // Parse thinking vs output lines
        const lines = text.split('\n');
        let regularOutput = '';

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const isLastLine = i === lines.length - 1 && text.endsWith('\n') === false;

          if (isThinkingLine(line)) {
            // Flush any pending regular output first
            if (regularOutput) {
              send({ type: 'stdout', data: regularOutput });
              regularOutput = '';
            }
            // Add to thinking buffer
            thinkingBuffer.push(line);
            // Send thinking block immediately if it's a complete thought (ends with punctuation)
            if (line.match(/[.!?]$/) || thinkingBuffer.length >= 3) {
              send({ type: 'thinking_block', data: thinkingBuffer.join('\n') });
              thinkingBuffer = [];
            }
          } else {
            // Flush thinking buffer if transitioning to output
            if (thinkingBuffer.length > 0) {
              send({ type: 'thinking_block', data: thinkingBuffer.join('\n') });
              thinkingBuffer = [];
            }
            // Add to regular output
            regularOutput += (regularOutput ? '\n' : '') + (isLastLine ? line : line + '\n');
          }
        }

        // Flush any remaining regular output
        if (regularOutput) {
          send({ type: 'stdout', data: regularOutput });
        }
      });

      child.stderr.on('data', (data: Buffer) => {
        const text = data.toString();
        outputChunks.push(text);

        // Parse thinking vs error output
        const lines = text.split('\n');
        let regularError = '';

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const isLastLine = i === lines.length - 1 && text.endsWith('\n') === false;

          if (isThinkingLine(line)) {
            // Flush any pending error output first
            if (regularError) {
              send({ type: 'stderr', data: regularError });
              regularError = '';
            }
            // Add to thinking buffer
            thinkingBuffer.push(line);
            // Send thinking block immediately if it's complete
            if (line.match(/[.!?]$/) || thinkingBuffer.length >= 3) {
              send({ type: 'thinking_block', data: thinkingBuffer.join('\n') });
              thinkingBuffer = [];
            }
          } else {
            // Flush thinking buffer if transitioning to error
            if (thinkingBuffer.length > 0) {
              send({ type: 'thinking_block', data: thinkingBuffer.join('\n') });
              thinkingBuffer = [];
            }
            // Add to error output
            regularError += (regularError ? '\n' : '') + (isLastLine ? line : line + '\n');
          }
        }

        // Flush any remaining error output
        if (regularError) {
          send({ type: 'stderr', data: regularError });
        }
      });

      child.on('error', (err) => {
        spawnError = true;
        const hint = err.message.includes('ENOENT')
          ? ` — set CLAUDE_BINARY in .env.local to the full path of the claude CLI`
          : '';
        send({ type: 'error', message: `Failed to start claude: ${err.message}${hint}` });
        controller.close();
      });

      child.on('close', async (code) => {
        // Flush any remaining thinking
        if (thinkingBuffer.length > 0) {
          send({ type: 'thinking_block', data: thinkingBuffer.join('\n') });
          thinkingBuffer = [];
        }
        // Signal end of thinking section
        send({ type: 'thinking_complete' });

        const fullReport = outputChunks.join('');
        send({ type: 'done', exitCode: code, report: fullReport });

        // Move ticket to validation only on success
        const success = !spawnError && code === 0;
        try {
          if (success && ticket.column === 'todo') {
            const moved = moveTicket(ticketId, 'todo', 'validation');
            syncTicket(moved).catch(() => {});
            send({ type: 'moved', to: 'validation' });
          }
        } catch (moveErr) {
          send({ type: 'warning', message: `Could not move ticket: ${moveErr}` });
        }

        if (!success && !spawnError) {
          send({ type: 'warning', message: `Claude exited with code ${code} — ticket not moved` });
        }

        // Trigger Gemini validation in the background (only on success)
        if (!success) { try { controller.close(); } catch { /* already closed */ } return; }
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
