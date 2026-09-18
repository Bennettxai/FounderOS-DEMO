import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { NAV_OPERATE, DIGIT_VIEWS, NAV_ORDER } from '@/lib/nav';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * Slab import, slice 3 (2026-09-17): /adpilot, the paid-media deck and ad
 * library, arrives as a new page. Honest by absence: campaigns come only
 * from an ad-account sync (no data file ships), the library reads Foreplay
 * only when FOREPLAY_API_KEY is planted, and both say so on screen. The
 * page keeps its sanctioned red accent, scoped to its own wrapper.
 */
describe('/adpilot: present, reachable, honest', () => {
  test('the page, its components, its lib and its routes exist', () => {
    for (const p of [
      'app/adpilot/page.tsx',
      'components/adpilot/AdPilotDeck.tsx',
      'components/adpilot/AdLibrary.tsx',
      'components/adpilot/Globe.tsx',
      'lib/adpilot.ts',
      'lib/adpilot-data.ts',
      'lib/foreplay/client.ts',
      'lib/connectors/foreplay.ts',
      'app/api/adscout/ask/route.ts',
      'app/api/adscout/mine/route.ts',
      'app/api/adscout/saved/route.ts',
      'app/api/adscout/sync/route.ts',
      'app/api/adscout/watchlist/route.ts',
    ]) {
      expect(existsSync(join(process.cwd(), p)), p).toBe(true);
    }
  });

  test('no staged campaign file ships; the deck says so instead of inventing numbers', () => {
    expect(existsSync(join(process.cwd(), 'data/adpilot-campaigns.json'))).toBe(false);
    const deck = read('components/adpilot/AdPilotDeck.tsx');
    expect(deck).toContain('No ad account connected');
    const lib = read('components/adpilot/AdLibrary.tsx');
    expect(lib).toContain('not connected');
  });

  test('AdPilot sits at the end of Operate, outside the nine digit shortcuts', () => {
    expect(NAV_OPERATE[NAV_OPERATE.length - 1].href).toBe('/adpilot');
    expect(DIGIT_VIEWS).not.toContain('/adpilot');
    expect(NAV_ORDER).toContain('/adpilot');
  });

  test('the Foreplay key resolves through the operator credential files, not Slab paths', () => {
    const client = read('lib/foreplay/client.ts');
    expect(client).toContain('FOREPLAY_API_KEY');
    expect(client).not.toContain('agentsEnv');
  });

  test('the red accent is scoped to the page wrapper', () => {
    const page = read('app/adpilot/page.tsx');
    expect(page).toContain('data-adpilot');
    expect(page).toMatch(/'--accent':\s*'#ff4557'/);
  });

  test('the ap- surface classes the components use are defined in globals.css', () => {
    const css = read('app/globals.css');
    for (const cls of ['ap-panel', 'ap-chip', 'ap-hatch', 'ap-glow', 'ap-frost', 'ap-bright', 'ap-orbit']) {
      expect(css, cls).toMatch(new RegExp(`\\.${cls}\\s*\\{`));
    }
    expect(css).toContain('@keyframes ap-spin');
  });
});

describe('/adpilot: house rules on every ported file', () => {
  const files = [
    'app/adpilot/page.tsx',
    ...readdirSync(join(process.cwd(), 'components/adpilot')).map((f) => `components/adpilot/${f}`),
    'lib/adpilot.ts',
    'lib/adpilot-data.ts',
    ...readdirSync(join(process.cwd(), 'lib/foreplay')).map((f) => `lib/foreplay/${f}`),
  ];
  test.each(files)('%s', (file) => {
    const src = read(file);
    expect(src).not.toContain('—');
    expect(src).not.toMatch(/transition-(colors|all)\b/);
    expect(src).not.toMatch(/\bslab\b/i);
    expect(src).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
