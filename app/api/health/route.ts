import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export const runtime = 'nodejs';

export async function GET() {
  const checks: Record<string, { status: string; latency_ms?: number; error?: string }> = {};

  // Check database
  const dbStart = Date.now();
  try {
    await sql`SELECT 1 as ok`;
    checks.database = { status: 'ok', latency_ms: Date.now() - dbStart };
  } catch (e: any) {
    checks.database = {
      status: 'error',
      latency_ms: Date.now() - dbStart,
      error: e.message?.includes('POSTGRES_URL')
        ? 'POSTGRES_URL not configured'
        : e.message?.slice(0, 120),
    };
  }

  // Static checks
  checks.api = { status: 'ok' };
  checks.catalog = { status: 'ok' };
  checks.estimate = { status: 'ok' };

  const allOk = Object.values(checks).every((c) => c.status === 'ok');

  return NextResponse.json(
    {
      status: allOk ? 'healthy' : 'degraded',
      version: '2.2.0',
      timestamp: new Date().toISOString(),
      checks,
      note: allOk
        ? 'All systems operational'
        : 'Some services degraded. Static endpoints (catalog, estimate, skill) work without database.',
    },
    { status: allOk ? 200 : 503 },
  );
}
