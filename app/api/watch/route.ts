import { NextRequest } from 'next/server';
import chokidar, { FSWatcher } from 'chokidar';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── Module-level singleton ────────────────────────────────────────────────────
// Safe for `next dev`; each file change restarts the module anyway in dev.

let watcher: FSWatcher | null = null;
const clients = new Set<ReadableStreamDefaultController<Uint8Array>>();
const encoder = new TextEncoder();

function getTicketsBase(): string {
  const base = process.env.TICKETS_BASE_PATH ?? '../tickets';
  return path.isAbsolute(base)
    ? base
    : path.resolve(process.cwd(), base);
}

function broadcast(payload: object) {
  const bytes = encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
  for (const ctrl of clients) {
    try {
      ctrl.enqueue(bytes);
    } catch {
      clients.delete(ctrl);
    }
  }
}

function ensureWatcher() {
  if (watcher) return;

  const watchPath = getTicketsBase();
  watcher = chokidar.watch(watchPath, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
    ignored: /(^|[/\\])\..|(\.DS_Store$)/,
  });

  watcher.on('all', (event, filePath) => {
    broadcast({ event, path: filePath });
  });

  watcher.on('error', (err) => {
    console.error('[chokidar]', err);
  });
}

// ── SSE handler ───────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest) {
  ensureWatcher();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      clients.add(controller);
      // Send initial heartbeat so the browser knows the connection is live
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event: 'connected' })}\n\n`));
    },
    cancel(controller) {
      clients.delete(controller);
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
