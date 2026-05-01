import fs from 'fs';
import path from 'path';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AppConfig {
  TICKETS_BASE_PATH: string;
  APP_BASE_PATH: string;
  GEMINI_API_KEY: string;
  GOOGLE_SHEETS_ID: string;
  GOOGLE_SERVICE_ACCOUNT_EMAIL: string;
  GOOGLE_PRIVATE_KEY: string;
  CLAUDE_MAX_BUDGET_USD: string;
}

// Keys that should be masked when returned to the client
const SENSITIVE_KEYS: (keyof AppConfig)[] = ['GEMINI_API_KEY', 'GOOGLE_PRIVATE_KEY'];

const ENV_FILE = path.resolve(process.cwd(), '.env.local');

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * Parse an .env file into a key→value map.
 * Handles quoted values and inline comments.
 */
export function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();

    // Strip surrounding quotes, preserving internal content (including \n sequences)
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }

    result[key] = val;
  }

  return result;
}

/**
 * Serialize a key→value map back to .env format.
 * Multi-line values (private keys) are collapsed to literal \n so they stay
 * on a single line and can be round-tripped through parseEnvFile correctly.
 */
function serializeEnvFile(data: Record<string, string>): string {
  return Object.entries(data)
    .map(([k, v]) => {
      // Collapse actual newlines to literal \n so the value stays on one line.
      // This is safe for all other values too (they won't contain real newlines).
      const normalized = v.replace(/\r?\n/g, '\\n');
      // Quote values that contain spaces, special chars, or escaped newlines
      const needsQuotes = /[\s"'\\#]/.test(normalized) || normalized.includes('\\n');
      return needsQuotes ? `${k}="${normalized}"` : `${k}=${normalized}`;
    })
    .join('\n') + '\n';
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Read current config from .env.local (falls back to process.env) */
export function readConfig(): AppConfig {
  let fileValues: Record<string, string> = {};

  if (fs.existsSync(ENV_FILE)) {
    fileValues = parseEnvFile(fs.readFileSync(ENV_FILE, 'utf-8'));
  }

  const get = (key: string, fallback = '') =>
    fileValues[key] ?? process.env[key] ?? fallback;

  return {
    TICKETS_BASE_PATH:           get('TICKETS_BASE_PATH', '../tickets'),
    APP_BASE_PATH:               get('APP_BASE_PATH', '/Users/joaocaetano/Development/TravelApp/Application/XCode'),
    GEMINI_API_KEY:              get('GEMINI_API_KEY'),
    GOOGLE_SHEETS_ID:            get('GOOGLE_SHEETS_ID'),
    GOOGLE_SERVICE_ACCOUNT_EMAIL: get('GOOGLE_SERVICE_ACCOUNT_EMAIL'),
    GOOGLE_PRIVATE_KEY:          get('GOOGLE_PRIVATE_KEY'),
    CLAUDE_MAX_BUDGET_USD:       get('CLAUDE_MAX_BUDGET_USD', '1.00'),
  };
}

/** Write updated values to .env.local and hot-reload process.env */
export function writeConfig(updates: Partial<AppConfig>): void {
  // Read existing file (to preserve any extra keys)
  let existing: Record<string, string> = {};
  if (fs.existsSync(ENV_FILE)) {
    existing = parseEnvFile(fs.readFileSync(ENV_FILE, 'utf-8'));
  }

  const merged = { ...existing, ...updates };
  fs.writeFileSync(ENV_FILE, serializeEnvFile(merged), 'utf-8');

  // Hot-reload into process.env so the running server picks up changes
  // without needing a restart (paths, sheet IDs, etc. take effect immediately)
  for (const [key, val] of Object.entries(updates)) {
    if (val !== undefined) process.env[key] = val as string;
  }
}

/** Return config safe to send to the browser (sensitive values masked) */
export function safeConfig(config: AppConfig): Record<string, string> {
  const out: Record<string, string> = { ...config };
  for (const key of SENSITIVE_KEYS) {
    if (out[key]) out[key] = out[key].slice(0, 6) + '••••••••';
  }
  return out;
}
