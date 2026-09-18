import type { ForeplayAd, ForeplayClient } from '@/lib/foreplay/client';
import { daysRunning, hookLine } from '@/lib/foreplay/signals';

/**
 * Concept mining: the two-stage funnel proven in-session (Charlie Morgan /
 * "AI employees" runs): a concept is a family of phrasings, so it expands
 * into several probe queries against Discovery's searchable written layer,
 * results pool + dedupe, filter to proven (min days running, live), then the
 * spoken layer (transcripts ride along on every ad) is read locally.
 * Explicit credit spend: one API call per probe.
 */

export type MinedAd = {
  ad: ForeplayAd;
  daysRunning: number;
  hook: string | null;
  hookSource: 'spoken' | 'text' | null;
  probes: string[]; // which probe queries surfaced it
};

export type MineResult = {
  concept: string;
  probes: { query: string; results: number }[];
  pooled: number;
  winners: MinedAd[];
  apiCalls: number;
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/<br\s*\/?>/gi, '\n');
}

export function textOpener(ad: ForeplayAd): string | null {
  const desc = decodeEntities(ad.description ?? '');
  const first = desc
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  return first && first.length >= 8 ? first : null;
}

export function bestHook(ad: ForeplayAd): { hook: string | null; source: 'spoken' | 'text' | null } {
  const spoken = hookLine(ad);
  if (spoken) return { hook: spoken, source: 'spoken' };
  const text = textOpener(ad);
  if (text) return { hook: text, source: 'text' };
  return { hook: null, source: null };
}

/** Deterministic fallback probes when no smarter expansion is available. */
export function naiveProbes(concept: string): string[] {
  const clean = concept.trim();
  const words = clean.split(/\s+/).filter((w) => w.length > 2);
  const probes = new Set<string>([clean]);
  if (words.length > 2) probes.add(words.slice(0, 3).join(' '));
  if (words.length > 3) probes.add(words.slice(-3).join(' '));
  return [...probes].slice(0, 4);
}

export async function mineConcept(
  client: ForeplayClient,
  concept: string,
  probes: string[],
  opts: { minDays?: number; perProbe?: number; maxWinners?: number; format?: string } = {},
): Promise<MineResult> {
  const { minDays = 21, perProbe = 15, maxWinners = 24, format } = opts;
  const startCalls = client.callCount;

  const pool = new Map<string, { ad: ForeplayAd; probes: string[] }>();
  const probeStats: { query: string; results: number }[] = [];

  for (const query of probes) {
    let ads: ForeplayAd[] = [];
    try {
      ads = await client.discoveryAds(query, {
        running_duration_min_days: minDays,
        live: true,
        limit: perProbe,
        display_format: format,
      });
    } catch {
      // one failed probe never sinks the mine: record it as zero
    }
    probeStats.push({ query, results: ads.length });
    for (const ad of ads) {
      const hit = pool.get(ad.id);
      if (hit) hit.probes.push(query);
      else pool.set(ad.id, { ad, probes: [query] });
    }
  }

  const winners: MinedAd[] = [...pool.values()]
    .map(({ ad, probes: hitBy }) => {
      const { hook, source } = bestHook(ad);
      return { ad, daysRunning: daysRunning(ad), hook, hookSource: source, probes: hitBy };
    })
    .sort((a, b) => b.daysRunning - a.daysRunning)
    .slice(0, maxWinners);

  return { concept, probes: probeStats, pooled: pool.size, winners, apiCalls: client.callCount - startCalls };
}
