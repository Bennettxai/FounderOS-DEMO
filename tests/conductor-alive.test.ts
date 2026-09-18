import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * the operator, 2026-08-10: talking to agents "feels kind of dead". Every chat
 * surface now shows the Claude-Code-style Synthesizing readout (spinner +
 * cycling verb + shimmer + elapsed seconds) while a run is out, the Conductor
 * card is rounded, and it rides a sticky rail on /agents instead of living
 * below the fold.
 */
describe('Synthesizing — the shared liveness readout', () => {
  test('spinner frames, cycling verbs, elapsed seconds, shimmer class', () => {
    const src = read('components/Synthesizing.tsx');
    expect(src).toContain("'⠋'");
    expect(src).toContain('Synthesizing');
    expect(src).toContain('synth-shimmer');
    expect(src).toContain('since');
  });

  test('the shimmer sweep exists in globals.css', () => {
    const css = read('app/globals.css');
    expect(css).toContain('.synth-shimmer');
    expect(css).toContain('@keyframes synth-sweep');
  });

  test('both Conductor surfaces use it while a reply is pending', () => {
    expect(read('components/ConductorChat.tsx')).toContain('<Synthesizing since={awaitingSinceRef.current}');
    const panel = read('components/ConductorPanel.tsx');
    expect(panel).toContain('Synthesizing');
    expect(panel).toContain('(sending || awaiting)');
  });
});

describe('the side panel chat no longer blocks or goes deaf', () => {
  test('panel polls continuously while open instead of an inline wait loop', () => {
    const panel = read('components/ConductorPanel.tsx');
    expect(panel).toContain('setInterval');
    expect(panel).not.toContain('for (;;)');
    // typing stays usable while the CEO run is out — the shared composer's
    // textarea carries no disabled attribute
    expect(read('components/ConductorComposer.tsx')).not.toMatch(/<textarea[^>]*disabled/s);
  });
});

describe('the shared Conductor composer carries the Claude-bar capabilities', () => {
  const composer = read('components/ConductorComposer.tsx');

  test('multiline textarea, Enter sends, Shift+Enter stays', () => {
    expect(composer).toContain('<textarea');
    expect(composer).toContain('!e.shiftKey');
  });

  test('attach a text file — contents ride into the message, honestly labeled', () => {
    expect(composer).toContain('[Attached: ');
    expect(composer).toContain("accept=\".txt,.md,.csv,.json,.log\"");
  });

  test('mic dictation + read-aloud are real browser APIs, not demo', () => {
    expect(composer).toContain('SpeechRecognition');
    expect(composer).toContain('speechSynthesis');
    expect(composer).toContain('Voice input is not available in this browser.');
  });

  test('BOTH Conductor surfaces mount the same composer (chat + side panel)', () => {
    expect(read('components/ConductorChat.tsx')).toContain('<ConductorComposer');
    expect(read('components/ConductorPanel.tsx')).toContain('<ConductorComposer');
  });

  test('the model chip shows the live Conductor seat model from the board', () => {
    expect(read('components/ConductorChat.tsx')).toContain('model = null');
    expect(read('app/agents/page.tsx')).toContain("a.name === 'Conductor'");
  });
});

describe('/agents Conductor placement + shape', () => {
  test('rounded card, no more boxy', () => {
    expect(read('components/ConductorChat.tsx')).toContain('rounded-2xl');
  });

  test('full-height cockpit: both panels stretch to the viewport, no page scroll', () => {
    const page = read('app/agents/page.tsx');
    expect(page).toContain('xl:h-[calc(100dvh');
    expect(page).toContain('xl:grid-cols-[minmax(0,1fr)_400px]');
    expect(page).toContain('order-1'); // Conductor rides on top on narrow screens
    // panels scroll INSIDE, the page does not
    expect(read('components/BoardLive.tsx')).toContain('flex h-full min-h-0 flex-col');
    expect(read('components/ConductorChat.tsx')).toContain('flex h-full min-h-0 flex-col');
  });
});
