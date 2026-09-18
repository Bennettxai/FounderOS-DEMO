import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * Slab import, slice 1 (2026-09-17): /brand-deals takes the Slab
 * "Deal Journeys" slab (hatched funnel hero, prompt bar as a live filter,
 * barber-pole meters, step-line and dot-matrix minis, one gradient insight
 * card, a detail drawer) and feeds it the Notion Brand Deals Hub. Notion
 * stays the source of truth and the page stays read-only: no send, draft or
 * override endpoints, only deep links back into Notion.
 */
describe('/brand-deals slab: the page hands Notion to the client board', () => {
  const page = read('app/brand-deals/page.tsx');

  test('renders the Slab board from the Notion connector', () => {
    expect(page).toContain('fetchBrandDeals');
    expect(page).toContain('<DealBoard');
    expect(page).toMatch(/from '@\/components\/brand-deals\/DealBoard'/);
  });

  test('the slab owns its own title row, so the shared PageHeader is skipped', () => {
    expect(page).not.toContain('PageHeader');
  });

  test('no em dashes', () => {
    expect(page).not.toContain('—');
  });
});

describe('/brand-deals slab: the board', () => {
  const board = read('components/brand-deals/DealBoard.tsx');

  test('is built on the hatched PipelineChart hero and the pure view model', () => {
    expect(board).toMatch(/from '@\/components\/PipelineChart'/);
    expect(board).toMatch(/from '@\/lib\/brand-deals-view'/);
  });

  test('keeps the honest live pill, the Notion row count and the sync age', () => {
    expect(board).toContain('live · Notion');
    expect(board).toMatch(/Notion rows/);
    expect(board).toContain('synced');
    expect(board).toContain('seeded');
  });

  test('refreshes from the existing GET route and nothing else', () => {
    expect(board).toContain("fetch('/api/brand-deals')");
    expect(board).not.toContain('/api/brand-deals/send');
    expect(board).not.toContain('/api/brand-deals/draft');
    expect(board).not.toContain('/api/brand-deals/override');
    expect(board).not.toMatch(/method:\s*'POST'/);
  });

  test('every deal deep-links into Notion and the drawer says so', () => {
    expect(board).toContain('notionUrl');
    expect(board).toContain('Open in Notion');
  });

  test('the prompt bar advertises its slash filters', () => {
    expect(board).toContain('/talks');
    expect(board).toContain('/production');
    expect(board).toContain('/paid');
  });

  test('no em dashes, no emoji', () => {
    expect(board).not.toContain('—');
    expect(board).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

describe('/brand-deals slab: the ported chart and the retired board', () => {
  test('PipelineChart is a shared component with the count-up and caret exports', () => {
    const chart = read('components/PipelineChart.tsx');
    expect(chart).toContain('export function PipelineChart');
    expect(chart).toContain('export function useCountUp');
    expect(chart).toContain('export const CARET_ANIMATION');
    expect(chart).not.toContain('—');
  });

  test('the old Notion table board is gone; the slab replaced it', () => {
    expect(existsSync(join(process.cwd(), 'components/DealsBoard.tsx'))).toBe(false);
  });
});

describe('/brand-deals slab: data tokens ride the colorway', () => {
  const css = read('app/globals.css');
  const rootBlock = css.slice(0, css.indexOf("[data-theme='dark']"));

  test.each(['--ramp-1', '--ramp-2', '--ramp-3', '--ramp-4', '--send-activity', '--pc-shade', '--tile-glow-a', '--tile-glow-b', '--tile-glow-c'])(
    '%s is defined once on bare :root and derived from an existing theme token, never a raw hex',
    (name) => {
      const decl = new RegExp(`${name}\\s*:\\s*([^;]+);`);
      const m = rootBlock.match(decl);
      expect(m, `${name} must be declared before the first theme block`).not.toBeNull();
      expect(m![1]).toContain('var(--');
      expect(m![1]).not.toMatch(/#[0-9a-f]{3,8}/i);
      expect(css.match(new RegExp(`${name}\\s*:`, 'g'))).toHaveLength(1);
    },
  );
});
