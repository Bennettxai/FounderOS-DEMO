import { afterEach, describe, expect, test, vi } from 'vitest';
import { attioClients, mapAttioDeals } from '@/lib/connectors/attio';
import { RosterClientSchema } from '@/lib/schemas';

// A deal record in Attio's documented response shape: attributes come back as
// arrays of typed values keyed by slug.
const deal = (over: Record<string, unknown> = {}) => ({
  id: { workspace_id: 'ws', object_id: 'deals', record_id: 'rec-123' },
  values: {
    name: [{ value: 'Harbor Dental retainer' }],
    stage: [{ status: { title: 'Won' } }],
    value: [{ currency_value: 9500 }],
    ...over,
  },
});

describe('mapAttioDeals', () => {
  test('maps documented-shape deal records to validated roster rows', () => {
    const rows = mapAttioDeals([deal()]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'rec-123',
      name: 'Harbor Dental retainer',
      status: 'Won',
      amountUsd: 9500,
      source: 'attio',
    });
    for (const r of rows) expect(() => RosterClientSchema.parse(r)).not.toThrow();
  });

  test('missing attributes degrade to defaults instead of throwing', () => {
    const rows = mapAttioDeals([deal({ name: [], stage: [], value: [] })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('rec-123');
    expect(rows[0].status).toBe('open');
    expect(rows[0].amountUsd).toBeNull();
  });

  test('malformed records are skipped, not fatal', () => {
    const rows = mapAttioDeals([{ nonsense: true }, deal(), null, 42]);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('rec-123');
  });

  test('every row Zod-validates', () => {
    const rows = mapAttioDeals([deal(), deal({ name: [{ value: 'Second' }] })]);
    for (const r of rows) RosterClientSchema.parse(r);
  });
});

describe('attioClients', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  test('connected: returns mapped clients on a good response', async () => {
    vi.stubEnv('ATTIO_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [deal()] }), { status: 200 })));
    const out = await attioClients();
    expect(out.state).toBe('connected');
    expect(out.clients).toHaveLength(1);
    expect(out.clients[0].name).toBe('Harbor Dental retainer');
  });

  test('error: a 403 yields state error and an empty list, no throw', async () => {
    vi.stubEnv('ATTIO_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('forbidden', { status: 403 })));
    const out = await attioClients();
    expect(out.state).toBe('error');
    expect(out.clients).toEqual([]);
  });

  test('not_configured when no key resolves', async () => {
    vi.stubEnv('ATTIO_API_KEY', '');
    const out = await attioClients({ resolveKey: () => undefined });
    expect(out.state).toBe('not_configured');
    expect(out.clients).toEqual([]);
  });

  test('network failure yields error, never throws', async () => {
    vi.stubEnv('ATTIO_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('boom');
    }));
    const out = await attioClients();
    expect(out.state).toBe('error');
    expect(out.clients).toEqual([]);
  });
});
