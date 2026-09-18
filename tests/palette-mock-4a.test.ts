import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * Mocks 4a and 4b (interaction rebrand handoff): the ⌘K palette and the toast
 * stack. Both shipped whole in the step-8 pass; what this file pins is the
 * artboard fidelity the sweep is closing, so a later edit cannot quietly walk
 * the palette back off the mock.
 */
describe('⌘K palette mock-4a: the card', () => {
  const p = read('components/CommandPalette.tsx');

  test('560px, 56px from the top, tile radius, the mock shadow, om-pal entry', () => {
    expect(p).toContain('w-[560px]');
    expect(p).toContain('top-14');
    expect(p).toContain('rounded-tile');
    expect(p).toContain('shadow-[0_24px_60px_rgba(0,0,0,.75)]');
    expect(p).toContain('animate-[om-pal_.38s_cubic-bezier(.22,.61,.36,1)_both]');
    expect(read('app/globals.css')).toContain('@keyframes om-pal');
  });

  test('the card carries the spotlight, the overlay fades in', () => {
    expect(p).toContain('data-spot');
    expect(p).toContain('bg-os-bg/55');
  });

  test('the prompt line names what you can actually type', () => {
    expect(p).toContain('placeholder="Jump, run, ask… (type an agent name, a route, or a question)"');
    expect(p).toContain('<kbd className="kbd">esc</kbd>');
  });

  test('the scope row is divided by the hairline, not a structural rule', () => {
    const chips = p.slice(p.indexOf("['All', 'Go to', 'Run', 'Ask']") - 260, p.indexOf("['All', 'Go to', 'Run', 'Ask']"));
    expect(chips).toContain('border-b border-os-hairline');
    expect(p).toContain('results');
  });
});

describe('⌘K palette mock-4a: the rows', () => {
  const p = read('components/CommandPalette.tsx');
  const list = p.slice(p.indexOf('max-h-[330px]'));

  test('the list is capped and each row is a lens row on the control radius', () => {
    expect(p).toContain('max-h-[330px]');
    expect(list).toContain('data-lens="r"');
    expect(list).toContain('pressable is-row');
    expect(list).toContain('rounded-ctl');
    expect(list).toContain('rounded-[5px]');
  });

  test('rows arrive with the om-in entry the mock gives them', () => {
    const row = list.slice(list.indexOf('data-lens="r"'), list.indexOf('r.glyph'));
    expect(row).toContain('animate-enter');
  });

  test('the empty state arrives the same way and offers the Conductor', () => {
    const empty = list.slice(list.indexOf('rows.length === 0'), list.indexOf('border-t border-os-border'));
    expect(empty).toContain('animate-enter');
    expect(empty).toContain('press ↵ to ask the Conductor instead');
  });

  test('the footer LED blinks on the 2.6s step, next to the listening line', () => {
    expect(p).toContain('animate-blink');
    expect(p).toContain('Conductor listening');
    expect(read('tailwind.config.ts')).toContain("blink: 'om-blink 2.6s steps(1) infinite'");
  });
});

describe('⌘K palette mock-4a: rebrand hygiene', () => {
  const p = read('components/CommandPalette.tsx');

  test('no premium-pass or default radii, and radius never animates', () => {
    expect(p).not.toContain('rounded-sm-t');
    expect(p).not.toContain('rounded-lg-t');
    expect(p).not.toMatch(/rounded-md(?!-t)/);
    expect(p).not.toContain('rounded-xl');
    expect(p).not.toMatch(/transition-\[[^\]]*border-radius/);
  });

  test('no hover changes only one property', () => {
    expect(p).not.toContain('transition-colors');
    expect(p).not.toContain('transition-all');
  });
});

describe('toasts mock-4b: the stack', () => {
  const t = read('components/Toaster.tsx');

  test('bottom-right, newest on top, 300px wide', () => {
    expect(t).toContain('bottom-4 right-4');
    expect(t).toContain('flex-col-reverse');
    expect(t).toContain('w-[300px]');
  });

  test('each toast is a lens row on the panel radius', () => {
    expect(t).toContain('data-lens="r"');
    expect(t).toContain('pressable');
    expect(t).toContain('rounded-panel');
    expect(t).toContain('animate-enter');
  });

  test('busy spins, the settled glyph pops', () => {
    expect(t).toContain('animate-[om-spin_.8s_linear_infinite]');
    expect(t).toContain('animate-pop');
    expect(read('app/globals.css')).toContain('@keyframes om-spin');
  });

  test('errors stay, everything else runs a 2.6s clock, hover holds it', () => {
    expect(t).toContain("kind === 'err' ? Infinity : 2600");
    expect(t).toContain('onMouseEnter');
    expect(t).toContain('onMouseLeave');
  });

  test('the 1px underline IS the timer', () => {
    expect(t).toContain('origin-left');
    expect(t).toMatch(/transform: `scaleX\(/);
    expect(t).toContain('transition-transform duration-200 ease-linear');
  });

  test('destructive results carry undo, every toast can be closed', () => {
    expect(t).toContain('undo');
    expect(t).toContain('api.close(t.id)');
  });
});
