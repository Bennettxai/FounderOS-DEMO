import { describe, expect, test } from 'vitest';
import { screenTitleFor, describeFunnelContext } from '@/lib/screen-context';
import { systemPromptFor } from '@/lib/agents/chat';
import { realAgents } from '@/lib/agents/real';

describe('screenTitleFor', () => {
  test('maps known routes to their nav labels, query strings included', () => {
    expect(screenTitleFor('/funnel')).toBe('Funnel');
    expect(screenTitleFor('/funnel?venture=vantage&stage=nurtured')).toBe('Funnel');
    expect(screenTitleFor('/')).toBe('Home');
    expect(screenTitleFor('/brain')).toBe('G-Brain');
  });

  test('unknown paths fall back to the raw path', () => {
    expect(screenTitleFor('/nonexistent')).toBe('/nonexistent');
  });
});

describe('describeFunnelContext', () => {
  test('summarizes the live pipeline for the Conductor', () => {
    const text = describeFunnelContext({
      clients: 153,
      converted: 1,
      revenueUsd: 5000,
      stageCounts: [
        ['First touch', 40],
        ['Engaged', 80],
        ['Nurtured', 29],
        ['Opted in', 3],
        ['Converted', 1],
      ],
      archived: 1,
      sources: 'Attio 117 + GHL 57 (live)',
      decaying: 91,
      reddest: [
        { name: 'Liam Carter', days: 22 },
        { name: 'Marcus Webb', days: 25 },
      ],
    });
    expect(text).toContain('153 active leads');
    expect(text).toContain('Engaged: 80');
    expect(text).toContain('91 fading toward the 90-day archive');
    expect(text).toContain('Liam Carter (22d quiet)');
    expect(text).toContain('Attio 117 + GHL 57');
  });
});

describe('systemPromptFor with screen context', () => {
  const agent = realAgents[0];

  test('folds the screen context into the system prompt', () => {
    const prompt = systemPromptFor(agent, 'Screen: Funnel — 153 active leads.');
    expect(prompt).toContain('153 active leads');
    expect(prompt).toContain('currently looking at');
  });

  test('caps runaway context and stays identical without one', () => {
    const long = 'x'.repeat(10_000);
    expect(systemPromptFor(agent, long).length).toBeLessThan(6_000);
    expect(systemPromptFor(agent)).toBe(systemPromptFor(agent, undefined));
  });
});
