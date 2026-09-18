/**
 * Several Claude OAuth tokens at once, each reported as its own seat.
 *
 * Claude Code logs in ONE account per machine, so "two simultaneous CLI
 * sessions" is not something the OS can hand out. What it can do is hold more
 * than one Claude OAuth token and read each subscription's real plan gauge
 * from `https://api.anthropic.com/api/oauth/usage`, which is what the /usage
 * board wants: both subscriptions' burn side by side instead of one.
 *
 *   CLAUDE_OAUTH_TOKEN     + CLAUDE_OAUTH_LABEL      -> session 1
 *   CLAUDE_OAUTH_TOKEN_2   + CLAUDE_OAUTH_LABEL_2    -> session 2
 *   ...
 *
 * The bare name stays session 1 so the single-token setup that already exists
 * keeps working untouched.
 */

/** Scanning stops here: a ceiling beats an unbounded loop over the env. */
export const CLAUDE_SESSION_LIMIT = 8;

export type ClaudeSession = {
  index: number;
  id: string;
  label: string;
  token: string;
};

const clean = (v: string | undefined): string => (typeof v === 'string' ? v.trim() : '');

export function claudeSessions(env: Record<string, string | undefined> = process.env): ClaudeSession[] {
  const out: ClaudeSession[] = [];
  for (let i = 1; out.length < CLAUDE_SESSION_LIMIT && i <= CLAUDE_SESSION_LIMIT + 4; i += 1) {
    const suffix = i === 1 ? '' : `_${i}`;
    const token = clean(env[`CLAUDE_OAUTH_TOKEN${suffix}`]);
    if (!token) continue;
    const label = clean(env[`CLAUDE_OAUTH_LABEL${suffix}`]) || (i === 1 ? 'Claude session 1' : `Claude session ${i}`);
    out.push({ index: i, id: `claude-oauth-${i}`, label, token });
  }
  return out;
}
