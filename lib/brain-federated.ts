/**
 * Two stores, one brain.
 *
 * OptimalEngine and G-Brain do not carry the same knowledge in both places:
 * two writable copies of the same fact drift, and when they disagree there is
 * no way to tell which one lied. So they are split by ROLE, not by content:
 *
 *   - governed  (OptimalEngine, :4200) — Source → Signal → Claim → Fact, with
 *     provenance and a review gate. Short, attributable, promoted on purpose.
 *   - documents (G-Brain) — markdown, chunks and embeddings over prose. Long,
 *     unattributed, and 63% conversation transcript.
 *
 * Governed answers lead because one attributable line beats five fuzzy chunks
 * at a tenth of the tokens. Prose follows to cover what has not been promoted
 * yet. Callers never learn there are two stores: agents ask the retrieval hub,
 * the hub asks this.
 *
 * The engine runs on the laptop and NOT on the host, so absence is the
 * normal case on production and must be free. A refused connection is probed
 * once and remembered, and the documents half answers alone.
 */
import { createGBrainProvider } from '@/lib/connectors/gbrain';
import { createOptimalProvider } from '@/lib/connectors/optimal';
import type { BrainProvider, BrainSearchResult, BrainStatus } from '@/lib/brain';

/** How long an unreachable engine stays written off before we look again. */
export const GOVERNED_PROBE_TTL_MS = 60_000;

let governedDownUntil = 0;

/** Tests, and anything that has just started the engine, need to forget it. */
export function clearGovernedProbe(): void {
  governedDownUntil = 0;
}

/** Same page from both halves: keep the governed copy, drop the duplicate. */
function dedupe(hits: BrainSearchResult[]): BrainSearchResult[] {
  const seen = new Set<string>();
  const out: BrainSearchResult[] = [];
  for (const h of hits) {
    const key = h.title.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(h);
  }
  return out;
}

/**
 * The gbrain-only capabilities two callers duck-type off whatever provider is
 * configured: lib/live-metrics.ts probes localStats for the brain-store page
 * count, lib/memory-provider.ts probes capture for POST /api/memory. Neither
 * is part of BrainProvider, so a wrapper has to forward them deliberately or
 * they vanish the moment it becomes the default.
 */
type Forwardable = {
  localStats?: unknown;
  capture?: unknown;
};

export function createFederatedBrain(
  opts: { governed?: BrainProvider; documents?: BrainProvider } = {},
): BrainProvider {
  const governed = opts.governed ?? createOptimalProvider();
  const documents = opts.documents ?? createGBrainProvider();

  const federated: BrainProvider = {
    name: 'federated',

    async status(): Promise<BrainStatus> {
      const [g, d] = await Promise.all([
        governed.status().catch((err) => ({ connected: false, provider: governed.name, detail: String(err) })),
        documents.status().catch((err) => ({ connected: false, provider: documents.name, detail: String(err) })),
      ]);
      return {
        // One working half is a working brain, and the detail says which.
        connected: g.connected || d.connected,
        provider: 'federated',
        detail: `${documents.name}: ${d.detail} · ${governed.name}: ${g.detail}`,
      };
    },

    async search(query: string): Promise<BrainSearchResult[]> {
      const skipGoverned = Date.now() < governedDownUntil;

      const [g, d] = await Promise.allSettled([
        skipGoverned ? Promise.resolve([] as BrainSearchResult[]) : governed.search(query),
        documents.search(query),
      ]);

      if (!skipGoverned && g.status === 'rejected') {
        // Almost always "the engine is not running on this box". Write it off
        // for a minute rather than paying a failed connection per read.
        governedDownUntil = Date.now() + GOVERNED_PROBE_TTL_MS;
      }

      const governedHits = g.status === 'fulfilled' ? g.value : [];
      const documentHits = d.status === 'fulfilled' ? d.value : [];

      // Both halves failing is a real failure and must be raised, or the
      // caller reads an unreachable brain as an empty one.
      if (d.status === 'rejected' && governedHits.length === 0) {
        if (g.status === 'rejected' || skipGoverned) throw d.reason;
      }

      return dedupe([...governedHits, ...documentHits]);
    },
  };

  // Forwarded to the documents half, which is where both live. Attached only
  // when that half actually has them, so a plain BrainProvider underneath is
  // still reported honestly as unable rather than throwing at the call site.
  const half = documents as Forwardable;
  const out = federated as BrainProvider & Forwardable;
  if (typeof half.localStats === 'function') {
    out.localStats = (...args: unknown[]) => (half.localStats as (...a: unknown[]) => unknown)(...args);
  }
  if (typeof half.capture === 'function') {
    out.capture = (...args: unknown[]) => (half.capture as (...a: unknown[]) => unknown)(...args);
  }

  return federated;
}
