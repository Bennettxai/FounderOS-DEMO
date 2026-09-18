import { NextResponse } from 'next/server';
import { parseBankStatementSummary } from '@/lib/bank-statements';
import { pdfToText } from '@/lib/pdf-text';
import { openBankStore } from '@/lib/bank';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Accept a bank statement, extract its summary (income/outflow per business
    per month), and upsert it into the bank store. Idempotent by account+month.
    Two shapes: a PDF (extracted here via poppler) or already-extracted text
    (`text/plain`), which is the only path that works on a host without
    poppler installed. */
export async function POST(req: Request) {
  const ctype = req.headers.get('content-type') ?? '';
  let text: string;

  if (ctype.includes('text/plain')) {
    const body = await req.text().catch(() => '');
    if (body.trim() === '') {
      return NextResponse.json({ error: 'expected statement text (text/plain body)' }, { status: 400 });
    }
    text = body;
  } else {
    let buf: Buffer | null = null;
    try {
      if (ctype.includes('multipart/form-data')) {
        const file = (await req.formData()).get('file');
        if (file && typeof (file as { arrayBuffer?: unknown }).arrayBuffer === 'function') {
          buf = Buffer.from(await (file as File).arrayBuffer());
        }
      } else {
        buf = Buffer.from(await req.arrayBuffer());
      }
    } catch {
      buf = null;
    }
    if (!buf || buf.length === 0) {
      return NextResponse.json(
        { error: 'expected a PDF upload (file field or PDF body), or extracted text as text/plain' },
        { status: 400 },
      );
    }
    try {
      text = await pdfToText(buf);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
  }

  const summary = parseBankStatementSummary(text);
  if (!summary) {
    return NextResponse.json({ error: 'not a recognizable bank statement summary' }, { status: 400 });
  }

  const store = openBankStore();
  try {
    store.upsert(summary);
  } finally {
    store.close();
  }
  return NextResponse.json({ summary });
}
