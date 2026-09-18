import { NextResponse } from 'next/server';
import { parseStatementCsv, parseCardStatementText, categorize, type LedgerRow } from '@/lib/statements';
import { normalizeCardId, type CardId } from '@/lib/cards';
import { pdfToText } from '@/lib/pdf-text';
import { openLedger } from '@/lib/ledger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** CSV first (an export), then the line-oriented reader for PDF-extracted
    statement text. Whichever finds rows wins; neither guesses. */
function parseAny(text: string) {
  const csv = parseStatementCsv(text);
  return csv.length > 0 ? csv : parseCardStatementText(text);
}

/**
 * Accept an uploaded credit-card / bank statement and file it under one of the
 * three card lanes (`card` form field or `?card=`, default Platinum).
 * Three shapes, because a statement arrives in whatever form the issuer gives:
 *   - a CSV export (multipart `file` or a text/csv body)
 *   - a PDF (multipart `file` or a raw body) — extracted here via poppler
 *   - already-extracted text (`text/plain`), the only path that works on a
 *     host without poppler installed (the dedicated host)
 * Rows are categorized, then persisted to the separate ledger store. Ingestion
 * is idempotent, so re-uploading a statement inserts nothing new.
 */
export async function POST(req: Request) {
  const ctype = req.headers.get('content-type') ?? '';
  const queryCard = new URL(req.url).searchParams.get('card');
  let card: CardId = normalizeCardId(queryCard);
  let text: string | null = null;

  try {
    if (ctype.includes('multipart/form-data')) {
      const form = await req.formData();
      const field = form.get('card');
      if (typeof field === 'string' && field !== '') card = normalizeCardId(field);
      const file = form.get('file');
      if (file && typeof (file as { arrayBuffer?: unknown }).arrayBuffer === 'function') {
        const f = file as File;
        const isPdf = /\.pdf$/i.test(f.name) || f.type === 'application/pdf';
        text = isPdf ? await pdfToText(Buffer.from(await f.arrayBuffer())) : await f.text();
      }
    } else if (ctype.includes('application/pdf')) {
      text = await pdfToText(Buffer.from(await req.arrayBuffer()));
    } else {
      text = await req.text();
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'could not read upload' }, { status: 400 });
  }

  if (!text || text.trim() === '') {
    return NextResponse.json({ error: 'expected a statement (CSV, PDF, or extracted text)' }, { status: 400 });
  }

  const parsed = parseAny(text);
  if (parsed.length === 0) {
    return NextResponse.json(
      { error: 'no parseable rows — need a CSV with Date/Description/Amount columns, or statement text with dated charge lines' },
      { status: 400 },
    );
  }

  const rows: LedgerRow[] = parsed.map((r) => ({ ...r, category: categorize(r), card }));
  // The months this file covered, which is not the same as the newest month in
  // the ledger — a back-dated statement is the data he just submitted too, and
  // the page moves the view to it.
  const uploadedMonths = [...new Set(rows.map((r) => r.date.slice(0, 7)))].sort();
  const ledger = openLedger();
  try {
    const inserted = ledger.insertRows(rows);
    return NextResponse.json({
      inserted,
      parsed: parsed.length,
      card,
      uploadedMonths,
      months: ledger.monthsAscending(),
      byCategory: ledger.monthly(),
    });
  } finally {
    ledger.close();
  }
}
