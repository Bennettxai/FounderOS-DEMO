import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { quickActionsFor } from '@/lib/screen-context';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * Mock 1h (interaction rebrand handoff, artboard 1h): "Conductor dock — 380px,
 * pushes content (margin-right, 420ms); quick actions per route; routed-to
 * label; shimmer 'synthesizing · Ns'; receipt card."
 *
 * The dock already pushes and already labels where a turn was routed. What the
 * mock adds is the per-screen quick-action band under the header, a clear
 * control, the honest model chip, the "✓ … open →" receipt card under an
 * action turn, the lowercase shimmer, and the composer as a lens row on the
 * rebrand radii.
 */
describe('/conductor mock-1h: the dock geometry', () => {
  const panel = read('components/ConductorPanel.tsx');
  const css = read('app/globals.css');

  test('380px default width and a 420ms slide', () => {
    expect(panel).toContain('useState(380)');
    expect(panel).toContain('duration-[420ms]');
    expect(panel).toContain("transitionTimingFunction: 'var(--ease)'");
  });

  test('the content column glides aside instead of being covered', () => {
    expect(panel).toContain("setProperty('--conductor-w'");
    expect(css).toMatch(/\.os-shell\s*\{\s*transition: margin-right 420ms var\(--ease\)/);
  });

  test('one edge control only: the mock has a single slide-away arrow', () => {
    expect(panel).not.toContain('ChevronLeft');
    expect(panel).toContain('Slide away');
  });
});

describe('/conductor mock-1h: quick actions come from the route', () => {
  test('every screen gets four one-tap openers', () => {
    for (const path of ['/', '/brain', '/funnel', '/agents', '/finances', '/comms']) {
      const actions = quickActionsFor(path);
      expect(actions).toHaveLength(4);
      for (const a of actions) {
        expect(a.label.length).toBeGreaterThan(0);
        expect(a.prompt.length).toBeGreaterThan(a.label.length);
      }
    }
  });

  test('they are actually per screen, not one hardcoded set', () => {
    const brain = quickActionsFor('/brain').map((a) => a.label);
    const money = quickActionsFor('/finances').map((a) => a.label);
    expect(brain).not.toEqual(money);
    // a query string must not change which screen it is
    expect(quickActionsFor('/funnel?venture=vantage')).toEqual(quickActionsFor('/funnel'));
  });

  test('an unknown route still gets a usable set', () => {
    expect(quickActionsFor('/nonexistent')).toHaveLength(4);
  });

  test('the context endpoint carries them to the dock', () => {
    const ctx = read('lib/screen-context.ts');
    expect(ctx).toContain('quickActionsFor');
    expect(ctx).toMatch(/quickActions/);
    const route = read('app/api/conductor/context/route.ts');
    expect(route).toContain('quickActions');
  });

  test('the panel reads them off the context, with a local fallback', () => {
    const panel = read('components/ConductorPanel.tsx');
    expect(panel).toContain('quickActions');
    expect(panel).toContain('ctx?.quickActions');
    expect(panel).toContain('QUICK_ACTIONS');
  });

  test('they live in their own band under the header, not inside the empty state', () => {
    const panel = read('components/ConductorPanel.tsx');
    expect(panel).toContain('quick actions · this screen');
    // the band sits above the transcript, so it renders before the scroll pane
    expect(panel.indexOf('quick actions · this screen')).toBeLessThan(panel.indexOf('ref={scrollRef}'));
    expect(panel).toContain('ask about this screen, or pick a quick action above');
  });

  test('each action is a lens control on the control radius', () => {
    const panel = read('components/ConductorPanel.tsx');
    const band = panel.slice(panel.indexOf('quick actions · this screen'), panel.indexOf('ref={scrollRef}'));
    expect(band).toContain('data-lens="c"');
    expect(band).toContain('pressable');
    expect(band).toContain('rounded-ctl');
  });
});

describe('/conductor mock-1h: the header states and clears', () => {
  const panel = read('components/ConductorPanel.tsx');

  test('a clear control empties the transcript', () => {
    expect(panel).toContain('Clear transcript');
    expect(panel).toContain('clearTurns');
  });

  test('the model chip reads the live seat, never a hardcoded id', () => {
    expect(panel).toContain('model');
    expect(panel).not.toMatch(/claude-(fable|opus|sonnet|haiku|mythos)-[\d.-]+/);
    expect(panel).toMatch(/model unknown|unknown model/i);
    const route = read('app/api/conductor/context/route.ts');
    expect(route).toContain("name === 'Conductor'");
  });
});

describe('/conductor mock-1h: receipts and shimmer', () => {
  const panel = read('components/ConductorPanel.tsx');

  test('an action turn carries a receipt, not just prose', () => {
    expect(panel).toMatch(/receipt\??:/);
    expect(panel).toContain('t.receipt');
  });

  test('the receipt card pops a ✓ in the ok color and offers one way in', () => {
    const card = panel.slice(panel.indexOf('t.receipt'));
    expect(card).toContain('✓');
    expect(card).toContain('text-os-ok');
    expect(card).toContain('open →');
    expect(card).toContain('rounded-ctl');
  });

  test('the dispatch turn files a real receipt', () => {
    expect(panel).toContain('Workspace opened on an isolated branch');
  });

  test('the shimmer reads "synthesizing · Ns" with a blinking square', () => {
    const synth = read('components/Synthesizing.tsx');
    expect(synth).toContain('dock');
    expect(synth).toContain('synthesizing');
    expect(synth).toContain('om-blink');
    expect(read('app/globals.css')).toContain('@keyframes om-blink');
    expect(panel).toContain('<Synthesizing dock');
  });
});

describe('/conductor mock-1h: the composer is a lens row', () => {
  const composer = read('components/ConductorComposer.tsx');

  test('the wrapper lifts as a row on the panel radius', () => {
    expect(composer).toContain('data-lens="r"');
    expect(composer).toContain('pressable is-row');
    expect(composer).toContain('rounded-panel');
  });

  test('no hover changes only one property', () => {
    expect(composer).not.toContain('transition-colors');
    expect(composer).not.toContain('transition-all');
  });
});

describe('/conductor mock-1h: rebrand radius tokens', () => {
  const panel = read('components/ConductorPanel.tsx');
  const composer = read('components/ConductorComposer.tsx');

  test('the premium-pass and Tailwind default radii are gone', () => {
    for (const src of [panel, composer]) {
      expect(src).not.toContain('rounded-sm-t');
      expect(src).not.toContain('rounded-lg-t');
      expect(src).not.toMatch(/rounded-md(?!-t)/);
      expect(src).not.toContain('rounded-xl');
      expect(src).not.toContain('rounded-2xl');
    }
  });

  test('radius never animates', () => {
    for (const src of [panel, composer]) {
      expect(src).not.toMatch(/transition-\[[^\]]*border-radius/);
    }
  });
});
