import { listRuns } from '@/lib/executionLogs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const runs = listRuns();
  return Response.json({ runs });
}
