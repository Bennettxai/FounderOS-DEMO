import { resolveCred } from '@/lib/creds';
import type { ConnectorStatus } from '@/lib/connectors/types';

export async function arcadsStatus(): Promise<ConnectorStatus> {
  const auth = resolveCred('ARCADS_BASIC_AUTH');
  if (!auth) {
    return {
      id: 'arcads',
      name: 'Arcads (UGC Ads)',
      kind: 'creative',
      state: 'not_configured',
      detail: 'ARCADS_BASIC_AUTH not found in env.',
    };
  }
  try {
    const res = await fetch('https://external-api.arcads.ai/v1/products', {
      headers: { Authorization: auth.startsWith('Basic ') ? auth : `Basic ${auth}` },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}${res.status === 403 ? ' — rotate creds in Arcads dashboard' : ''}`);
    const body = (await res.json()) as unknown[] | { results?: unknown[] };
    const products = Array.isArray(body) ? body.length : (body.results?.length ?? 0);
    return {
      id: 'arcads',
      name: 'Arcads (UGC Ads)',
      kind: 'creative',
      state: 'connected',
      detail: `Vantage workspace reachable · ${products} product${products === 1 ? '' : 's'}`,
      meta: { products },
    };
  } catch (err) {
    return {
      id: 'arcads',
      name: 'Arcads (UGC Ads)',
      kind: 'creative',
      state: 'error',
      detail: `Creds found but API check failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
