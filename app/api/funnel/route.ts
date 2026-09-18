import { NextResponse } from 'next/server';
import { funnelSummary, splitFunnelJourneys } from '@/lib/funnel';
import { composeFunnelJourneys, funnelSourceLabel } from '@/lib/funnel-compose';
import { FunnelVentureSchema, type FunnelVenture } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get('venture');
  let venture: FunnelVenture | undefined;
  if (raw !== null) {
    const parsed = FunnelVentureSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: `unknown venture: ${raw}` }, { status: 400 });
    }
    venture = parsed.data;
  }
  const now = new Date();
  // One shared composer with the page: Attio ∪ GHL live journeys, Trakyo
  // touches + Stripe settled payments folded on, venture-filtered; seeded
  // funnel when nothing is live. Quiet >90d splits into `archived`.
  const composed = await composeFunnelJourneys(now, venture);
  const { active, archived } = splitFunnelJourneys(composed.journeys, now);
  return NextResponse.json({
    summary: funnelSummary(active),
    journeys: active,
    archived,
    source: funnelSourceLabel(composed),
    ...(composed.isLive
      ? {
          excluded: (composed.attioLive?.closedLost ?? 0) + (composed.ghlLive?.excluded ?? 0),
          total: (composed.attioLive?.total ?? 0) + (composed.ghlLive?.total ?? 0),
        }
      : {}),
  });
}
