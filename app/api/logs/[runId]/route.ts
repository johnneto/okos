import { NextRequest } from 'next/server';
import { getRun } from '@/lib/executionLogs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: { runId: string } },
) {
  const log = getRun(params.runId);
  if (!log) return Response.json({ error: 'Run not found' }, { status: 404 });
  return Response.json(log);
}
