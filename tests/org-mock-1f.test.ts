import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * Mock 1f (interaction rebrand handoff, artboard 1f): "/org — venture lens dims
 * crews smoothly, broadcast has send → replies states, pills expand on click".
 * The hierarchy markup stays frozen; what changes is the interaction layer —
 * worker pills become click-expandable controls, the broadcast Send becomes the
 * three-state async control, and every structural radius moves onto the
 * rebrand tokens. Radius never animates.
 */
describe('/org mock-1f: worker pills expand on click', () => {
  const pill = read('components/OrgWorkerPill.tsx');
  const page = read('app/org/page.tsx');

  test('the pill is a client component with an open state', () => {
    expect(pill.startsWith("'use client'")).toBe(true);
    expect(pill).toContain('useState');
    expect(pill).toContain('onClick');
  });

  test('radius goes 999 → 8px on open and is never in a transition', () => {
    expect(pill).toContain('rounded-full');
    expect(pill).toContain('rounded-md-t');
    // an explicit property list, never transition-all, and never radius
    expect(pill).not.toContain('transition-all');
    expect(pill).not.toMatch(/transition-\[[^\]]*border-radius/);
  });

  test('the expanded body reveals the role and the run / chat controls', () => {
    expect(pill).toContain('agent.role');
    expect(pill).toContain('animate-enter');
    expect(pill).toContain('▸ run');
    expect(pill).toContain('chat');
    // run hits the real agent route, chat navigates to the roster
    expect(pill).toContain('/api/agents/');
    expect(pill).toContain("method: 'POST'");
    expect(pill).toContain('/agents');
  });

  test('it is a lens row and its inner buttons are lens controls', () => {
    expect(pill).toContain('pressable is-row');
    expect(pill).toContain('data-lens="r"');
    expect(pill).toContain('AsyncButton');
  });

  test('the page renders the client pill instead of an inert div', () => {
    expect(page).toContain('OrgWorkerPill');
    expect(page).not.toContain('transition-opacity duration-base ease-os');
  });
});

describe('/org mock-1f: venture lens dims on opacity only', () => {
  const page = read('app/org/page.tsx');

  test('non-tagged crews go to opacity .2', () => {
    expect(page).toContain('opacity-20');
    expect(page).toContain('dimFor');
  });

  test('the venture switcher no longer hovers on a single property', () => {
    expect(page).not.toContain('transition-colors');
  });
});

describe('/org mock-1f: broadcast send has three states', () => {
  const card = read('components/ConductorCard.tsx');

  test('Send is the three-state AsyncButton, not a hand-rolled ellipsis', () => {
    expect(card).toContain('AsyncButton');
    expect(card).not.toContain("{sending ? '…' : 'Send'}");
  });

  test('the emblem still spins while the broadcast is in flight', () => {
    expect(card).toContain('thinking={sending}');
  });

  test('the reply count reads in the ok color', () => {
    expect(card).toContain('text-os-ok');
  });
});

describe('/org mock-1f: rebrand radius tokens', () => {
  const page = read('app/org/page.tsx');
  const card = read('components/ConductorCard.tsx');

  test('the premium-pass structural radii are gone from both surfaces', () => {
    for (const src of [page, card]) {
      expect(src).not.toContain('rounded-lg-t');
      expect(src).not.toContain('rounded-xl');
      expect(src).not.toContain('rounded-2xl');
    }
  });

  test('floating things use panel/tile and controls use ctl', () => {
    expect(page).toContain('rounded-panel');
    expect(page).toContain('rounded-ctl');
    expect(card).toContain('rounded-tile');
  });
});
