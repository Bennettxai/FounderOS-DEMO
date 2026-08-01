import { resolveAttioKey } from '@/lib/creds';
import { RosterClientSchema, type RosterClient } from '@/lib/schemas';
import type { ConnectorStatus } from '@/lib/connectors/types';

export async function attioStatus(): Promise<ConnectorStatus> {
  const key = resolveAttioKey();
  if (!key) {
    return {
      id: 'attio',
      name: 'Attio (CRM)',
      kind: 'crm',
      state: 'not_configured',
      detail: 'ATTIO_API_KEY not found in env or ~/.config/mcp.json mcpServers.',
    };
  }
  try {
    // Token is record-read scoped: query records works, list endpoints 403.
    const res = await fetch('https://api.attio.com/v2/objects/deals/records/query', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 50 }),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { data?: unknown[] };
    const deals = body.data?.length ?? 0;
    return {
      id: 'attio',
      name: 'Attio (CRM)',
      kind: 'crm',
      state: 'connected',
      detail: `Vantage + LC pipeline reachable · ${deals}${deals === 50 ? '+' : ''} deals on record`,
      meta: { deals },
    };
  } catch (err) {
    return {
      id: 'attio',
      name: 'Attio (CRM)',
      kind: 'crm',
      state: 'error',
      detail: `Key found but query failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Map raw Attio deal records (documented shape: `values` holds arrays of typed
 * cells keyed by attribute slug) into validated roster rows. Every attribute
 * is treated as optional because workspace schemas vary; malformed records are
 * skipped rather than fatal. Currency note: `currency_value` is rendered as-is
 * with no decimal assumption.
 */
export function mapAttioDeals(records: unknown[]): RosterClient[] {
  const rows: RosterClient[] = [];
  for (const rec of records ?? []) {
    if (!rec || typeof rec !== 'object') continue;
    const r = rec as { id?: { record_id?: unknown }; values?: Record<string, unknown> };
    const recordId = typeof r.id?.record_id === 'string' ? r.id.record_id : null;
    if (!recordId) continue;
    const values = (r.values ?? {}) as Record<string, unknown>;
    const first = (slug: string): Record<string, unknown> | undefined => {
      const cell = values[slug];
      return Array.isArray(cell) && cell[0] && typeof cell[0] === 'object'
        ? (cell[0] as Record<string, unknown>)
        : undefined;
    };
    const nameCell = first('name');
    const name =
      typeof nameCell?.value === 'string' && nameCell.value.trim() ? (nameCell.value as string) : recordId;
    const stageCell = first('stage');
    const stageStatus = (stageCell?.status ?? {}) as Record<string, unknown>;
    const status = typeof stageStatus.title === 'string' && stageStatus.title ? (stageStatus.title as string) : 'open';
    const valueCell = first('value');
    const amountUsd = typeof valueCell?.currency_value === 'number' ? (valueCell.currency_value as number) : null;
    const parsed = RosterClientSchema.safeParse({
      id: recordId,
      name,
      venture: '',
      status,
      amountUsd,
      source: 'attio',
    });
    if (parsed.success) rows.push(parsed.data);
  }
  return rows;
}

export type AttioClientsResult = {
  state: 'connected' | 'not_configured' | 'error';
  clients: RosterClient[];
};

/** The live client roster from Attio deal records. Never throws; 4s timeout. */
export async function attioClients(
  opts: { resolveKey?: () => string | undefined } = {},
): Promise<AttioClientsResult> {
  const key = (opts.resolveKey ?? resolveAttioKey)();
  if (!key) return { state: 'not_configured', clients: [] };
  try {
    const res = await fetch('https://api.attio.com/v2/objects/deals/records/query', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 100 }),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return { state: 'error', clients: [] };
    const body = (await res.json()) as { data?: unknown[] };
    return { state: 'connected', clients: mapAttioDeals(body.data ?? []) };
  } catch {
    return { state: 'error', clients: [] };
  }
}
