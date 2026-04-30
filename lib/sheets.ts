import { GoogleSpreadsheet, GoogleSpreadsheetRow } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import type { Ticket } from './tickets';

// ── Column headers — must match the spreadsheet exactly ──────────────────────
export const HEADERS = ['ID', 'Title', 'Status', 'Created At', 'Validation Summary', 'Last Updated'];

// Pre-filled from the project spreadsheet URL.
// Can be overridden in .env.local via GOOGLE_SHEETS_ID.
const DEFAULT_SHEET_ID = '1x519i1iO1qjPqmDTYzhRcO58-8OUGZAvXjzNHffQOus';

function isConfigured(): boolean {
  return !!(
    (process.env.GOOGLE_SHEETS_ID || DEFAULT_SHEET_ID) &&
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_PRIVATE_KEY
  );
}

async function getSheet() {
  if (!isConfigured()) {
    throw new Error(
      'Google Sheets is not configured. Set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY in .env.local'
    );
  }

  const sheetId = process.env.GOOGLE_SHEETS_ID || DEFAULT_SHEET_ID;

  const rawKey = process.env.GOOGLE_PRIVATE_KEY!.replace(/\\n/g, '\n').trim();
  const pemKey = rawKey.startsWith('-----')
    ? rawKey
    : `-----BEGIN PRIVATE KEY-----\n${rawKey}\n-----END PRIVATE KEY-----\n`;

  const auth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
    key: pemKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const doc = new GoogleSpreadsheet(sheetId, auth);
  await doc.loadInfo();

  const sheet = doc.sheetsByIndex[0];

  // ── Bootstrap headers if the sheet is empty or has wrong headers ──────────
  await sheet.loadHeaderRow().catch(() => null);

  const existingHeaders: string[] = sheet.headerValues ?? [];
  const headersMatch =
    existingHeaders.length === HEADERS.length &&
    HEADERS.every((h, i) => existingHeaders[i] === h);

  if (!headersMatch) {
    await sheet.setHeaderRow(HEADERS);
    await sheet.updateProperties({ frozenRowCount: 1 });
  }

  return sheet;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Sync a single ticket's status to Google Sheets.
 * Upserts by ticket ID: updates the row if it already exists, adds it if not.
 */
export async function syncTicket(ticket: Ticket, validationSummary?: string): Promise<void> {
  if (!isConfigured()) {
    console.warn('[Sheets] Skipping sync — service account credentials not configured.');
    return;
  }

  const sheet = await getSheet();
  const rows: GoogleSpreadsheetRow[] = await sheet.getRows();

  const existing = rows.find(r => r.get('ID') === ticket.id);

  if (existing) {
    existing.set('Title', ticket.title);
    existing.set('Status', ticket.column);
    existing.set('Last Updated', new Date().toISOString());
    if (validationSummary !== undefined) existing.set('Validation Summary', validationSummary);
    await existing.save();
  } else {
    await sheet.addRow({
      ID:                  ticket.id,
      Title:               ticket.title,
      Status:              ticket.column,
      'Created At':        ticket.createdAt,
      'Validation Summary': validationSummary ?? '',
      'Last Updated':      new Date().toISOString(),
    });
  }
}

/**
 * Bulk re-sync all tickets (called from "Sync Sheets" button).
 */
export async function syncAllTickets(tickets: Ticket[]): Promise<void> {
  for (const ticket of tickets) {
    await syncTicket(ticket);
  }
}

export { isConfigured as isSheetsConfigured };
