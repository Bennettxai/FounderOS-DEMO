import { afterEach, describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { ProposalSchema, type Proposal } from '@/lib/schemas';
import { PROPOSAL_BRANDS, groupDeliverables } from '@/lib/board-deliverables';
import type { Deliverable } from '@/lib/board-deliverables';

/**
 * Proposals belong in the Deliverables section, as Vantage and Launchpad
 * Cohort folders pinned above the agent files.
 *
 * They live in the DB rather than on disk because the OS runs on a host and
 * the proposal sources sit on a laptop — a filesystem scan would find nothing
 * in production, the same trap WhatsApp already fell into.
 */

let db: FounderDb;
afterEach(() => db?.close());

const PROPOSAL: Proposal = {
  id: 'vantage-demo',
  client: 'Demo Client',
  brand: 'vantage',
  url: 'https://vantage-proposal-demo.example.com',
  status: 'sent',
  amountUsd: null,
  notes: '',
  createdAt: '2026-08-12T00:00:00.000Z',
  origin: 'seed',
  accessCode: 'demo-code-02',
};

describe('ProposalSchema', () => {
  test('accepts a well-formed proposal', () => {
    expect(ProposalSchema.parse(PROPOSAL)).toEqual(PROPOSAL);
  });

  test('only knows the two real brands', () => {
    expect(PROPOSAL_BRANDS.map((b) => b.id)).toEqual(['vantage', 'launchpad-cohort']);
    expect(() => ProposalSchema.parse({ ...PROPOSAL, brand: 'acme' })).toThrow();
  });

  test('rejects a url that is not a url — the card is a link, so it must work', () => {
    expect(() => ProposalSchema.parse({ ...PROPOSAL, url: 'not-a-url' })).toThrow();
  });
});

describe('proposals repo', () => {
  test('round-trips, newest first', () => {
    db = openDb(':memory:');
    expect(db.proposals.all()).toEqual([]);

    db.proposals.insert(PROPOSAL);
    db.proposals.insert({ ...PROPOSAL, id: 'vantage-second', client: 'Second Client', createdAt: '2026-08-07T00:00:00.000Z' });

    const rows = db.proposals.all();
    expect(rows.map((p) => p.client)).toEqual(['Demo Client', 'Second Client']);
    expect(rows[0]).toEqual(PROPOSAL);
  });

  test('insert is idempotent on id, so a re-seed cannot duplicate', () => {
    db = openDb(':memory:');
    db.proposals.insert(PROPOSAL);
    db.proposals.insert(PROPOSAL);
    expect(db.proposals.all().length).toBe(1);
  });

  test("a proposal added through the OS survives a re-seed", () => {
    db = openDb(':memory:');
    db.proposals.insert({ ...PROPOSAL, id: 'os-added', client: 'Dana', origin: 'os' });
    db.proposals.insert(PROPOSAL);
    // the seed only ever removes rows it owns
    db.proposals.deleteSeededNotIn([PROPOSAL.id]);
    expect(db.proposals.all().map((p) => p.client).sort()).toEqual(['Dana', 'Demo Client']);
  });

  test('a stale seeded row is dropped when it leaves the seed', () => {
    db = openDb(':memory:');
    db.proposals.insert(PROPOSAL);
    db.proposals.insert({ ...PROPOSAL, id: 'gone', client: 'Retired' });
    db.proposals.deleteSeededNotIn([PROPOSAL.id]);
    expect(db.proposals.all().map((p) => p.id)).toEqual([PROPOSAL.id]);
  });
});

describe('groupDeliverables — proposal folders sit above the agent files', () => {
  const file: Deliverable = {
    id: 'ws1/report.pdf',
    name: 'report.pdf',
    workspace: 'ws1',
    title: 'report',
    summary: '',
    sizeBytes: 1024,
    modifiedAt: '2026-08-16T00:00:00.000Z',
  };

  test('proposal folders come first, in brand order, then Agent files', () => {
    const groups = groupDeliverables([file], [PROPOSAL, { ...PROPOSAL, id: 'aa-1', brand: 'launchpad-cohort', client: 'Jordan Ellery' }]);
    expect(groups.map((g) => g.name)).toEqual(['Vantage proposals', 'Launchpad Cohort proposals', 'Agent files']);
  });

  test('an empty brand folder is not shown — no hollow subfolders', () => {
    const groups = groupDeliverables([file], [PROPOSAL]);
    expect(groups.map((g) => g.name)).toEqual(['Vantage proposals', 'Agent files']);
  });

  test('the access code rides next to the client name', () => {
    const groups = groupDeliverables([file], [PROPOSAL]);
    expect(groups[0].items[0].accessCode).toBe('demo-code-02');
    // an agent file has no gate, so it has no code
    expect(groups[1].items[0].accessCode).toBe('');
  });

  test('proposals become openable link items, agent files stay downloads', () => {
    const groups = groupDeliverables([file], [PROPOSAL]);
    const proposal = groups[0].items[0];
    expect(proposal.url).toBe(PROPOSAL.url);
    expect(proposal.kind).toBe('link');
    expect(groups[1].items[0].kind).toBe('file');
    expect(groups[1].items[0].url).toBeNull();
  });

  test('with no proposals at all it degrades to exactly what it does today', () => {
    const groups = groupDeliverables([file], []);
    expect(groups.map((g) => g.name)).toEqual(['Agent files']);
  });

  test('an empty board still shows the proposal folders', () => {
    const groups = groupDeliverables([], [PROPOSAL]);
    expect(groups.map((g) => g.name)).toEqual(['Vantage proposals']);
  });
});

/**
 * The seed only runs when a guard clause trips. A new seeded table with no
 * clause of its own stays empty forever on any database that already exists —
 * which is every real install, including the host. That is not theoretical:
 * proposals shipped empty to the host for exactly this reason.
 */
describe('the seed guard back-fills proposals', () => {
  test('data.ts checks proposals, so an existing DB gets them', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../lib/data.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/instance\.proposals\.all\(\)\.length === 0/);
  });
});

/**
 * The empty-table guard is only half the problem. It fires when a table has NO
 * rows, so EDITING a seeded proposal ("put the full names
 * of the people that are getting proposals generated for them") would never
 * reach a database that already has the old row. Proposals therefore re-sync on
 * every boot, independent of the guard. That is safe here specifically because
 * the repo protects `origin: 'os'` rows, and cheap because there are a handful.
 */
describe('syncSeededProposals', () => {
  test('a seeded row that left the seed leaves the database with it', async () => {
    const { syncSeededProposals, SEEDED_PROPOSALS } = await import('@/lib/seed');
    db = openDb(':memory:');
    // this demo ships no seeded proposals, so a stale seed-origin row must be
    // pruned rather than outliving its removal from the file
    db.proposals.insert({ ...PROPOSAL, id: 'stale-seed', client: 'Stale Row', origin: 'seed' });

    syncSeededProposals(db);

    const ids = db.proposals.all().map((p) => p.id);
    expect(ids).not.toContain('stale-seed');
    for (const p of SEEDED_PROPOSALS) expect(ids).toContain(p.id);
  });

  test('every seeded proposal carries a full name, not just a first name', async () => {
    const { SEEDED_PROPOSALS } = await import('@/lib/seed');
    for (const p of SEEDED_PROPOSALS) {
      expect(p.client.trim().split(/\s+/).length).toBeGreaterThanOrEqual(2);
    }
  });

  /**
   * "put the passwords to the proposals next to the name
   * of each client for their proposal access". Every proposal ships behind a
   * StatiCrypt gate, and the code otherwise only exists on the laptop that built
   * the page. Without it in the OS the operator has to go find that laptop to
   * send a prospect their own link.
   */
  test('every seeded proposal carries the access code that opens it', async () => {
    const { SEEDED_PROPOSALS } = await import('@/lib/seed');
    for (const p of SEEDED_PROPOSALS) {
      expect(p.accessCode.length).toBeGreaterThan(0);
    }
  });

  test('the access code survives the round trip through SQLite', () => {
    db = openDb(':memory:');
    db.proposals.insert(PROPOSAL);
    expect(db.proposals.all()[0].accessCode).toBe('demo-code-02');
  });

  test('a database that predates the column still opens, and reads blank', async () => {
    const Database = (await import('better-sqlite3')).default;
    const raw = new Database(':memory:');
    // exactly the old shape, no access_code
    raw.exec(`CREATE TABLE proposals (
      id TEXT PRIMARY KEY, client TEXT NOT NULL, brand TEXT NOT NULL, url TEXT NOT NULL,
      status TEXT NOT NULL, amount_usd REAL, notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL, origin TEXT NOT NULL DEFAULT 'seed');
      INSERT INTO proposals VALUES ('old','Old Client','vantage','https://x.test','sent',
        NULL,'','2026-01-01T00:00:00.000Z','os');`);
    const { migrateProposalsTable } = await import('@/lib/db');
    migrateProposalsTable(raw);
    const row = raw.prepare('SELECT access_code FROM proposals WHERE id = ?').get('old') as {
      access_code: string;
    };
    expect(row.access_code).toBe('');
    raw.close();
  });

  test('a proposal added through the OS is not touched', async () => {
    const { syncSeededProposals } = await import('@/lib/seed');
    db = openDb(':memory:');
    db.proposals.insert({ ...PROPOSAL, id: 'os-added', client: 'Someone Else', origin: 'os' });
    syncSeededProposals(db);
    expect(db.proposals.all().find((p) => p.id === 'os-added')?.client).toBe('Someone Else');
  });

  test('data.ts runs it on every boot, outside the guard', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../lib/data.ts', import.meta.url), 'utf8');
    expect(src).toContain('syncSeededProposals(instance)');
    // it must sit AFTER the guard block, not inside it
    expect(src.indexOf('syncSeededProposals(instance)')).toBeGreaterThan(src.indexOf('seedDatabase(instance)'));
  });
});
