import type { FounderDb } from '@/lib/db';
import { growthOver, growthAllTime, type GrowthPoint } from '@/lib/growth';
import { EmailListSnapshotSchema, type SocialGrowth } from '@/lib/schemas';
import { beehiivSubscribers } from '@/lib/connectors/beehiiv';

export type EmailListSummary = {
  subscribers: number | null;
  asOf: string | null;
  growth: SocialGrowth;
  series: { date: string; subscribers: number }[];
};

/**
 * The email-list audience card: current subscribers, growth windows, and a
 * trailing series — same shape as a social platform so the Social tab renders
 * it alongside the others. Seeded dummy now; Beehiiv-ready later.
 */
export function buildEmailList(db: FounderDb): EmailListSummary {
  const snapshots = db.emailList.snapshots();
  const points: GrowthPoint[] = snapshots.map((s) => ({ capturedAt: s.capturedAt, value: s.subscribers }));
  const latest = snapshots.at(-1) ?? null;
  return {
    subscribers: latest?.subscribers ?? null,
    asOf: latest?.capturedAt ?? null,
    growth: {
      d7: growthOver(points, 7),
      d30: growthOver(points, 30),
      d60: growthOver(points, 60),
      allTime: growthAllTime(points),
    },
    series: snapshots.slice(-90).map((s) => ({ date: s.capturedAt, subscribers: s.subscribers })),
  };
}

/**
 * Snapshot today's live Beehiiv subscriber count so `buildEmailList` (and the
 * audience series) prefer it over seeded dummy. No-op when Beehiiv isn't keyed
 * or the API is unreachable — never writes a fake number. Same-day re-sync
 * overwrites. Mirrors `syncFromZernioLive` for social. Returns true if recorded.
 */
export async function syncBeehiivEmail(
  db: FounderDb,
  opts: { today?: string; source?: () => Promise<number | null> } = {},
): Promise<boolean> {
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const source = opts.source ?? beehiivSubscribers;
  let subscribers: number | null = null;
  try {
    subscribers = await source();
  } catch {
    subscribers = null;
  }
  if (subscribers == null || !Number.isFinite(subscribers)) return false;
  db.emailList.insertSnapshot(
    EmailListSnapshotSchema.parse({ capturedAt: today, subscribers, source: 'beehiiv' }),
  );
  return true;
}
