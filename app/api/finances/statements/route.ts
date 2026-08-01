import { NextResponse } from 'next/server';
import { parseStatementCsv, categorize, type LedgerRow } from '@/lib/statements';
import { openLedger } from '@/lib/ledger';

export const dynamic = 'force-dynamic';

/** Accept an uploaded bank/CC statement CSV (multipart `file` field or a raw
    text/csv body), parse + categorize it, persist to the separate ledger store,
    and report what landed. Non-CSV / unparseable → 400, never a silent success. */
export async function POST(req: Request) {
  const ctype = req.headers.get('content-type') ?? '';
  let text: string | null = null;
  try {
    if (ctype.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file');
      if (file && typeof (file as { text?: unknown }).text === 'function') text = await (file as File).text();
    } else {
      text = await req.text();
    }
  } catch {
    text = null;
  }

  if (!text || text.trim() === '') {
    return NextResponse.json({ error: 'expected a CSV upload (file field or text/csv body)' }, { status: 400 });
  }

  const parsed = parseStatementCsv(text);
  if (parsed.length === 0) {
    return NextResponse.json(
      { error: 'no parseable rows — need Date, Description, and Amount (or Debit/Credit) columns' },
      { status: 400 },
    );
  }

  const rows: LedgerRow[] = parsed.map((r) => ({ ...r, category: categorize(r) }));
  const ledger = openLedger();
  try {
    const inserted = ledger.insertRows(rows);
    return NextResponse.json({ inserted, parsed: parsed.length, byCategory: ledger.monthly() });
  } finally {
    ledger.close();
  }
}
