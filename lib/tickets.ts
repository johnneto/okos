import fs from 'fs';
import path from 'path';

// ── Column definitions ────────────────────────────────────────────────────────

export type ColumnId = 'backlog' | 'todo' | 'validation' | 'done';

export const COLUMNS: { id: ColumnId; label: string; dir: string }[] = [
  { id: 'backlog',    label: 'Backlog',               dir: '1_backlog' },
  { id: 'todo',       label: 'To-Do',                 dir: '2_todo' },
  { id: 'validation', label: 'Waiting for Validation', dir: '3_validation' },
  { id: 'done',       label: 'Done',                  dir: '4_done' },
];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Ticket {
  id: string;          // e.g. "TICKET-001"
  title: string;
  column: ColumnId;
  filename: string;    // e.g. "TICKET-001.md"
  createdAt: string;
  body: string;        // full markdown content (minus frontmatter)
  raw: string;         // complete file content
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getTicketsBase(): string {
  const base = process.env.TICKETS_BASE_PATH ?? '../tickets';
  return path.isAbsolute(base)
    ? base
    : path.resolve(process.cwd(), base);
}

function columnDir(columnId: ColumnId): string {
  const col = COLUMNS.find(c => c.id === columnId);
  if (!col) throw new Error(`Unknown column: ${columnId}`);
  return path.join(getTicketsBase(), col.dir);
}

/** Parse a simple YAML-style frontmatter block */
function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw };

  const meta: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const val = line.slice(colon + 1).trim().replace(/^["']|["']$/g, '');
    meta[key] = val;
  }
  return { meta, body: match[2].trim() };
}

/** Build frontmatter string from a map */
function buildFrontmatter(meta: Record<string, string>): string {
  const lines = Object.entries(meta).map(([k, v]) => `${k}: "${v}"`);
  return `---\n${lines.join('\n')}\n---\n\n`;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Read all tickets from every column directory */
export function readAllTickets(): Ticket[] {
  const tickets: Ticket[] = [];

  for (const col of COLUMNS) {
    const dir = path.join(getTicketsBase(), col.dir);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
    for (const filename of files) {
      const filePath = path.join(dir, filename);
      const raw = fs.readFileSync(filePath, 'utf-8');
      const { meta, body } = parseFrontmatter(raw);

      tickets.push({
        id: meta.id ?? filename.replace('.md', ''),
        title: meta.title ?? filename.replace('.md', ''),
        column: col.id,
        filename,
        createdAt: meta.created_at ?? '',
        body,
        raw,
      });
    }
  }

  return tickets;
}

/** Read a single ticket by ID, searching all columns */
export function findTicket(ticketId: string): (Ticket & { filePath: string }) | null {
  for (const col of COLUMNS) {
    const dir = path.join(getTicketsBase(), col.dir);
    if (!fs.existsSync(dir)) continue;

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
    for (const filename of files) {
      if (filename.replace('.md', '') === ticketId || filename === `${ticketId}.md`) {
        const filePath = path.join(dir, filename);
        const raw = fs.readFileSync(filePath, 'utf-8');
        const { meta, body } = parseFrontmatter(raw);
        return {
          id: meta.id ?? ticketId,
          title: meta.title ?? ticketId,
          column: col.id,
          filename,
          createdAt: meta.created_at ?? '',
          body,
          raw,
          filePath,
        };
      }
    }
  }
  return null;
}

/** Move a ticket from one column to another */
export function moveTicket(ticketId: string, fromColumn: ColumnId, toColumn: ColumnId): Ticket {
  const fromDir = columnDir(fromColumn);
  const toDir = columnDir(toColumn);

  if (!fs.existsSync(toDir)) fs.mkdirSync(toDir, { recursive: true });

  // Find file (supports TICKET-001.md or any match)
  const files = fs.readdirSync(fromDir).filter(f => f.endsWith('.md'));
  const filename = files.find(f => f.replace('.md', '') === ticketId);
  if (!filename) throw new Error(`Ticket ${ticketId} not found in ${fromColumn}`);

  const fromPath = path.join(fromDir, filename);
  const toPath = path.join(toDir, filename);

  // Update status in frontmatter
  const raw = fs.readFileSync(fromPath, 'utf-8');
  const { meta, body } = parseFrontmatter(raw);
  meta.status = toColumn;
  const updatedRaw = buildFrontmatter(meta) + body;

  fs.writeFileSync(toPath, updatedRaw, 'utf-8');
  fs.unlinkSync(fromPath);

  return {
    id: meta.id ?? ticketId,
    title: meta.title ?? ticketId,
    column: toColumn,
    filename,
    createdAt: meta.created_at ?? '',
    body,
    raw: updatedRaw,
  };
}

/** Generate the next ticket ID (TICKET-NNN) */
export function nextTicketId(): string {
  let max = 0;
  for (const col of COLUMNS) {
    const dir = path.join(getTicketsBase(), col.dir);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      const m = f.match(/TICKET-(\d+)\.md/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
  }
  return `TICKET-${String(max + 1).padStart(3, '0')}`;
}

/** Write a new ticket to the backlog */
export function createTicket(title: string, body: string): Ticket {
  const id = nextTicketId();
  const filename = `${id}.md`;
  const createdAt = new Date().toISOString();

  const meta: Record<string, string> = {
    id,
    title,
    status: 'backlog',
    created_at: createdAt,
  };

  const raw = buildFrontmatter(meta) + body;
  const dir = columnDir('backlog');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), raw, 'utf-8');

  return { id, title, column: 'backlog', filename, createdAt, body, raw };
}

/** Append a section to an existing ticket file */
export function appendToTicket(ticketId: string, section: string): void {
  const ticket = findTicket(ticketId);
  if (!ticket) throw new Error(`Ticket ${ticketId} not found`);
  const updated = ticket.raw + `\n\n---\n\n${section}`;
  fs.writeFileSync(ticket.filePath, updated, 'utf-8');
}

/** Update a ticket's title and/or body in-place, preserving all other frontmatter */
export function updateTicket(ticketId: string, title: string, body: string): Ticket {
  const ticket = findTicket(ticketId);
  if (!ticket) throw new Error(`Ticket ${ticketId} not found`);

  const { meta } = parseFrontmatter(ticket.raw);
  meta.title = title;
  meta.updated_at = new Date().toISOString();

  const raw = buildFrontmatter(meta) + body;
  fs.writeFileSync(ticket.filePath, raw, 'utf-8');

  return {
    id: ticket.id,
    title,
    column: ticket.column,
    filename: ticket.filename,
    createdAt: ticket.createdAt,
    body,
    raw,
  };
}

// ── File extensions worth sending to Gemini ──────────────────────────────────
// Ordered by signal value: source first, then config, then assets.
const SOURCE_EXTENSIONS = new Set([
  // Apple / iOS / macOS
  'swift', 'm', 'mm', 'h',
  // Web / Node
  'ts', 'tsx', 'js', 'jsx',
  // Other languages
  'py', 'go', 'rs', 'kt', 'java',
  // Config / data
  'json', 'yaml', 'yml', 'xcconfig', 'plist', 'entitlements',
  // Docs
  'md', 'txt',
]);

// Directories that are never useful for context
const SKIP_DIRS = new Set([
  'node_modules', 'DerivedData', 'Pods', '.build', 'build',
  'dist', '.git', '.svn', '__pycache__', 'xcuserdata',
  '.xcodeproj',   // binary project bundles — only the .swift files matter
  'Assets.xcassets',
  'Preview Content',
]);

const SKIP_FILE_PATTERNS = [
  /\.min\.(js|css)$/,
  /package-lock\.json$/,
  /yarn\.lock$/,
  /Podfile\.lock$/,
];

/**
 * Detect the project type so Gemini can tailor its response.
 * Returns a short label, e.g. "Xcode / Swift (iOS)", "Node.js / TypeScript".
 */
export function detectProjectType(appPath: string): string {
  const hasSwift = hasFilesWithExtension(appPath, 'swift', 2);
  const hasXcodeproj = fs.readdirSync(appPath).some(f => f.endsWith('.xcodeproj'));
  if (hasSwift || hasXcodeproj) return 'Xcode / Swift (iOS/macOS)';

  if (fs.existsSync(path.join(appPath, 'package.json'))) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(appPath, 'package.json'), 'utf-8'));
      if (pkg.dependencies?.react || pkg.devDependencies?.react) return 'React / TypeScript';
      if (pkg.dependencies?.next  || pkg.devDependencies?.next)  return 'Next.js / TypeScript';
      return 'Node.js / JavaScript';
    } catch { /* ignore */ }
  }

  return 'Unknown';
}

function hasFilesWithExtension(dir: string, ext: string, minCount: number): boolean {
  let count = 0;
  function walk(d: string) {
    if (count >= minCount || !fs.existsSync(d)) return;
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(`.${ext}`)) count++;
    }
  }
  walk(dir);
  return count >= minCount;
}

/** Read the app source code for Gemini context (truncated to ~120 k chars). */
export function readAppContext(): string {
  const base = process.env.APP_BASE_PATH ?? '../app';
  const appPath = path.isAbsolute(base)
    ? base
    : path.resolve(process.cwd(), base);

  if (!fs.existsSync(appPath)) {
    return `(App directory not found: ${appPath})\n` +
      'Tip: set APP_BASE_PATH in Settings to the correct path.';
  }

  const projectType = detectProjectType(appPath);
  const header = `# Project context\n**Type:** ${projectType}\n**Root:** ${appPath}\n`;

  const snippets: string[] = [header];
  let total = header.length;
  const MAX = 120_000;
  // Per-file limit — keeps any single giant file from swamping the context
  const FILE_LIMIT = 6_000;

  function walk(dir: string) {
    if (total >= MAX) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // permission error etc.
    }

    // Directories first so we get a broad picture before truncating
    const dirs  = entries.filter(e => e.isDirectory());
    const files = entries.filter(e => !e.isDirectory());

    for (const entry of [...files, ...dirs]) {
      if (total >= MAX) break;
      if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;
      if (SKIP_DIRS.has(entry.name)) continue;

      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(full);
      } else {
        const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
        if (!SOURCE_EXTENSIONS.has(ext)) continue;
        if (SKIP_FILE_PATTERNS.some(re => re.test(entry.name))) continue;

        let content: string;
        try {
          content = fs.readFileSync(full, 'utf-8');
        } catch {
          continue;
        }

        const relPath = path.relative(appPath, full);
        const snippet =
          `\n\n### ${relPath}\n\`\`\`${ext}\n${content.slice(0, FILE_LIMIT)}` +
          (content.length > FILE_LIMIT ? '\n// … (truncated)' : '') +
          `\n\`\`\``;

        snippets.push(snippet);
        total += snippet.length;
      }
    }
  }

  walk(appPath);

  if (snippets.length === 1) {
    return header + '\n(No readable source files found in this directory.)';
  }

  return snippets.join('');
}
