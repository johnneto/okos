/**
 * One-time Google Spreadsheet setup script.
 * Run once after configuring .env.local:
 *
 *   node scripts/setup-sheets.mjs
 *
 * What it does:
 *  - Renames the first sheet to "Tickets"
 *  - Sets the exact header row the app expects
 *  - Freezes the header row
 *  - Sets column widths for readability
 *  - Bolds + colours the header row
 *  - Prints the spreadsheet URL when done
 */

import { createRequire } from 'module';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// ── Load .env.local ───────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = resolve(__dirname, '..', '.env.local');
  if (!existsSync(envPath)) {
    console.error('❌  .env.local not found. Copy .env.local.example and fill in your credentials.');
    process.exit(1);
  }
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

loadEnv();

const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

// ── Config ────────────────────────────────────────────────────────────────────
const SHEET_ID    = process.env.GOOGLE_SHEETS_ID;
const SA_EMAIL    = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!SHEET_ID || !SA_EMAIL || !PRIVATE_KEY) {
  console.error('❌  Missing one of: GOOGLE_SHEETS_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY');
  process.exit(1);
}

const HEADERS = [
  'ID',
  'Title',
  'Status',
  'Created At',
  'Validation Summary',
  'Last Updated',
];

// Column widths in pixels
const COL_WIDTHS = [120, 400, 120, 180, 500, 180];

// ── Colour helpers ────────────────────────────────────────────────────────────
// Google Sheets API uses fractional RGB (0–1)
const HEADER_BG   = { red: 0.13, green: 0.16, blue: 0.24 };  // slate-900
const HEADER_FG   = { red: 0.76, green: 0.81, blue: 0.94 };  // slate-300
const BORDER_COLOR = { red: 0.20, green: 0.25, blue: 0.35 }; // slate-700

const STATUS_COLORS = {
  backlog:    { red: 0.30, green: 0.33, blue: 0.40 },
  todo:       { red: 0.24, green: 0.28, blue: 0.63 },
  validation: { red: 0.55, green: 0.37, blue: 0.09 },
  done:       { red: 0.06, green: 0.40, blue: 0.25 },
};

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🔗  Connecting to Google Sheets…');

  const auth = new JWT({ email: SA_EMAIL, key: PRIVATE_KEY, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  const doc = new GoogleSpreadsheet(SHEET_ID, auth);
  await doc.loadInfo();

  console.log(`📄  Spreadsheet: "${doc.title}"`);

  // ── 1. Grab / rename the first sheet ──────────────────────────────────────
  let sheet = doc.sheetsByIndex[0];
  if (sheet.title !== 'Tickets') {
    await sheet.updateProperties({ title: 'Tickets' });
    console.log('   ✓ Renamed sheet → Tickets');
  }

  // ── 2. Set headers ────────────────────────────────────────────────────────
  await sheet.setHeaderRow(HEADERS);
  console.log('   ✓ Header row set:', HEADERS.join(', '));

  // ── 3. Freeze header row ──────────────────────────────────────────────────
  await sheet.updateProperties({ gridProperties: { frozenRowCount: 1 } });
  console.log('   ✓ Header row frozen');

  // ── 4. Set column widths ──────────────────────────────────────────────────
  const columnMetadata = COL_WIDTHS.map((pixelSize, index) => ({
    updateDimensionProperties: {
      range: {
        sheetId: sheet.sheetId,
        dimension: 'COLUMNS',
        startIndex: index,
        endIndex: index + 1,
      },
      properties: { pixelSize },
      fields: 'pixelSize',
    },
  }));

  // ── 5. Style the header row ───────────────────────────────────────────────
  const headerStyle = {
    repeatCell: {
      range: {
        sheetId: sheet.sheetId,
        startRowIndex: 0,
        endRowIndex: 1,
        startColumnIndex: 0,
        endColumnIndex: HEADERS.length,
      },
      cell: {
        userEnteredFormat: {
          backgroundColor: HEADER_BG,
          textFormat: {
            foregroundColor: HEADER_FG,
            bold: true,
            fontSize: 10,
          },
          horizontalAlignment: 'LEFT',
          verticalAlignment: 'MIDDLE',
          padding: { top: 8, bottom: 8, left: 8, right: 8 },
          borders: {
            bottom: { style: 'SOLID', color: BORDER_COLOR, width: 2 },
          },
        },
      },
      fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,padding,borders)',
    },
  };

  // ── 6. Auto-resize row height for header ─────────────────────────────────
  const rowHeight = {
    updateDimensionProperties: {
      range: {
        sheetId: sheet.sheetId,
        dimension: 'ROWS',
        startIndex: 0,
        endIndex: 1,
      },
      properties: { pixelSize: 36 },
      fields: 'pixelSize',
    },
  };

  // ── 7. Add data validation for Status column (col index 2) ───────────────
  const statusValidation = {
    setDataValidation: {
      range: {
        sheetId: sheet.sheetId,
        startRowIndex: 1,
        endRowIndex: 1000,
        startColumnIndex: 2,
        endColumnIndex: 3,
      },
      rule: {
        condition: {
          type: 'ONE_OF_LIST',
          values: [
            { userEnteredValue: 'backlog' },
            { userEnteredValue: 'todo' },
            { userEnteredValue: 'validation' },
            { userEnteredValue: 'done' },
          ],
        },
        showCustomUi: true,
        strict: false,
      },
    },
  };

  // ── 8. Apply banded rows for readability ─────────────────────────────────
  const bandedRows = {
    addBanding: {
      bandedRange: {
        bandedRangeId: 1,
        range: {
          sheetId: sheet.sheetId,
          startRowIndex: 1,
          endRowIndex: 1000,
          startColumnIndex: 0,
          endColumnIndex: HEADERS.length,
        },
        rowProperties: {
          headerColor:      { red: 0.11, green: 0.14, blue: 0.21 },
          firstBandColor:   { red: 0.09, green: 0.11, blue: 0.16 },
          secondBandColor:  { red: 0.11, green: 0.14, blue: 0.21 },
        },
      },
    },
  };

  // Send all formatting in one batchUpdate call
  await doc.sheetsApi.post(':batchUpdate', {
    requests: [
      ...columnMetadata,
      headerStyle,
      rowHeight,
      statusValidation,
      // banded rows — skip if the spreadsheet already has one to avoid duplicates
    ],
    includeSpreadsheetInResponse: false,
  });

  console.log('   ✓ Column widths, header styles, and status dropdown applied');

  // ── 9. Done ───────────────────────────────────────────────────────────────
  console.log('\n✅  Spreadsheet is ready!');
  console.log(`🔗  https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`);
  console.log('\nNext step: make sure GOOGLE_SHEETS_ID in .env.local is set to:');
  console.log(`   ${SHEET_ID}`);
}

main().catch(err => {
  console.error('\n❌  Setup failed:', err.message ?? err);
  process.exit(1);
});
