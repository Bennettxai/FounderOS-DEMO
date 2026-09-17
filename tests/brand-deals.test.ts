import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  assembleSnapshot,
  extractQuotedUsd,
  getBrandDeals,
  parseChain,
  parseLog,
  parsePendingList,
  parseRecipient,
} from '@/lib/brand-deals';
import { openDb } from '@/lib/db';

const FIX = path.join(process.cwd(), 'tests', 'fixtures', 'brand-deals');
const state = JSON.parse(readFileSync(path.join(FIX, 'state.json'), 'utf8'));
const logText = readFileSync(path.join(FIX, 'bdpilot.log'), 'utf8');
const listText = readFileSync(path.join(FIX, 'gsend-list.txt'), 'utf8');

describe('brand-deals parsers', () => {
  test('parseRecipient splits Name <email>', () => {
    expect(parseRecipient('Carter Ricket <carter@example.com>')).toEqual({
      name: 'Carter Ricket',
      email: 'carter@example.com',
    });
    expect(parseRecipient('bare@example.com').email).toBe('bare@example.com');
  });

  test('parsePendingList reads gsend list output, skips the trailer', () => {
    const rows = parsePendingList(listText);
    expect(rows).toHaveLength(8);
    expect(rows[0].id).toBe('r1001');
    expect(rows[0].subject).toContain('Sponsorship');
  });

  test('parseLog extracts recipients and chronological events', () => {
    const { recipients, events } = parseLog(logText);
    expect(recipients.get('r2001')).toContain('contact1@brand1.example');
    const kinds = new Set(events.map((e) => e.kind));
    expect(kinds.has('announced')).toBe(true);
    expect(kinds.has('sent')).toBe(true);
  });

  test('parseChain recovers messages from cached Telegram HTML', () => {
    const { chainLen, chain } = parseChain(state.chains['r1001']);
    expect(chainLen).toBe(42);
    expect(chain.length).toBeGreaterThan(10);
    expect(chain[0].who.length).toBeGreaterThan(0);
    expect(chain[0].body).not.toContain('&lt;');
    expect(chain[0].body).not.toContain('<blockquote');
  });
});

describe('brand-deals snapshot', () => {
  const snap = assembleSnapshot(state, logText, listText, {
    state: true,
    log: true,
    drafts: true,
  });

  test('stage derivation is honest to the data', () => {
    expect(snap.counts.approval).toBe(8);
    expect(snap.counts.sent).toBeGreaterThanOrEqual(15);
    expect(snap.counts.closed).toBe(0); // scanner not built — never faked
    const first = snap.deals.find((d) => d.id === 'r1001');
    expect(first?.stage).toBe('approval');
    expect(first?.brand).toBe('Jane Doe');
    // in done[] without a logged send line still counts as sent
    const doneOnly = snap.deals.find((d) => d.id === 'r3001');
    expect(doneOnly?.stage).toBe('sent');
  });

  test('tags surface UNIQUE deals with reasons', () => {
    expect(snap.counts.unique).toBeGreaterThanOrEqual(4);
    const unique = snap.deals.filter((d) => d.tag === 'UNIQUE');
    expect(unique.some((d) => d.tagReason.length > 0)).toBe(true);
  });

  test('pending deals carry summary + chain from the daemon caches', () => {
    const withSummary = snap.deals.filter((d) => d.stage === 'approval' && d.summary);
    expect(withSummary.length).toBe(8);
    const withChain = snap.deals.filter((d) => d.stage === 'approval' && d.chain.length > 0);
    expect(withChain.length).toBe(8);
  });

  test('recent events are newest-first and carry brand names', () => {
    expect(snap.events.length).toBeGreaterThan(5);
    for (let i = 1; i < snap.events.length; i++) {
      expect(snap.events[i - 1].at >= snap.events[i].at).toBe(true);
    }
    expect(snap.events.some((e) => e.brand && !e.brand.startsWith('r'))).toBe(true);
  });
});

describe('quote extraction', () => {
  const ours = (body: string) => ({ who: 'Operator', date: '1 May 2026 12:00', body });
  const theirs = (body: string) => ({ who: 'Jane <jane@brand.com>', date: '1 May 2026 11:00', body });

  test('reads k-form anchors from our last money message, taking the max', () => {
    expect(
      extractQuotedUsd([
        theirs('what are your rates?'),
        ours('We are at 6.5k for an organic Reel. A Reel plus Story package is 7.5k.'),
      ]),
    ).toBe(7500);
  });

  test('reads $-form amounts and ignores the brand side', () => {
    expect(
      extractQuotedUsd([ours('For that scope we are at $4,500 flat.'), theirs('our budget is $1,500')]),
    ).toBe(4500);
  });

  test('later quotes supersede earlier ones', () => {
    expect(
      extractQuotedUsd([ours('anchor is 25k'), theirs('too high'), ours('we can do 15k for the package')]),
    ).toBe(15000);
  });

  test('no money on our side means no quote — never invented', () => {
    expect(extractQuotedUsd([theirs('we pay $5,000 usually'), ours('what does the campaign look like?')])).toBeNull();
    expect(extractQuotedUsd([])).toBeNull();
  });

  test('rejects absurd figures (30 days, 200k views style noise)', () => {
    expect(extractQuotedUsd([ours('usage window is 30 days at 300k impressions, rate is 8.5k')])).toBe(8500);
  });
});

describe('outcome overrides + volume math', () => {
  test('won/lost move deals to closed and the dollars reconcile', () => {
    const snap = assembleSnapshot(
      state,
      logText,
      listText,
      { state: true, log: true, drafts: true },
      [
        { dealId: 'r1001', outcome: 'won', amountUsd: 12500 }, // a pending deal marked won
        { dealId: 'r2002', outcome: 'lost', amountUsd: 8500 }, // a sent deal marked lost
      ],
    );
    expect(snap.counts.won).toBe(1);
    expect(snap.counts.lost).toBe(1);
    expect(snap.counts.closed).toBe(2);
    expect(snap.counts.approval).toBe(7); // r1001 left the approval column
    const won = snap.deals.find((d) => d.id === 'r1001');
    expect(won?.stage).toBe('closed');
    expect(won?.quotedUsd).toBe(12500);
    expect(won?.quoteSource).toBe('manual');
    expect(snap.volume.wonUsd).toBe(12500);
    expect(snap.volume.lostUsd).toBe(8500);
    // the invariant the KPI card renders on:
    expect(snap.volume.openUsd).toBe(snap.volume.approvalUsd + snap.volume.awaitingUsd);
  });

  test('parsed quotes come from the cached chains and count toward open volume', () => {
    const snap = assembleSnapshot(state, logText, listText, { state: true, log: true, drafts: true });
    expect(snap.volume.quotedDeals).toBeGreaterThan(0);
    const quoted = snap.deals.filter((d) => d.quotedUsd != null && d.quoteSource === 'parsed');
    expect(quoted.length).toBe(snap.volume.quotedDeals);
    for (const d of quoted) {
      expect(d.quotedUsd!).toBeGreaterThanOrEqual(500);
      expect(d.quotedUsd!).toBeLessThanOrEqual(200_000);
    }
  });
});

describe('counterparty merge', () => {
  test('multiple announced drafts for one thread collapse to one deal — quotes count once', () => {
    const miniState = {
      announced: { r1: 1, r2: 2 },
      done: ['r1'],
      tags: { r2: ['UNIQUE', 'event ask'] },
      summaries: {},
      chains: {
        r1: [
          'Full chain, 2 messages, oldest first:\n\n<b>Jane</b>  <i>1 May 2026 10:00</i>\n<blockquote expandable>hi</blockquote>\n<b>Operator</b>  <i>1 May 2026 11:00</i>\n<blockquote expandable>rate is 8.5k</blockquote>\n',
        ],
      },
    };
    const log =
      '2026-08-18T10:00:00\tannounced r1 -> Jane <jane@brand.com>\n' +
      '2026-08-18T11:00:00\tsent r1\n' +
      '2026-08-19T09:00:00\tannounced r2 -> Jane <jane@brand.com>\n';
    const pendingList = 'r2\tJane <jane@brand.com>\tRe: collab\n\n1 draft(s).\n';
    const snap = assembleSnapshot(miniState as never, log, pendingList, { state: true, log: true, drafts: true });
    expect(snap.deals).toHaveLength(1);
    const d = snap.deals[0];
    expect(d.id).toBe('r2'); // the pending draft is canonical
    expect(d.stage).toBe('approval');
    expect(d.tag).toBe('UNIQUE'); // propagates across the merge
    expect(d.quotedUsd).toBe(8500); // parsed from the shared thread, once
    expect(snap.volume.openUsd).toBe(8500);
    expect(snap.counts.approval).toBe(1);
    expect(snap.counts.sent).toBe(0);
  });
});

describe('brand-deal override repo', () => {
  test('round-trips and upserts by deal id', () => {
    const db = openDb(':memory:');
    db.brandDeals.upsert({ dealId: 'r1', outcome: 'won', amountUsd: 9000, updatedAt: '2026-08-19T12:00:00.000Z' });
    expect(db.brandDeals.get('r1')?.outcome).toBe('won');
    db.brandDeals.upsert({ dealId: 'r1', outcome: 'open', amountUsd: null, updatedAt: '2026-08-19T13:00:00.000Z' });
    expect(db.brandDeals.get('r1')?.amountUsd).toBeNull();
    expect(db.brandDeals.all()).toHaveLength(1);
    db.close();
  });
});

describe('getBrandDeals loader', () => {
  test('uses env paths + injected exec, and never throws on a dead gsend', async () => {
    process.env.BDPILOT_STATE = path.join(FIX, 'state.json');
    process.env.BDPILOT_LOG = path.join(FIX, 'bdpilot.log');
    delete process.env.BDPILOT_LIST_FILE;
    const snap = await getBrandDeals(async () => ({ stdout: '', code: 1 }));
    expect(snap.sources.state).toBe(true);
    expect(snap.sources.drafts).toBe(false);
    expect(snap.counts.sent).toBeGreaterThan(0);
  });
});
