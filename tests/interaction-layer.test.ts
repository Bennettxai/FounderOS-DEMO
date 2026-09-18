import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/** Every .ts/.tsx/.css file under the given dirs — the codemod must be total. */
function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(process.cwd(), dir))) {
    const rel = join(dir, name);
    const st = statSync(join(process.cwd(), rel));
    if (st.isDirectory()) out.push(...sources(rel));
    else if (/\.(tsx?|css)$/.test(name)) out.push(rel);
  }
  return out;
}

/**
 * Interaction-layer contract (Founder OS Interaction Rebrand, 2026-09-07).
 * The look stays Monolith Signal; what changes is how the surface answers the
 * mouse: hover lens (magnify + magnetic pull), press sink, async idle→busy→done,
 * sliding tab selection, radius on controls while structural boxes stay square.
 */
describe('interaction layer foundation', () => {
  test('globals.css carries the pressable rule and the old hoverable rule is gone', () => {
    const css = read('app/globals.css');
    expect(css).toContain('.pressable');
    expect(css).toContain('--dur-lens');
    expect(css).toContain('--ease-lens');
    expect(css).toContain('--r-ctl');
    expect(css).toContain('.spotlight');
    expect(css).toContain('.skeleton');
    expect(css).not.toMatch(/\.hoverable\s*\{/);
  });

  test('border-radius never animates: the pressable transition list omits it', () => {
    const css = read('app/globals.css');
    const rule = css.match(/\.pressable\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toContain('transition');
    expect(rule).not.toContain('border-radius');
  });

  test('reduced motion kills transforms, shadows and the ambient animations', () => {
    const css = read('app/globals.css');
    const guard = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[^@]*\.pressable[^}]*\}[^@]*?\}/)?.[0] ?? '';
    expect(guard).toContain('transform: none');
    expect(guard).toContain('.spotlight');
  });

  test('the emblem stays dead machinery under the new class', () => {
    const css = read('app/globals.css');
    expect(css).toContain('.pressable:hover .emblem');
    expect(css).not.toContain('.hoverable:hover .emblem');
  });

  test('tailwind exposes the new radii, durations and shadows', () => {
    const tw = read('tailwind.config.ts');
    for (const s of ["ctl: '6px'", "panel: '10px'", "tile: '12px'", "lens: '630ms'", "press: '200ms'", 'om-pop', 'om-shimmer']) {
      expect(tw).toContain(s);
    }
    // premium pass (2026-09-07, the operator's override of real-screen-wins): structural
    // boxes round to the mock's scale instead of staying square
    expect(tw).toContain("'sm-t': '5px'");
    expect(tw).toContain("'md-t': '8px'");
    expect(tw).toContain("'lg-t': '10px'");
  });

  test('status dots are round like the mock, not LED squares', () => {
    const css = read('app/globals.css');
    const rule = css.slice(css.indexOf('.dot {'), css.indexOf('}', css.indexOf('.dot {')));
    expect(rule).toContain('border-radius: 50%');
  });

  test('badges are pills: Badge renders rounded-full like the mock 999px chips', () => {
    const src = read('components/terminal.tsx');
    const fn = src.slice(src.indexOf('export function Badge'), src.indexOf('export function', src.indexOf('export function Badge') + 10));
    expect(fn).toContain('rounded-full');
    expect(fn).not.toContain('rounded-sm-t');
  });

  test('useLens is a single document-level listener honoring reduced motion', () => {
    const src = read('lib/hooks/useLens.ts');
    expect(src).toContain("'use client'");
    expect(src).toContain('prefers-reduced-motion');
    expect(src).toContain('pointermove');
    expect(src).toContain('[data-lens]');
    expect(src).toContain('[data-spot]');
    expect(src).toContain('LensProvider');
  });

  test('LensProvider mounts once in the root layout', () => {
    const layout = read('app/layout.tsx');
    expect(layout).toContain('LensProvider');
  });

  test('the interaction components exist with their contracts', () => {
    const pressable = read('components/Pressable.tsx');
    expect(pressable).toContain('data-lens');
    expect(pressable).toContain('is-primary');
    const async_ = read('components/AsyncButton.tsx');
    expect(async_).toContain("'idle' | 'busy' | 'done'");
    expect(async_).toContain('aria-busy');
    const tabs = read('components/SlidingTabs.tsx');
    expect(tabs).toContain('role="tablist"');
    expect(tabs).toContain('translateX');
    expect(existsSync(join(process.cwd(), 'components/Spotlight.tsx'))).toBe(true);
  });

  test('no hoverable class survives anywhere in app/ or components/', () => {
    const offenders = [...sources('app'), ...sources('components')].filter((f) => read(f).includes('hoverable'));
    expect(offenders).toEqual([]);
  });
});

/**
 * Step 3 — Comms. The tab strip is the sliding pill (the marker slides, never
 * jumps), the inbox reader animates in with om-in, and unread dots pop from
 * scale 0 so a new message registers as an event, not a repaint.
 */
describe('comms interaction pass', () => {
  test('CommsTabs uses SlidingTabs instead of a hand-rolled tab strip', () => {
    const src = read('components/CommsTabs.tsx');
    expect(src).toContain("from '@/components/SlidingTabs'");
    expect(src).toMatch(/variant="pill"/);
    expect(src).not.toContain('TabButton');
  });

  test('the inbox reader panel enters with om-in and floats on a tile radius', () => {
    const src = read('components/CommsBoard.tsx');
    expect(src).toContain('animate-enter');
    expect(src).toContain('rounded-tile');
  });

  test('unread dots pop in from scale 0', () => {
    const src = read('components/CommsBoard.tsx');
    expect(src).toContain('animate-pop');
  });
});

describe('brain interaction pass', () => {
  test('BrainGraphView uses the SlidingTabs pill for the Radial/Neural switch', () => {
    const src = read('components/BrainGraphView.tsx');
    expect(src).toContain("from '@/components/SlidingTabs'");
    expect(src).toMatch(/variant="pill"/);
    expect(src).not.toContain('aria-pressed');
  });
  test('BrainDump buttons are pressable and the saved confirmation pops in', () => {
    const src = read('components/BrainDump.tsx');
    expect(src).toContain('pressable');
    expect(src).toContain('animate-pop');
  });
});

describe('org interaction pass (classes only — markup frozen)', () => {
  // mock 1f moved the dim onto .pressable's own property list (opacity is one
  // of the six it names) so the pill's radius can jump 999 → 8 without easing
  test('worker pill venture dim rides the pressable list and the switcher sits on the ctl radius', () => {
    const pill = read('components/OrgWorkerPill.tsx');
    const src = read('app/org/page.tsx');
    expect(pill).toContain('pressable is-row');
    expect(pill).toContain('opacity-20');
    expect(src).toContain('rounded-ctl');
  });
  test('Conductor send is a pressable async control and replies enter with om-in', () => {
    const src = read('components/ConductorCard.tsx');
    expect(src).toContain('AsyncButton');
    expect(src).toContain('animate-enter');
  });
});

describe('agents interaction pass', () => {
  test('BoardLive stat values count in, the seat Run button is pressable, and task cards enter', () => {
    const src = read('components/BoardLive.tsx');
    expect(src).toContain("from '@/components/CountUp'");
    expect(src).toContain('pressable');
    expect(src).toContain('animate-enter');
  });
});

describe('doctor / funnel / finances / integrations interaction pass', () => {
  test('the BrainCore doctor pop-out floats on the panel radius with pressable controls', () => {
    const src = read('components/BrainCore.tsx');
    expect(src).toContain('rounded-panel');
    expect(src).toContain('pressable');
  });
  test('funnel control-line links press and sit on the ctl radius', () => {
    const src = read('app/funnel/page.tsx');
    expect(src).toContain('pressable');
    expect(src).toContain('rounded-ctl');
  });
  test('the statement uploader button presses and its status line enters', () => {
    const src = read('components/StatementUploader.tsx');
    expect(src).toContain('pressable');
    expect(src).toContain('animate-enter');
  });
  test('connection tiles sit on the tile radius and the connect flow buttons press', () => {
    expect(read('components/ConnectionCard.tsx')).toContain('rounded-tile');
    expect(read('components/ConnectFlow.tsx')).toContain('pressable');
  });
  test('the cursor spotlight is page-wide, mounted once in the layout, like the design screens', () => {
    // The mock puts data-spot on the whole screen, so the glow follows the
    // cursor across sidebar and content alike. One fixed layer replaces the
    // per-card islands (home Done today, doctor stage) so nothing doubles up.
    expect(read('app/layout.tsx')).toContain('<PageSpotlight />');
    const spot = read('components/Spotlight.tsx');
    expect(spot).toContain('export function PageSpotlight');
    expect(spot).toContain('spotlight is-page');
    const css = read('app/globals.css');
    expect(css).toMatch(/\.spotlight\.is-page\s*\{[^}]*position:\s*fixed/);
    expect(css).toContain('var(--px');
    const lens = read('lib/hooks/useLens.ts');
    expect(lens).toContain('documentElement');
    expect(lens).toContain('--px');
    expect(read('app/page.tsx')).not.toContain('data-spot');
    expect(read('app/doctor/page.tsx')).not.toContain('data-spot');
  });
});

describe('trading / usage interaction pass', () => {
  test('trading position, order and trade-log rows carry the row lens', () => {
    const src = read('components/trading/TradingBoard.tsx');
    expect(src).toContain('data-lens="r"');
    expect(src).toContain('pressable is-row');
  });
  test('the trading limits save button presses on the ctl radius and the saved line enters', () => {
    const src = read('components/TradingLimits.tsx');
    expect(src).toContain('pressable');
    expect(src).toContain('rounded-ctl');
    expect(src).toContain('animate-enter');
  });
  // The /usage board only exists on the founder-os lineage; main has not
  // taken that feature yet, so the contract is conditional on the file.
  test.skipIf(!existsSync(join(process.cwd(), 'components/UsageBoard.tsx')))('usage seat cards carry the row lens', () => {
    const src = read('components/UsageBoard.tsx');
    expect(src).toContain('data-lens="r"');
    expect(src).toContain('pressable is-row');
  });
});

describe('remaining component interaction pass', () => {
  test('the post composer chips and submit button press on the ctl radius', () => {
    const src = read('components/PostComposer.tsx');
    expect(src).toContain('pressable');
    expect(src).toContain('rounded-ctl');
  });
  test('the comms digest controls press', () => {
    const src = read('components/CommsDigestPanel.tsx');
    expect(src).toContain('pressable');
    expect(src).toContain('rounded-ctl');
  });
  test('the monthly expenses month chips and report button press on the ctl radius', () => {
    const src = read('components/MonthlyExpenses.tsx');
    expect(src).toContain('pressable');
    expect(src).toContain('rounded-ctl');
  });
  test('the audience chart range chips press and its floating layers sit on the panel radius', () => {
    const src = read('components/AudienceConsistency.tsx');
    expect(src).toContain('pressable');
    expect(src).toContain('rounded-ctl');
    expect(src).toContain('rounded-panel');
  });
});

describe('tab completion pass: every control presses', () => {
  // Sweeping contract: any component that renders a raw <button> must carry
  // the press layer somewhere in the file. Components that only compose
  // Pressable/AsyncButton/Chip inherit it and render no raw <button>, so they
  // pass vacuously. Known orphans (dead files kept for a one-line revert) are
  // exempt until deleted.
  const ORPHAN_EXEMPT = ['CommsGravity.tsx', 'HomeSocialGraph.tsx'];
  const componentFiles = readdirSync(join(process.cwd(), 'components')).filter(
    (n) => n.endsWith('.tsx') && !ORPHAN_EXEMPT.includes(n)
  );
  const withRawButtons = componentFiles.filter((n) => read(`components/${n}`).includes('<button'));

  test.each(withRawButtons)('%s buttons press', (name) => {
    expect(read(`components/${name}`)).toContain('pressable');
  });

  test('the comms lane rows carry the row lens', () => {
    const src = read('components/CommsBoard.tsx');
    expect(src).toContain('data-lens="r"');
    expect(src).toContain('pressable is-row');
  });
  test('the slack client cards carry the row lens', () => {
    const src = read('components/SlackClientBoard.tsx');
    expect(src).toContain('data-lens="r"');
    expect(src).toContain('pressable is-row');
  });
});

describe('turn-3 pass: the screens the earlier passes missed', () => {
  test('every raw <button> opening tag carries the press layer', () => {
    // The earlier codemod contract only checked per-file; this one checks per-button.
    // Sole exemption: BrainCore's invisible gauge hotspot is centered with Tailwind
    // transforms, and .pressable:hover would override them and move it.
    const exempt = new Set(['components/BrainCore.tsx']);
    const offenders: string[] = [];
    for (const rel of [...sources('components'), ...sources('app')]) {
      if (!rel.endsWith('.tsx') || exempt.has(rel)) continue;
      const src = read(rel);
      let idx = src.indexOf('<button');
      while (idx !== -1) {
        let i = idx + 7;
        let depth = 0;
        while (i < src.length) {
          const c = src[i];
          if (c === '{') depth += 1;
          else if (c === '}') depth -= 1;
          else if (c === '>' && depth === 0) break;
          i += 1;
        }
        if (!src.slice(idx, i + 1).includes('pressable')) {
          offenders.push(`${rel}:${src.slice(0, idx).split('\n').length}`);
        }
        idx = src.indexOf('<button', i);
      }
    }
    expect(offenders).toEqual([]);
  });

  test('the doctor page carries the lens layer: rows and cmd chips', () => {
    const src = read('app/doctor/page.tsx');
    expect((src.match(/data-lens="r"/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(src).toContain('data-lens="c"');
  });

  test('the doctor page mounts a rerun control built on AsyncButton', () => {
    expect(read('app/doctor/page.tsx')).toContain('DoctorRerun');
    const ctl = read('components/DoctorRerun.tsx');
    expect(ctl).toContain("'use client'");
    expect(ctl).toContain('AsyncButton');
    // mock 3b moved the run itself into the shared DoctorRun context, so the
    // checks column shimmers on the same press the button spins on
    expect(read('components/DoctorRun.tsx')).toContain('refresh()');
  });

  test('needs-you rows are pressable rows under the lens', () => {
    const src = read('components/NeedsYouList.tsx');
    expect(src).toContain('data-lens="r"');
    expect(src).toContain('pressable is-row');
  });

  test('funnel venture tabs, view toggles and segment chips carry the control lens', () => {
    // mock-3c pass folded the four view text links into two mapped chip Links,
    // so 5 source sites now cover every control (each map renders many chips)
    const src = read('app/funnel/page.tsx');
    expect((src.match(/data-lens="c"/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });

  test('trading open orders and trade log rows carry the row lens', () => {
    const src = read('components/trading/TradingBoard.tsx');
    expect((src.match(/data-lens="r"/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  test('integrations category rows, connection tiles and connect controls carry the lens', () => {
    expect(read('components/IntegrationCategory.tsx')).toContain('data-lens="r"');
    expect(read('components/ConnectionCard.tsx')).toContain('data-lens="r"');
    expect((read('components/ConnectFlow.tsx').match(/data-lens="c"/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  test('statement uploader target chips press under the control lens', () => {
    expect(read('components/StatementUploader.tsx')).toContain('data-lens="c"');
  });
});
