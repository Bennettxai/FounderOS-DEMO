import { GATED, connected as gatedConnected } from '@/lib/connectors/demo-status';
import { CRED_FILES, resolveCred } from '@/lib/creds';
import type { ConnectorStatus } from '@/lib/connectors/types';

export async function miroStatus(): Promise<ConnectorStatus> {
  if (GATED) return gatedConnected('miro', 'Miro', 'creative', 'boards · synced');
  const token = resolveCred('MIRO_ACCESS_TOKEN', [CRED_FILES.brainAgent]);
  if (!token) {
    return {
      id: 'miro',
      name: 'Miro',
      kind: 'creative',
      state: 'not_configured',
      detail: 'MIRO_ACCESS_TOKEN not found in env or brain-agent/.env.agents.',
    };
  }
  try {
    const res = await fetch('https://api.miro.com/v2/boards?limit=10', {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { data?: unknown[]; total?: number };
    return {
      id: 'miro',
      name: 'Miro',
      kind: 'creative',
      state: 'connected',
      detail: `Boards API reachable · ${body.total ?? body.data?.length ?? 0} boards`,
      meta: { boards: body.total ?? 0 },
    };
  } catch (err) {
    return {
      id: 'miro',
      name: 'Miro',
      kind: 'creative',
      state: 'error',
      detail: `Token found but API check failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
