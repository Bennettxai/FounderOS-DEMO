import { describe, expect, test } from 'vitest';
import { claudeSessions, CLAUDE_SESSION_LIMIT } from '@/lib/oauth/claude-sessions';

/**
 * the operator, 2026-09-18: "I also want to be able to add multiple Claude Code
 * OAuth sessions at once, like two different sessions if possible."
 *
 * It is possible, on the OS side. Claude Code itself holds ONE logged-in
 * account per machine (one keychain entry, one `claude login`), so two
 * simultaneous CLI sessions on one box is not a thing the OS can grant. What
 * the OS can do, and what the /usage board already models with SeatUsage[], is
 * hold several Claude OAuth tokens at once and report each as its own seat
 * with its own real plan gauge. That is the useful half of the ask: seeing
 * both subscriptions' burn side by side.
 */
describe('multiple Claude OAuth sessions', () => {
  test('the bare token is session 1, keeping the existing env var working', () => {
    const s = claudeSessions({ CLAUDE_OAUTH_TOKEN: 'tok-a' });
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ index: 1, token: 'tok-a' });
    expect(s[0].label.length).toBeGreaterThan(0);
  });

  test('numbered tokens stack alongside it, in order', () => {
    const s = claudeSessions({
      CLAUDE_OAUTH_TOKEN: 'tok-a',
      CLAUDE_OAUTH_TOKEN_2: 'tok-b',
      CLAUDE_OAUTH_TOKEN_3: 'tok-c',
    });
    expect(s.map((x) => x.token)).toEqual(['tok-a', 'tok-b', 'tok-c']);
    expect(s.map((x) => x.index)).toEqual([1, 2, 3]);
  });

  test('a numbered session can start at 2 with no bare token', () => {
    const s = claudeSessions({ CLAUDE_OAUTH_TOKEN_2: 'only-b' });
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ index: 2, token: 'only-b' });
  });

  test('labels are per session and fall back to a stable name', () => {
    const s = claudeSessions({
      CLAUDE_OAUTH_TOKEN: 'a',
      CLAUDE_OAUTH_LABEL: 'Max personal',
      CLAUDE_OAUTH_TOKEN_2: 'b',
    });
    expect(s[0].label).toBe('Max personal');
    expect(s[1].label).toBe('Claude session 2');
  });

  test('each session gets a distinct seat id so the board can key on it', () => {
    const s = claudeSessions({ CLAUDE_OAUTH_TOKEN: 'a', CLAUDE_OAUTH_TOKEN_2: 'b' });
    expect(new Set(s.map((x) => x.id)).size).toBe(2);
  });

  test('blank and whitespace-only tokens are not sessions', () => {
    expect(claudeSessions({ CLAUDE_OAUTH_TOKEN: '', CLAUDE_OAUTH_TOKEN_2: '   ' })).toEqual([]);
    expect(claudeSessions({})).toEqual([]);
  });

  test('the scan stops at a documented ceiling rather than running forever', () => {
    const env: Record<string, string> = { CLAUDE_OAUTH_TOKEN: 'a' };
    for (let i = 2; i <= CLAUDE_SESSION_LIMIT + 3; i += 1) env[`CLAUDE_OAUTH_TOKEN_${i}`] = `t${i}`;
    expect(claudeSessions(env)).toHaveLength(CLAUDE_SESSION_LIMIT);
  });
});
