/**
 * Brain adapter. Four providers:
 * - federated: both stores at once (lib/brain-federated.ts) — governed
 * answers from the engine first, prose chunks from gbrain after. Degrades
 * to gbrain alone on a box where the engine is not running, which is every
 * box except the operator's laptop today.
 * - optimal: the OptimalEngine:4200 (lib/connectors/optimal.ts), the
 * governed claims store the operator chose as the OS brain.
 * - gbrain (default until the env flips): shells out to the gbrain CLI
 * (brain-store markdown + Supabase + Ollama bge-m3) with a local fallback.
 * - stub: inert, for tests.
 */
import { createFederatedBrain } from '@/lib/brain-federated';
import { createGBrainProvider } from '@/lib/connectors/gbrain';
import { createOptimalProvider } from '@/lib/connectors/optimal';

export type BrainStatus = {
  connected: boolean;
  provider: string;
  detail: string;
};

export type BrainSearchResult = {
  title: string;
  snippet: string;
  source: string;
  /** Hybrid-search relevance, when the provider reported one. */
  score?: number;
};

export interface BrainProvider {
  name: string;
  status(): Promise<BrainStatus>;
  search(query: string): Promise<BrainSearchResult[]>;
}

const stubProvider: BrainProvider = {
  name: 'stub',
  async status() {
    return {
      connected: false,
      provider: 'stub',
      detail:
        'G Brain is not wired yet. Implement a BrainProvider in lib/brain.ts and set BRAIN_PROVIDER to activate it.',
    };
  },
  async search() {
    return [];
  },
};

export function getBrainProvider(): BrainProvider {
  const name = process.env.BRAIN_PROVIDER ?? 'federated';
  if (name === 'stub') return stubProvider;
  if (name === 'optimal') return createOptimalProvider();
  if (name === 'federated') return createFederatedBrain();
  return createGBrainProvider();
}
