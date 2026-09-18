import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

/**
 * Chrome and catalog UI that had drifted behind the upstream OS. These are
 * source-shape assertions on purpose: the behaviours are layout and geometry,
 * which is exactly what silently regresses when a component is copied forward
 * by hand.
 *
 * The names, storage keys and palette event are deliberately NOT upstream's.
 * This app is its own instance, so anything user-visible or persisted stays
 * local — the tests below pin that down so a future port cannot drag them in.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
/** The tokens this guard forbids, assembled at runtime so the source never spells them. */
const H = (...parts: string[]) => parts.join('');


describe('sidebar rail', () => {
  const sidebar = read('components/Sidebar.tsx');

  test('collapsed, the emblem stacks above the toggle instead of beside it', () => {
    // 34px mark + 28px button will not fit side by side in a 56px rail, so the
    // header switches to a column when collapsed
    expect(sidebar).toContain('flex-col items-center gap-2 px-0');
    expect(sidebar).toMatch(/collapsed \? \(\s*<OsMark size=\{30\}/);
  });

  test('expanded, the mark sits beside the wordmark', () => {
    expect(sidebar).toContain('<OsMark size={34}');
    expect(sidebar).toContain('items-center gap-[11px]');
  });

  test('this instance keeps its own wordmark and storage keys', () => {
    expect(sidebar).toContain('FOUNDER OS');
    expect(sidebar).not.toContain(H('BEN', 'NETT OS'));
    expect(sidebar).toContain('founderos.sidebar.w');
    expect(sidebar).toContain('founderos.sidebar.collapsed');
    expect(sidebar).not.toMatch(/'os\.sidebar\./);
  });

  test('no reference to the upstream operator or their private hosts', () => {
    expect(sidebar.toLowerCase()).not.toMatch(new RegExp([H('ben', 'nett'), H('tail', 'net'), H('tail', 'scale'), 'mini\\b'].join('|')));
  });
});

describe('topbar', () => {
  const topbar = read('components/Topbar.tsx');

  test('carries the OS emblem in the top-right corner', () => {
    expect(topbar).toContain("import { OsMark }");
    expect(topbar).toContain('<OsMark size={26}');
  });

  test('keeps this instance breadcrumb and palette event', () => {
    expect(topbar).toContain('founder-os');
    expect(topbar).toContain("'alex:palette'");
    expect(topbar.toLowerCase()).not.toContain(H('ben', 'nett'));
  });

  test('the palette listens on the same event the topbar dispatches', () => {
    expect(read('components/CommandPalette.tsx')).toContain("'alex:palette'");
  });
});

describe('skills grid', () => {
  const grid = read('components/SkillsGrid.tsx');

  test('the viewer offers a SKILL.md download, not just a read-only modal', () => {
    expect(grid).toMatch(/download/i);
    // the API route already streams the file with ?download=1
    expect(grid).toContain('download=1');
    expect(read('app/api/skills/[slug]/route.ts')).toContain('download');
  });

  test('the Operator groups the skills page emits are all orderable', () => {
    // app/skills/page.tsx groups as `Operator · ${category}`; every one of those
    // has to appear in GROUP_ORDER or it sorts to the end with a fallback icon
    // the card wall (2026-09 upstream) strips the prefix and keys its icon off
    // the category, so every Operator category needs a case there
    for (const g of ["case 'Sales'", "case 'Content'", "case 'Ops'"]) {
      expect(grid).toContain(g);
    }
  });

  test('Operator group names resolve an icon by stripping the prefix', () => {
    expect(grid).toMatch(/replace\(\/\^Operator · \//);
  });
});

describe('pillar radar geometry', () => {
  const radar = read('components/PillarRadar.tsx');

  test('the viewBox is padded horizontally so long rim labels do not clip', () => {
    // COMMUNICATIONS is the widest label and used to run off the edge
    expect(radar).toContain('PAD_X');
    expect(radar).toMatch(/PAD_X\s*=\s*76/);
  });

  test('labels are pulled in and set smaller to fit the padded box', () => {
    expect(radar).toMatch(/LABEL_R\s*=\s*R \+ 36/);
    expect(radar).toContain('0.14em');
    expect(radar).not.toContain('0.28em');
  });
});
