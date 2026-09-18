import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';
import { LeadMagnetSchema } from '@/lib/schemas';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * Lead magnets (the operator, 2026-08-13): every Vercel landing page we ship lives
 * in the OS under Content, in a Notion-style list. This is the first step of
 * retiring Notion, so the row shape has to carry what Notion carried: status,
 * where it lives, what it captures, and where those leads land.
 */
let db: FounderDb;

beforeAll(() => {
  db = openDb(':memory:');
  seedDatabase(db);
});

describe('lead magnet rows', () => {
  test('every seeded row validates against the schema', () => {
    const rows = db.leadMagnets.all();
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(() => LeadMagnetSchema.parse(r)).not.toThrow();
  });

  test('the flagship stack page is in there, live, with its URL', () => {
    const stack = db.leadMagnets.all().find((r) => r.id === 'operator-stack');
    expect(stack).toBeDefined();
    expect(stack!.status).toBe('live');
    // the custom subdomain never got its DNS record, so the row must carry a
            // URL that actually resolves, not a dead one
            expect(stack!.url).toContain('stack.example.com');
    expect(stack!.captures).toBe('email');
    // where the leads actually land, so the list is not a dead directory
    expect(stack!.destination.toLowerCase()).toContain('newsletter');
  });

  test('rows sort newest first so the freshest drop leads the list', () => {
    const rows = db.leadMagnets.all();
    const dates = rows.map((r) => r.launchedAt);
    expect([...dates].sort((a, b) => b.localeCompare(a))).toEqual(dates);
  });

  test('insert + re-seed is idempotent by id', () => {
    const before = db.leadMagnets.all().length;
    seedDatabase(db);
    expect(db.leadMagnets.all().length).toBe(before);
  });
});

describe('GET /api/lead-magnets', () => {
  test('answers 200 with the rows', async () => {
    process.env.FOUNDER_OS_DB = ':memory:';
    const mod = await import('@/app/api/lead-magnets/route');
    const res = (await mod.GET()) as Response;
    expect(res.status).toBe(200);
    const body = (await res.json()) as { leadMagnets: unknown[] };
    expect(Array.isArray(body.leadMagnets)).toBe(true);
  });
});

describe('back-fill on existing databases', () => {
  test('getDb re-seeds when the lead_magnets table is empty', () => {
    // the operator's mini + Railway both carry databases created before this table
    // existed; without a clause here the list would render empty forever.
    const src = read('lib/data.ts');
    expect(src).toContain('instance.leadMagnets.all().length === 0');
  });
});

describe('the Content surface', () => {
  test('three equal top sections: Lead Magnets, Vantage Intel, My Analytics', () => {
    const page = read('app/content/page.tsx');
    expect(page).toContain('md:grid-cols-3');
    expect(page).toContain('Lead Magnets');
    expect(page).toContain('Vantage Intel');
    expect(page).toContain('My Analytics');
    // Vantage Intel wears the real brand mark, not a lucide glyph
    expect(page).toContain('mark="/vantage-mark.png"');
    // Lead Magnets opens the in-OS index
    expect(page).toContain('href="/content/lead-magnets"');
  });

  test('the Lead Magnets page lists the pages with copyable live links', () => {
    const page = read('app/content/lead-magnets/page.tsx');
    // the full page copies links AND manages rows (status, delete); the
    // dashboard card renders the same table without either
    expect(page).toMatch(/<LeadMagnets rows=\{rows\}[^>]*showCopy[^>]*\/>/);
    expect(page).toMatch(/<LeadMagnets rows=\{rows\}[^>]*manage[^>]*\/>/);
    expect(page).toContain('<NewLeadMagnet />');
    const list = read('components/LeadMagnets.tsx');
    // Notion-style: a database-like table with property columns, not cards
    for (const col of ['Name', 'Status', 'Captures', 'Leads to']) {
      expect(list).toContain(col);
    }
    // every row opens the real page
    expect(list).toContain('target="_blank"');
  });
});
