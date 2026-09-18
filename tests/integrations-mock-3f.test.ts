import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * Mock 3f (interaction rebrand handoff, artboard 3f): /integrations. The tiles
 * keep their brand logos and move to the 12px tile radius, connecting is a
 * three-state control that says "OAuth…" while it works, a connected tile
 * carries a green LED and a tinted border, categories collapse behind a
 * rotating ▸, and every key row can hide its own tail and prove the connector
 * still answers with a real elapsed time.
 */
describe('/integrations mock-3f: 12px tiles that keep their logos', () => {
  const card = read('components/ConnectionCard.tsx');

  test('the tile is a lens row at the tile radius', () => {
    expect(card).toContain('rounded-tile');
    expect(card).toContain('pressable is-row');
    expect(card).toContain('data-lens="r"');
  });

  test('BrandLogo is untouched', () => {
    expect(card).toContain('BrandLogo');
  });

  test('a connected tile is tinted, an unconnected one is not', () => {
    expect(card).toContain('entry.connected');
    // the tint is the ok token mixed into the hairline, the codebase idiom
    expect(card).toMatch(/entry\.connected[\s\S]{0,200}var\(--ok\)/);
  });
});

describe('/integrations mock-3f: Connect → OAuth… → connected', () => {
  const flow = read('components/ConnectFlow.tsx');

  test('the save is a three-state control, not a bare disabled button', () => {
    expect(flow).toContain('AsyncButton');
    expect(flow).toContain('OAuth…');
    expect(flow).toContain('connected');
  });

  test('the connected chip is a real LED, not an ad-hoc circle', () => {
    expect(flow).toContain('dot ok');
    expect(flow).not.toContain('h-1.5 w-1.5 rounded-full bg-os-ok');
  });
});

describe('/integrations mock-3f: category accordion', () => {
  const cat = read('components/IntegrationCategory.tsx');

  test('the caret is the rebrand ▸ and it rotates', () => {
    expect(cat).toContain('▸');
    expect(cat).toContain('rotate-90');
    expect(cat).toContain('transition-transform');
    expect(cat).toContain('aria-expanded');
  });

  test('the category shell is a floating panel, not a 16px pill', () => {
    expect(cat).toContain('rounded-panel');
    expect(cat).not.toContain('rounded-2xl');
  });
});

describe('/integrations mock-3f: key rows reveal and test', () => {
  const keys = read('components/ApiKeys.tsx');

  test('each row can hide its own masked tail', () => {
    expect(keys).toContain('revealed');
    expect(keys).toContain('hide');
    expect(keys).toContain('reveal');
  });

  test('the test control is three-state and reports the real elapsed ms', () => {
    expect(keys).toContain('AsyncButton');
    expect(keys).toContain('/api/admin/keys/test');
    expect(keys).toMatch(/\$\{[^}]*ms[^}]*\}ms|ms\}ms/);
  });

  test('the group card is a lens row at the panel radius', () => {
    expect(keys).toContain('pressable is-row');
    expect(keys).toContain('rounded-panel');
    expect(keys).not.toContain('rounded-xl');
  });
});

describe('/integrations mock-3f: the test is a real connector read', () => {
  test('key slots name the connector they feed', () => {
    const lib = read('lib/keys.ts');
    expect(lib).toContain('connectorId');
    expect(lib).toContain("connectorId: 'slack'");
  });

  test('a single connector can be checked on its own', () => {
    expect(read('lib/connectors/index.ts')).toContain('export async function connectorStatusById');
  });

  test('the route times that check', () => {
    const route = read('app/api/admin/keys/test/route.ts');
    expect(route).toContain('connectorStatusById');
    expect(route).toContain('ms');
  });
});

describe('/integrations mock-3f: radius rule', () => {
  const files = [
    'app/integrations/page.tsx',
    'components/ConnectionCard.tsx',
    'components/ConnectFlow.tsx',
    'components/IntegrationCategory.tsx',
    'components/ApiKeys.tsx',
  ];

  test('nothing on the route is still on the premium-pass radii', () => {
    for (const f of files) {
      const src = read(f);
      expect(src, f).not.toContain('rounded-lg-t');
      expect(src, f).not.toContain('rounded-md-t');
      expect(src, f).not.toContain('rounded-sm-t');
    }
  });

  test('controls use the control radius, chips stay round', () => {
    const flow = read('components/ConnectFlow.tsx');
    expect(flow).toContain('rounded-ctl');
    expect(flow).toContain('rounded-full');
    expect(flow).not.toContain('rounded-md ');
  });
});
