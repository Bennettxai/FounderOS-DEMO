import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

const toaster = readFileSync('components/Toaster.tsx', 'utf8');
const palette = readFileSync('components/CommandPalette.tsx', 'utf8');
const layout = readFileSync('app/layout.tsx', 'utf8');
const globals = readFileSync('app/globals.css', 'utf8');
const pane = readFileSync('components/CommsThreePane.tsx', 'utf8');

describe('Toaster (interaction rebrand step 8)', () => {
  test('exposes the full toast api: ok / warn / err / busy / update / close', () => {
    expect(toaster).toContain('export function Toaster');
    expect(toaster).toContain('useToast');
    for (const k of ['ok:', 'warn:', 'err:', 'busy:', 'update:', 'close:']) expect(toaster).toContain(k);
  });

  test('errors stay until dismissed; hover pauses the clock', () => {
    expect(toaster).toContain('Infinity');
    expect(toaster).toContain('onMouseEnter');
    expect(toaster).toMatch(/held/);
  });

  test('status colors come from the theme tokens, not hardcoded hex', () => {
    expect(toaster).toContain('var(--ok)');
    expect(toaster).toContain('var(--err)');
    expect(toaster).not.toMatch(/#2fd36f|#ff2d3f|#ffb000/i);
  });

  test('the app is wrapped in the provider once, in the root layout', () => {
    expect(layout).toMatch(/from ['"]@\/components\/Toaster['"]/);
    expect(layout).toContain('<Toaster>');
  });
});

describe('CommandPalette rebuild (step 8)', () => {
  test('grouped one-box: Go to / Run / Ask with Tab scope cycling', () => {
    expect(palette).toContain("'Go to'");
    expect(palette).toContain("'Run'");
    expect(palette).toContain("'Ask'");
    expect(palette).toContain("'Tab'");
  });

  test('Run fires the real agent run endpoint with a busy toast', () => {
    expect(palette).toContain('/api/agents/');
    expect(palette).toContain('/run');
    expect(palette).toContain('useToast');
    expect(palette).toMatch(/busy\(/);
  });

  test('Ask and no-match Enter go to the real Conductor chat endpoint', () => {
    expect(palette).toContain("'/api/conductor/chat'");
  });

  test('keeps the pre-rebuild behaviors: ⌘K, Topbar event, digit jumps, typing guard', () => {
    expect(palette).toContain("'alex:palette'");
    expect(palette).toContain('DIGIT_VIEWS');
    expect(palette).toMatch(/metaKey/);
    expect(palette).toMatch(/isTyping|isContentEditable/);
  });

  test('external links still open in a new tab', () => {
    expect(palette).toMatch(/window\.open/);
  });
});

describe('palette + kbd css lands in globals', () => {
  test('om-pal entry animation and .kbd chip exist', () => {
    expect(globals).toContain('@keyframes om-pal');
    expect(globals).toMatch(/\.kbd\s*\{/);
  });
});

describe('CommsThreePane uses the shared toaster', () => {
  test('no more local toast state; undo rides the shared api', () => {
    expect(pane).toMatch(/useToast/);
    expect(pane).not.toMatch(/type Toast =/);
    expect(pane).not.toMatch(/setToast\(/);
  });
});
