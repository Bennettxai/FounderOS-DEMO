import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const slack = readFileSync(join(process.cwd(), 'lib/connectors/slack.ts'), 'utf8');

/**
 * the operator reported "dummy data Slack channels". They were never dummy — the
 * feed asked Slack for the first 10 PUBLIC channels in Slack's own order and
 * dropped every private one, so an arbitrary slice of his workspace showed up
 * and the channels he cares about did not.
 */
describe('slack feed breadth', () => {
  test('no longer scans only ten public channels', () => {
    expect(slack).not.toMatch(/conversations\.list\(\{ limit: 10, exclude_archived: true, types: 'public_channel' \}\)/);
  });

  test('lists the workspace, private channels included', () => {
    expect(slack).toMatch(/types: 'public_channel,private_channel'/);
    expect(slack).toMatch(/limit: 200/);
  });

  test('ranks by recent activity so a busy workspace is not ordered by luck', () => {
    expect(slack).toMatch(/Number\(b\.updated \?\? 0\) - Number\(a\.updated \?\? 0\)/);
  });

  /**
   * 25 SEQUENTIAL history calls took /comms from 9.5s to ~28s on the host: the
   * Slack client backs off on the ~50/min tier and each wait stacked. Measured,
   * not theorised.
   */
  test('bounds the per-channel history calls against the rate tier', () => {
    expect(slack).toMatch(/MAX_HISTORY_CHANNELS = 12/);
    expect(slack).toMatch(/\.slice\(0, MAX_HISTORY_CHANNELS\)/);
  });

  test('fetches history concurrently, in waves, rather than one at a time', () => {
    expect(slack).toMatch(/HISTORY_CONCURRENCY = 6/);
    expect(slack).toMatch(/await Promise\.all\(\s*wave\.map/);
    // the sequential loop that caused the regression is gone
    expect(slack).not.toMatch(/for \(const channel of ranked\) \{\s*try \{\s*const history = await/);
  });

  test('the whole scan is cached, so a page view does not re-walk the workspace', () => {
    // must outlive the 15-minute sweep that refills it, same as email
    expect(slack).toMatch(/SLACK_CACHE_TTL_MS = 20 \* 60_000/);
    // >= not ===: a deeper cache answers a shallower request, never the reverse
    expect(slack).toMatch(/messageCache\.limit >= limit/);
    // an empty result is never cached
    expect(slack).toMatch(/if \(sorted\.length > 0\) messageCache =/);
  });

  test('still only reads channels the bot has joined', () => {
    // no scope grants access to a channel the bot is not in
    expect(slack).toMatch(/c\.is_member/);
  });

  test('one unreadable channel cannot blank the whole feed', () => {
    const body = slack.slice(slack.indexOf('wave.map'));
    expect(body).toMatch(/try \{/);
    expect(body).toMatch(/\} catch \{/);
  });
});
