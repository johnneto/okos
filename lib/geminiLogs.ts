import fs from 'fs';
import path from 'path';

const GEMINI_LOGS_DIR = path.resolve(process.cwd(), 'data', 'gemini-logs');

function ensureDir() {
  if (!fs.existsSync(GEMINI_LOGS_DIR)) fs.mkdirSync(GEMINI_LOGS_DIR, { recursive: true });
}

export interface GeminiLog {
  logId: string;
  ticketId: string;
  phase: 'generate' | 'validate';
  model: string;
  useThinking: boolean;
  featureRequest?: string;
  thinking: string;
  output: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
}

export function saveGeminiLog(log: GeminiLog): void {
  try {
    ensureDir();
    const filename = `${log.logId}.json`;
    fs.writeFileSync(path.join(GEMINI_LOGS_DIR, filename), JSON.stringify(log, null, 2), 'utf-8');
  } catch {
    // Non-fatal — logging should never crash the caller
  }
}

export function listGeminiLogs(): Omit<GeminiLog, 'thinking' | 'output'>[] {
  try {
    ensureDir();
    const files = fs.readdirSync(GEMINI_LOGS_DIR).filter(f => f.endsWith('.json'));
    const summaries: Omit<GeminiLog, 'thinking' | 'output'>[] = [];
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(GEMINI_LOGS_DIR, file), 'utf-8');
        const log = JSON.parse(raw) as GeminiLog;
        const { thinking: _thinking, output: _output, ...summary } = log;
        summaries.push(summary);
      } catch { /* skip malformed files */ }
    }
    return summaries.sort((a, b) =>
      new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
  } catch {
    return [];
  }
}

export function getGeminiLog(logId: string): GeminiLog | null {
  try {
    const file = path.join(GEMINI_LOGS_DIR, `${logId}.json`);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as GeminiLog;
  } catch {
    return null;
  }
}
