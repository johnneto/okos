import { NextRequest, NextResponse } from 'next/server';
import { readConfig, writeConfig, safeConfig } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/config — return current config (sensitive values masked) */
export async function GET() {
  try {
    const config = readConfig();
    return NextResponse.json({ config: safeConfig(config) });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/**
 * POST /api/config — save updated values to .env.local and hot-reload.
 *
 * Body: Partial<AppConfig>
 * Sensitive fields (GEMINI_API_KEY, GOOGLE_PRIVATE_KEY) are only written
 * if the value does NOT look like a masked placeholder (contains ••••).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, string>;

    // Strip masked placeholders so we don't overwrite real secrets with "abc••••••••"
    const updates: Record<string, string> = {};
    for (const [key, val] of Object.entries(body)) {
      if (typeof val === 'string' && !val.includes('••')) {
        updates[key] = val;
      }
    }

    writeConfig(updates);

    const config = readConfig();
    return NextResponse.json({ ok: true, config: safeConfig(config) });
  } catch (err) {
    console.error('[POST /api/config]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
