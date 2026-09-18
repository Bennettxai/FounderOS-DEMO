import { NextResponse } from 'next/server';
import { liveMetrics } from '@/lib/live-metrics';

export const dynamic = 'force-dynamic';

/**
 * The business-pulse four, read live. This used to return `db.metrics.all()` —
 * the literal zeros in `lib/seed.ts`, two of them captioned "pending creds"
 * although the creds work. The consumer is the agent harness, not a component,
 * so nothing looked broken while an agent quoted those zeros to the operator as fact.
 *
 * `live` and `pending` are a pre-split of `metrics` for exactly that reader: a
 * gap arrives already separated from a measurement, and carries the reason it
 * is a gap, so quoting a failed read as a number takes deliberate effort rather
 * than being the path of least resistance.
 */
export async function GET() {
  const metrics = await liveMetrics();
  return NextResponse.json({
    metrics,
    live: metrics
      .filter((m) => m.live)
      .map(({ key, label, value, unit, source }) => ({ key, label, value, unit, source })),
    pending: metrics
      .filter((m) => !m.live)
      .map(({ key, label, source }) => ({ key, label, reason: source })),
  });
}
