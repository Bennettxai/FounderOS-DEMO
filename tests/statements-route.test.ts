import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { POST } from '@/app/api/finances/statements/route';
import { openLedger } from '@/lib/ledger';

/**
 * The card-statement endpoint has to take all three card lanes, and has to take
 * a statement in whatever shape it arrives: a CSV export, a PDF, or text
 * already extracted from a PDF elsewhere (the host has no poppler).
 */

const CSV = ['Date,Description,Amount', '07/15/2026,CLOUDFLARE HOSTING,-57.00'].join('\n');

const CARD_TEXT = `
The Platinum Card
Closing Date 07/26/26
07/01/26   FIGMA SUBSCRIPTION    SAMPLE CITY XX       $200.00
07/04/26   CLOUDFLARE            SAMPLE CITY XX        $57.00
`;

let dbFile: string;

const post = (body: BodyInit, contentType?: string) =>
  POST(
    new Request('http://x/api/finances/statements', {
      method: 'POST',
      ...(contentType ? { headers: { 'Content-Type': contentType } } : {}),
      body,
    }),
  );

beforeEach(() => {
  dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-route-')), 'ledger.db');
  process.env.LEDGER_DB = dbFile;
});

afterEach(() => {
  delete process.env.LEDGER_DB;
  fs.rmSync(path.dirname(dbFile), { recursive: true, force: true });
});

describe('POST /api/finances/statements', () => {
  it('files a CSV upload under the card lane it was uploaded as', async () => {
    const form = new FormData();
    form.append('file', new File([CSV], 'vantage-july.csv', { type: 'text/csv' }));
    form.append('card', 'blue');
    const res = await post(form);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { inserted: number; card: string };
    expect(body).toMatchObject({ inserted: 1, card: 'blue' });

    const led = openLedger(dbFile);
    try {
      expect(led.rows(null)[0].card).toBe('blue');
    } finally {
      led.close();
    }
  });

  it('defaults to the Platinum lane when no card is given', async () => {
    const res = await post(CSV, 'text/csv');
    expect(res.status).toBe(200);
    expect((await res.json()).card).toBe('platinum');
  });

  it('parses extracted credit-card statement text (text/plain), no poppler needed', async () => {
    const res = await post(CARD_TEXT, 'text/plain');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { inserted: number; parsed: number };
    expect(body).toMatchObject({ inserted: 2, parsed: 2 });

    const led = openLedger(dbFile);
    try {
      expect(led.months()).toEqual(['2026-07']);
      expect(led.byCategory('2026-07')).toEqual([
        { category: 'Software', total: 200 },
        { category: 'Infrastructure', total: 57 },
      ]);
    } finally {
      led.close();
    }
  });

  it('takes the card lane from a query param too (text bodies have no form field)', async () => {
    const res = await POST(
      new Request('http://x/api/finances/statements?card=gold', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: CARD_TEXT,
      }),
    );
    expect(res.status).toBe(200);
    const led = openLedger(dbFile);
    try {
      expect(led.byCard(null)).toEqual([{ card: 'gold', total: 257 }]);
    } finally {
      led.close();
    }
  });

  it('re-uploading the same statement inserts nothing new', async () => {
    await post(CARD_TEXT, 'text/plain');
    const res = await post(CARD_TEXT, 'text/plain');
    expect((await res.json()).inserted).toBe(0);
  });

  it('400s on text with no parseable rows', async () => {
    const res = await post('just some notes', 'text/plain');
    expect(res.status).toBe(400);
  });
});

/**
 * the operator, 2026-08-26: the upload has to move the view to what he just sent.
 * The whole-ledger month list cannot say that (a back-dated statement is not
 * the newest month), so the route reports the months this upload covered.
 */
describe('POST /api/finances/statements reports what this upload covered', () => {
  it('names the months in the file, ascending, not the whole ledger', async () => {
    const seed = new FormData();
    seed.append('file', new File([CSV], 'july.csv', { type: 'text/csv' }));
    seed.append('card', 'platinum');
    await post(seed);

    const backdated = ['Date,Description,Amount', '03/02/2026,NOTION LABS,-10.00', '04/02/2026,NOTION LABS,-10.00'].join('\n');
    const form = new FormData();
    form.append('file', new File([backdated], 'march.csv', { type: 'text/csv' }));
    form.append('card', 'platinum');
    const body = (await (await post(form)).json()) as { uploadedMonths: string[]; months: string[] };

    expect(body.uploadedMonths).toEqual(['2026-03', '2026-04']);
    expect(body.months).toEqual(['2026-03', '2026-04', '2026-07']);
  });
});
