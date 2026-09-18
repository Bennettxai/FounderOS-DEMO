/**
 * Retrieve wide, rerank narrow.
 *
 * One choke point for every brain read in the OS: the /brain query card, the
 * Hermes memory brief, and the agents' searchBrain tool all come through here,
 * so ranking gets fixed once rather than in three places that drift.
 *
 * Why a rerank pass at all: the provider's own scores do not separate signal
 * from noise (see lib/connectors/reranker.ts for the measurement). Pulling
 * a wide pool and then asking a cross-encoder to read query and passage
 * together is the cheapest large gain available, and it is orthogonal to the
 * corpus problem, so it keeps helping as the store improves.
 *
 * Honesty rule, inherited from lib/connectors: when the second opinion is
 * unavailable the hits still come back, ordered as the provider ordered them,
 * and `ranked` says 'provider'. A caller must be able to tell a ranked answer
 * from an unranked one, because "top hit" means something different in each.
 */
import type { BrainProvider, BrainSearchResult } from '@/lib/brain';
import { createReranker, type Reranker } from '@/lib/connectors/reranker';

/** How many hits to pull before reranking. Wide enough that the answer is in it. */
export const RETRIEVE_POOL = 15;
/** How many survive. Three good passages beat fifteen mediocre ones in a prompt. */
export const RETRIEVE_TOP = 3;

export type RetrievedHit = BrainSearchResult & { rerankScore?: number };

export type Retrieval = {
  hits: RetrievedHit[];
  /** 'rerank' when a cross-encoder ordered these, 'provider' when it could not. */
  ranked: 'rerank' | 'provider';
  /**
   * Why there are no hits, when the provider itself failed. A page can ignore
   * this and render empty; a brief a worker reads MUST repeat it, because
   * "nothing found" and "the store was unreachable" are different facts.
   */
  error?: string;
};

export type RetrieveOptions = {
  pool?: number;
  top?: number;
  /** Pass null to skip reranking outright; omit to resolve the default reranker. */
  rerank?: Reranker | null;
};

/**
 * The reranker every caller gets unless it passes its own.
 *
 * Off inside the test runner and behind `BRAIN_RERANK=0`. The suite must never
 * reach for a local server that may not be running, and the switch gives a way
 * to turn the second opinion off on a box where it misbehaves without
 * redeploying the callers.
 */
export function defaultReranker(): Reranker | null {
  if (process.env.BRAIN_RERANK === '0' || process.env.VITEST) return null;
  return createReranker();
}

/** What the reranker judges: the slug carries meaning the snippet often lacks. */
function documentFor(hit: BrainSearchResult): string {
  return `${hit.title}\n${hit.snippet}`;
}

export async function retrieveBrain(
  provider: BrainProvider,
  query: string,
  opts: RetrieveOptions = {},
): Promise<Retrieval> {
  if (!query.trim()) return { hits: [], ranked: 'provider' };

  const pool = opts.pool ?? RETRIEVE_POOL;
  const top = opts.top ?? RETRIEVE_TOP;

  let found: BrainSearchResult[];
  try {
    found = await provider.search(query);
  } catch (err) {
    // A paused Supabase is not a page error, but it is not an empty store
    // either: hand the reason up so an honest caller can say so.
    return { hits: [], ranked: 'provider', error: err instanceof Error ? err.message : String(err) };
  }

  const candidates = found.slice(0, pool);
  if (candidates.length === 0) return { hits: [], ranked: 'provider' };

  const rerank = 'rerank' in opts ? opts.rerank : defaultReranker();
  const scores = rerank ? await rerank(query, candidates.map(documentFor)).catch(() => null) : null;

  if (!scores || scores.length !== candidates.length) {
    return { hits: candidates.slice(0, top), ranked: 'provider' };
  }

  const ordered = candidates
    .map((hit, i) => ({ ...hit, rerankScore: scores[i] }))
    .sort((a, b) => b.rerankScore - a.rerankScore)
    .slice(0, top);

  return { hits: ordered, ranked: 'rerank' };
}
