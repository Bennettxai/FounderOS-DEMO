import { describe, expect, test } from 'vitest';
import {
  INTEGRATIONS,
  integrationsByCategory,
  connectionCatalog,
  connectKeysFor,
} from '@/lib/integrations-catalog';
import { IntegrationSchema, INTEGRATION_CATEGORIES } from '@/lib/schemas';
import { hasBrandMark } from '@/lib/brand-logos';
import type { ConnectorStatus } from '@/lib/connectors/types';

describe('INTEGRATIONS catalog', () => {
  test('a rich catalog, every entry valid against the schema', () => {
    expect(INTEGRATIONS.length).toBeGreaterThanOrEqual(30);
    for (const i of INTEGRATIONS) {
      expect(() => IntegrationSchema.parse(i)).not.toThrow();
    }
  });

  test('slugs are unique', () => {
    const slugs = INTEGRATIONS.map((i) => i.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  test('every integration resolves to a real brand mark (logo or lettermark)', () => {
    for (const i of INTEGRATIONS) {
      expect(hasBrandMark(i.slug, i.name)).toBe(true);
    }
  });

  test('categories are all from the allowed set and each has at least 3 tools', () => {
    const byCat = integrationsByCategory();
    for (const [cat, tools] of byCat) {
      expect(INTEGRATION_CATEGORIES).toContain(cat);
      expect(tools.length).toBeGreaterThanOrEqual(3);
    }
  });

  test('at least 6 tools are flagged popular', () => {
    expect(INTEGRATIONS.filter((i) => i.popular).length).toBeGreaterThanOrEqual(6);
  });

  test('connectorIds point at ids that exist in the given status set', () => {
    const ids = new Set(INTEGRATIONS.map((i) => i.connectorId).filter(Boolean));
    // spot-check a few expected wirings
    expect(ids.has('slack')).toBe(true);
    expect(ids.has('notion')).toBe(true);
    expect(ids.has('payments')).toBe(true);
  });
});

describe('connectionCatalog — merges live connector state onto the catalog', () => {
  const statuses: ConnectorStatus[] = [
    { id: 'slack', name: 'Slack', kind: 'slack', state: 'connected', detail: 'ok' },
    { id: 'notion', name: 'Notion', kind: 'notion', state: 'not_configured', detail: 'no key' },
    { id: 'payments', name: 'Payments', kind: 'payments', state: 'error', detail: 'bad key' },
  ];

  test('a connected connector marks its catalog entry connected', () => {
    const rows = connectionCatalog(statuses);
    const slack = rows.find((r) => r.slug === 'slack');
    expect(slack?.connected).toBe(true);
  });

  test('a not_configured or error connector is not connected', () => {
    const rows = connectionCatalog(statuses);
    expect(rows.find((r) => r.slug === 'notion')?.connected).toBe(false);
    expect(rows.find((r) => r.slug === 'stripe')?.connected).toBe(false);
  });

  test('an integration with no connectorId is never connected', () => {
    const rows = connectionCatalog(statuses);
    const noConnector = rows.find((r) => !r.connectorId);
    expect(noConnector?.connected).toBe(false);
  });

  test('every catalog row survives the merge (count preserved)', () => {
    expect(connectionCatalog(statuses)).toHaveLength(INTEGRATIONS.length);
  });
});

describe('connect flow (paste a key on the board)', () => {
  test('connectKeysFor: explicit envKeys win, generic falls back, [] means guidance-only', () => {
    const notion = INTEGRATIONS.find((i) => i.slug === 'notion')!;
    expect(connectKeysFor(notion)).toEqual(['NOTION_API_KEY']);
    const discord = INTEGRATIONS.find((i) => i.slug === 'discord')!;
    expect(connectKeysFor(discord)).toEqual(['DISCORD_API_KEY']);
    const whatsapp = INTEGRATIONS.find((i) => i.slug === 'whatsapp')!;
    expect(connectKeysFor(whatsapp)).toEqual([]);
  });

  test("Alex's real stack is listed and tied to its connectors", () => {
    const bySlug = new Map(INTEGRATIONS.map((i) => [i.slug, i]));
    expect(bySlug.get('manychat')?.connectorId).toBe('manychat');
    expect(bySlug.get('gohighlevel')?.connectorId).toBe('ghl');
    expect(bySlug.get('webinarjam')?.connectorId).toBe('webinarjam');
    expect(bySlug.get('trakyo')?.connectorId).toBe('trakyo');
    expect(bySlug.get('zernio')?.connectorId).toBe('zernio');
    expect(bySlug.get('arcads')?.connectorId).toBe('arcads');
  });

  test('keySaved reflects env.local coverage of the entry keys, never fakes connected', () => {
    const catalog = connectionCatalog([], { NOTION_API_KEY: 'x', PAYPAL_CLIENT_ID: 'a' });
    const bySlug = new Map(catalog.map((c) => [c.slug, c]));
    expect(bySlug.get('notion')?.keySaved).toBe(true);
    expect(bySlug.get('notion')?.connected).toBe(false);
    // multi-key entries need every key before keySaved
    expect(bySlug.get('paypal')?.keySaved).toBe(false);
    expect(bySlug.get('discord')?.keySaved).toBe(false);
  });
});
