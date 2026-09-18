import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * Mock 1i (interaction rebrand handoff, artboard 1i): "Motion & interaction
 * spec — for globals.css / Tailwind". Every other mock in this handoff pins one
 * screen; 1i pins the whole surface, so this file is the acceptance sweep that
 * closes the rebrand.
 *
 * The artboard's Rules block, verbatim, is the checklist:
 *   1. Every clickable surface answers pointerdown within one frame.
 *   2. Hover changes TWO properties. "One property reads as a bug."
 *   3. Selection slides, never jumps: one indicator element, not per-tab state.
 *   4. Async is three states — idle → busy (spinner + elapsed) → done (✓ 1.4s).
 *   5. Radius never animates.
 *   6. Colour is status only: "green means succeeded, never selected."
 *   7. prefers-reduced-motion kills transforms, ripple and shimmer.
 */

/** Every .tsx under app/ and components/, as [path, source]. */
function sources(): [string, string][] {
  const out: [string, string][] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(join(process.cwd(), dir))) {
      const rel = `${dir}/${name}`;
      if (statSync(join(process.cwd(), rel)).isDirectory()) walk(rel);
      else if (name.endsWith('.tsx')) out.push([rel, read(rel)]);
    }
  };
  walk('app');
  walk('components');
  return out;
}

const ALL = sources();

describe('mock-1i rule 1: every clickable surface answers pointerdown', () => {
  const css = read('app/globals.css');

  test('the press sinks and shrinks on the press clock, not the lens clock', () => {
    const active = css.slice(css.indexOf('.pressable:active'), css.indexOf('.pressable[data-lens=\'r\']:active'));
    expect(active).toContain('transition-duration: var(--dur-press)');
    expect(active).toMatch(/transform: translateY\(1px\) scale\(0\.9[78]\)/);
  });

  test('the click ring is the mock\'s 3px white at 22%', () => {
    expect(css).toContain('box-shadow: 0 0 0 3px color-mix(in oklab, var(--text) 22%, transparent)');
  });

  test('a white fill sinks with an inset shadow instead of a ring alone', () => {
    expect(css).toContain('inset 0 2px 0 rgba(0, 0, 0, 0.18)');
  });
});

describe('mock-1i rule 2: hover changes two properties, never one', () => {
  test('no surface in the OS animates a single property on hover', () => {
    // Tailwind's transition-colors / transition-all are the one-property tell:
    // on a .pressable they also stomp the six-property lens transition.
    const offenders = ALL.filter(([, s]) => /transition-(colors|all)\b/.test(s)).map(([p]) => p);
    expect(offenders).toEqual([]);
  });

  test('the three replacements exist and each move at least two properties', () => {
    const css = read('app/globals.css');
    // a lens surface: transform + shadow + colour, already pinned elsewhere
    expect(css).toContain('.pressable {');
    // a child of a lens surface, easing on the parent's clock
    expect(css).toContain('.lens-child {');
    // a text link: the mock's "colour + nudge" pair
    expect(css).toContain('.linky {');
    const linky = css.slice(css.indexOf('.linky {'), css.indexOf('.state-fade {'));
    expect(linky).toContain('color:');
    expect(linky).toMatch(/transform: translateX\(1px\)/);
    // a state change (drag-over, focus, selection) at press speed
    expect(css).toContain('.state-fade {');
  });

  test('the lens child eases on the lens clock so an accent never lands early', () => {
    const css = read('app/globals.css');
    const child = css.slice(css.indexOf('.lens-child {'), css.indexOf('.linky {'));
    expect(child).toContain('var(--dur-lens) var(--ease-lens)');
    expect(child).toContain('color');
    expect(child).toContain('fill');
  });
});

describe('mock-1i rule 3: selection slides, it never jumps', () => {
  const tabs = read('components/SlidingTabs.tsx');

  test('one indicator element carries the selection for the whole strip', () => {
    expect(tabs).toContain('aria-hidden');
    expect(tabs).toMatch(/transform: `translateX\(\$\{i \* tabWidth\}px\)`/);
    expect(tabs).toContain('transition-transform');
    // the indicator is rendered once, outside the tab map
    expect(tabs.indexOf('translateX(')).toBeLessThan(tabs.indexOf('tabs.map'));
  });

  test('the tab strips of the OS are built on it, not on per-tab borders', () => {
    for (const p of ['components/CommsTabs.tsx', 'components/AgentsTabs.tsx']) {
      expect(read(p)).toContain('SlidingTabs');
    }
  });
});

describe('mock-1i rule 4: async is never silent', () => {
  const btn = read('components/AsyncButton.tsx');

  test('idle → busy → done → idle, with the mock\'s 1.4s hold', () => {
    expect(btn).toMatch(/'idle'\s*\|\s*'busy'\s*\|\s*'done'/);
    expect(btn).toContain('1400');
  });

  test('busy shows a spinner and the elapsed seconds', () => {
    expect(btn).toContain('om-spin');
    expect(btn).toMatch(/elapsed|secs/i);
  });

  test('done pops a ✓ in the ok token, and says so honestly when it failed', () => {
    expect(btn).toContain('✓');
    expect(btn).toContain('failed');
  });
});

describe('mock-1i rule 5: radius never animates', () => {
  test('nothing in the OS transitions border-radius', () => {
    const offenders = ALL.filter(([, s]) => /transition-\[[^\]]*border-radius/.test(s)).map(([p]) => p);
    expect(offenders).toEqual([]);
    expect(read('app/globals.css')).not.toMatch(/transition:[^;]*border-radius/);
  });
});

describe('mock-1i rule 6: colour is status only', () => {
  test('selection is a white fill or a white bar, never a status colour', () => {
    const tabs = read('components/SlidingTabs.tsx');
    expect(tabs).toContain('bg-os-text');
    expect(tabs).not.toMatch(/os-(ok|warn|err)/);
  });
});

describe('mock-1i rule 7: reduced motion', () => {
  const css = read('app/globals.css');
  const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));

  test('transforms and shadows come off every lens surface', () => {
    expect(block).toContain('transform: none !important');
    expect(block).toContain('box-shadow: none !important');
  });

  test('the spotlight and the shimmer stop', () => {
    expect(block).toContain('.spotlight');
    expect(block).toContain('.skeleton');
    expect(block).toContain('animation: none !important');
  });

  test('the text-link nudge comes off too, but its colour stays', () => {
    expect(block).toContain('.linky');
    // colour is never disabled: the mock keeps colour and opacity under reduced motion
    expect(block).not.toMatch(/color: none/);
  });
});

describe('mock-1i: the motion tokens ARE the pack\'s, and the note says so', () => {
  const css = read('app/globals.css');

  /**
   * There are no deviations. An earlier version of this suite asserted four,
   * because the 1i artboard prose ("sink 1px + scale .98 at 120ms, release at
   * 240ms") disagrees with the pack's own deliverable. The CSS the pack ships
   * (code/globals.additions.css), its README motion-token table and its
   * CHANGELOG all agree on the values below, so those are the spec and the
   * artboard prose reads as a stale description of an earlier pass.
   *
   * Transcribed here rather than read from the handoff directory, which is not
   * checked in: a test that depends on an untracked path is a test that fails
   * on a fresh clone.
   */
  const PACK_TOKENS: Record<string, string> = {
    '--ease-lens': 'cubic-bezier(0.22, 0.61, 0.36, 1)',
    '--ease-spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    '--dur-press': '200ms',
    '--dur': '360ms',
    '--dur-lens': 'calc(var(--dur) * 1.75)',
    '--dur-panel': '420ms',
    '--r-ctl': '6px',
    '--r-panel': '10px',
    '--r-tile': '12px',
  };

  test('every motion token still carries the handoff value', () => {
    for (const [token, want] of Object.entries(PACK_TOKENS)) {
      const got = new RegExp(`\\${token}:\\s*([^;]+);`).exec(css)?.[1]?.trim();
      expect(got, `${token} is missing from app/globals.css`).toBeTruthy();
      expect(got?.replace(/\s+/g, ' '), token).toBe(want);
    }
  });

  test('globals.css explains which half of the pack the code follows', () => {
    const note = css.slice(css.indexOf('Where the handoff pack disagrees with itself'));
    expect(note.length).toBeGreaterThan(0);
    expect(note).toContain('120ms');
    expect(note).toContain('--dur-press: 200ms');
    expect(note).toContain('Ripple stays');
  });

  test('the ripple the pack rejected is really absent, not half-built', () => {
    expect(css).not.toContain('@keyframes om-ripple');
    const offenders = ALL.filter(([, s]) => /useRipple/.test(s)).map(([p]) => p);
    expect(offenders).toEqual([]);
  });
});
