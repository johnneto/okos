import { NextRequest } from 'next/server';
import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { findTicket, moveTicket, COLUMNS } from '@/lib/tickets';
import { syncTicket } from '@/lib/sheets';
import { readConfig } from '@/lib/config';
import { startRunLog } from '@/lib/executionLogs';

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
export const dynamic = 'force-dynamic';

// Track running processes by ticketId so they can be stopped
const runningProcesses = new Map<string, ReturnType<typeof spawn>>();

function enc(obj: object): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

function buildExecutionPrompt(ticketId: string, ticketRelPath: string, ghBin: string): string {
  const branch = `feature/${ticketId.toLowerCase()}`;
  return [
    `Execute the implementation plan in the ticket file: ${ticketRelPath}`,
    '',
    'Instructions:',
    '1. Read the full plan from the ticket file',
    '2. Pull the latest code from the dev branch (git pull origin dev)',
    `3. Create and check out a new branch named: ${branch}`,
    `   (If it already exists, check it out: git checkout ${branch})`,
    '4. Implement all changes described in the plan following the project guidelines you have been given',
    '5. Run the test suite and fix any failures',
    '6. If all tests pass, commit the changes with a descriptive message referencing ticket ID: ' + ticketId,
    '7. Push the branch and open a PR using the GitHub CLI:',
    `   git push -u origin ${branch}`,
    `   ${ghBin} pr create --title "[${ticketId}] <short description of change>" --body "Implements ticket ${ticketId}" --base dev`,
    '   (If a PR for this branch already exists, skip creation and report its URL instead)',
    '8. Report what was done at the end, including the PR URL',
  ].join('\n');
}

function formatToolUse(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case 'Read':
    case 'ReadFile':
      return `Reading: ${input.file_path ?? input.path ?? ''}`;
    case 'Edit':
    case 'MultiEdit':
      return `Editing: ${input.file_path ?? input.path ?? ''}`;
    case 'Write':
    case 'WriteFile':
      return `Writing: ${input.file_path ?? input.path ?? ''}`;
    case 'Bash':
      return `$ ${String(input.command ?? '').slice(0, 120)}`;
    case 'Glob':
      return `Glob: ${input.pattern ?? ''}`;
    case 'Grep':
      return `Grep: "${input.pattern ?? ''}" in ${input.path ?? '.'}`;
    case 'TodoWrite':
      return 'Updating task list';
    case 'WebSearch':
      return `Searching: ${input.query ?? ''}`;
    case 'WebFetch':
      return `Fetching: ${input.url ?? ''}`;
    default:
      return `${name}(${JSON.stringify(input).slice(0, 100)})`;
  }
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
      const runLog = startRunLog(ticketId, modelId, effort);

      const send = (obj: object) => {
        try {
          controller.enqueue(encoder.encode(enc(obj)));
        } catch {
          // client disconnected
        }
        // Log every event as a side effect — never injected into Claude's context
        const { type, ...rest } = obj as Record<string, unknown>;
        runLog.appendEvent(String(type), rest);
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

      const claudeBin = resolveClaude();
      const ghBin = resolveGh();
      const claudePrompt = buildExecutionPrompt(ticketId, ticketRelPath, ghBin);

      send({ type: 'start', ticketId, modelId, effort, budget: maxBudget, message: `Launching ${modelId} (effort: ${effort}, budget: $${maxBudget.toFixed(2)}) for ${ticketId}…` });

      let spawnError = false;

      // Strip ANTHROPIC_API_KEY so the CLI uses local OAuth auth (claude auth login)
      const claudeEnv = { ...process.env };
      delete claudeEnv.ANTHROPIC_API_KEY;

      const spawnArgs = [
        '--model', modelId,
        '-p', claudePrompt,
        '--effort', effort,
        '--max-budget-usd', String(maxBudget),
        '--output-format', 'stream-json',
        '--verbose',
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
      });

      runningProcesses.set(ticketId, child);

      const outputChunks: string[] = [];
      let lineBuffer = '';

      child.stdout.on('data', (data: Buffer) => {
        lineBuffer += data.toString();
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          outputChunks.push(line + '\n');

          try {
            const event = JSON.parse(line) as Record<string, unknown>;

            if (event.type === 'assistant' && event.message) {
              const msg = event.message as Record<string, unknown>;
              const content = msg.content;
              if (Array.isArray(content)) {
                for (const block of content) {
                  const b = block as Record<string, unknown>;
                  if (b.type === 'thinking' && typeof b.thinking === 'string') {
                    send({ type: 'thinking_block', data: b.thinking });
                  } else if (b.type === 'text' && typeof b.text === 'string') {
                    send({ type: 'stdout', data: b.text });
                  } else if (b.type === 'tool_use' && typeof b.name === 'string') {
                    const toolDesc = formatToolUse(b.name, (b.input as Record<string, unknown>) ?? {});
                    send({ type: 'tool_action', name: b.name, description: toolDesc });
                  }
                }
              }
            }
            // 'result', 'system', 'user' events are handled implicitly via process close
          } catch {
            // Not JSON (e.g. verbose diagnostic lines) — send as raw stdout
            send({ type: 'stdout', data: line + '\n' });
          }
        }
      });

      child.stderr.on('data', (data: Buffer) => {
        const text = data.toString();
        outputChunks.push(text);
        if (text.trim()) {
          send({ type: 'stderr', data: text });
        }
      });

      child.on('error', (err) => {
        spawnError = true;
        runningProcesses.delete(ticketId);
        const hint = err.message.includes('ENOENT')
          ? ` — set CLAUDE_BINARY in .env.local to the full path of the claude CLI`
          : '';
        send({ type: 'error', message: `Failed to start claude: ${err.message}${hint}` });
        runLog.finalize(-1, null);
        controller.close();
      });

      child.on('close', async (code) => {
        runningProcesses.delete(ticketId);
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
        if (!success) {
          runLog.finalize(code, null);
          try { controller.close(); } catch { /* already closed */ }
          return;
        }
        try {
          const origin = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
          fetch(`${origin}/api/tickets/validate/${ticketId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ claudeReport: fullReport }),
          }).then(async (r) => {
            const data = await r.json();
            send({ type: 'validation', summary: data.summary, approved: data.approved });
            runLog.finalize(code, { summary: data.summary, approved: data.approved });
            controller.close();
          }).catch((e) => {
            send({ type: 'warning', message: `Validation error: ${e}` });
            runLog.finalize(code, null);
            controller.close();
          });
        } catch {
          runLog.finalize(code, null);
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

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ticketId = params.id;
  const proc = runningProcesses.get(ticketId);
  if (!proc) {
    return Response.json({ error: 'No running process for this ticket' }, { status: 404 });
  }
  proc.kill('SIGTERM');
  // Force-kill after 3 s if it doesn't exit cleanly
  setTimeout(() => {
    try { proc.kill('SIGKILL'); } catch { /* already dead */ }
  }, 3000);
  runningProcesses.delete(ticketId);
  return Response.json({ ok: true });
}
