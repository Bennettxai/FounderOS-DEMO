import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { POST } from '@/app/api/finances/bank-statement/route';
import { openBankStore } from '@/lib/bank';

/**
 * The bank-statement endpoint must accept ALREADY-EXTRACTED statement text,
 * not just a PDF. Hosts without poppler (the dedicated host) can never run
 * pdftotext, so text/plain is the path that lets a statement land there:
 * extract on a machine that has poppler, POST the text.
 */

const STATEMENT_TEXT = `
  Account Name: Vantage LLC
  Account Ending: *7002
  Statement Date: 04/30/2026
  Total Credits This Period      $12,500.00
  Total Debits This Period       $4,250.00
`;

let dbFile: string;

beforeEach(() => {
  dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bank-route-')), 'bank.db');
  process.env.BANK_DB = dbFile;
});

afterEach(() => {
  delete process.env.BANK_DB;
  fs.rmSync(path.dirname(dbFile), { recursive: true, force: true });
});

describe('POST /api/finances/bank-statement', () => {
  it('accepts extracted text (text/plain) and stores the summary', async () => {
    const res = await POST(
      new Request('http://x/api/finances/bank-statement', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: STATEMENT_TEXT,
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { summary: { business: string; month: string; creditsCents: number } };
    expect(body.summary.business).toBe('Vantage LLC');
    expect(body.summary.month).toBe('2026-04');
    expect(body.summary.creditsCents).toBe(1250000);

    const store = openBankStore(dbFile);
    try {
      expect(store.all().map((s) => s.account)).toEqual(['7002']);
    } finally {
      store.close();
    }
  });

  it('400s on text that is not a recognizable statement', async () => {
    const res = await POST(
      new Request('http://x/api/finances/bank-statement', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: 'just some notes, not a statement',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('400s on an empty text body', async () => {
    const res = await POST(
      new Request('http://x/api/finances/bank-statement', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: '   ',
      }),
    );
    expect(res.status).toBe(400);
  });
});
