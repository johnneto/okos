import fs from 'fs';
import path from 'path';

const RUNS_DIR = path.resolve(process.cwd(), 'data', 'runs');

function ensureDir() {
  if (!fs.existsSync(RUNS_DIR)) fs.mkdirSync(RUNS_DIR, { recursive: true });
}

export interface RunEvent {
  relativeMs: number;
  type: string;
  [key: string]: unknown;
}

export interface RunLog {
  runId: string;
  ticketId: string;
  model: string;
  effort: string;
  startedAt: string;
  completedAt: string | null;
  exitCode: number | null;
  durationMs: number | null;
  success: boolean | null;
  events: RunEvent[];
  validation: { summary: string; approved: boolean } | null;
}

export interface RunSummary extends Omit<RunLog, 'events'> {
  events?: never;
}

export function startRunLog(
  ticketId: string,
  model: string,
  effort: string,
): {
  runId: string;
  appendEvent: (type: string, payload: Record<string, unknown>) => void;
  finalize: (exitCode: number | null, validation?: { summary: string; approved: boolean } | null) => void;
} {
  const startedAt = new Date().toISOString();
  const safeTs = startedAt.replace(/[:.]/g, '-');
  const runId = `${ticketId}_${safeTs}`;
  const startMs = Date.now();

  const events: RunEvent[] = [];

  const appendEvent = (type: string, payload: Record<string, unknown>) => {
    events.push({ relativeMs: Date.now() - startMs, type, ...payload });
  };

  const finalize = (
    exitCode: number | null,
    validation: { summary: string; approved: boolean } | null = null,
  ) => {
    try {
      ensureDir();
      const completedAt = new Date().toISOString();
      const durationMs = Date.now() - startMs;
      const log: RunLog = {
        runId,
        ticketId,
        model,
        effort,
        startedAt,
        completedAt,
        exitCode,
        durationMs,
        success: exitCode === 0,
        events,
        validation,
      };
      fs.writeFileSync(path.join(RUNS_DIR, `${runId}.json`), JSON.stringify(log, null, 2), 'utf-8');
    } catch {
      // Non-fatal — logging should never crash the execution
    }
  };

  return { runId, appendEvent, finalize };
}

export function listRuns(): RunSummary[] {
  try {
    ensureDir();
    const files = fs.readdirSync(RUNS_DIR).filter(f => f.endsWith('.json'));
    const summaries: RunSummary[] = [];
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(RUNS_DIR, file), 'utf-8');
        const log = JSON.parse(raw) as RunLog;
        // Return everything except events for the list view
        const { events: _events, ...summary } = log;
        summaries.push(summary as RunSummary);
      } catch { /* skip malformed files */ }
    }
    return summaries.sort((a, b) =>
      new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
  } catch {
    return [];
  }
}

export function getRun(runId: string): RunLog | null {
  try {
    const file = path.join(RUNS_DIR, `${runId}.json`);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as RunLog;
  } catch {
    return null;
  }
}
