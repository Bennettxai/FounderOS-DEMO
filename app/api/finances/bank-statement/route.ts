import { NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import { parseBankStatementSummary } from '@/lib/bank-statements';
import { openBankStore } from '@/lib/bank';
import { requireSession } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Reject anything larger than this before spawning pdftotext on it.
const MAX_PDF_BYTES = 15 * 1024 * 1024;
// PDFs begin with "%PDF-" — content-sniff so we never hand a non-PDF (or a
// disguised payload) to the external extractor.
function looksLikePdf(buf: Buffer): boolean {
  return buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-';
}

// Extract text from a PDF via the system `pdftotext` (poppler). Tries PATH then
// common Homebrew/usr-local locations; -layout keeps the summary columns aligned.
function pdfToText(buf: Buffer): Promise<string> {
  const candidates = ['pdftotext', '/opt/homebrew/bin/pdftotext', '/usr/local/bin/pdftotext'];
  return new Promise((resolve, reject) => {
    const tryRun = (i: number) => {
      if (i >= candidates.length) return reject(new Error('pdftotext not installed (brew install poppler)'));
      const child = execFile(
        candidates[i],
        ['-layout', '-', '-'],
        { maxBuffer: 25 * 1024 * 1024, encoding: 'utf8' },
        (err, stdout) => {
          if (err && (err as NodeJS.ErrnoException).code === 'ENOENT') return tryRun(i + 1);
          if (err) return reject(err);
          resolve(stdout);
        },
      );
      child.stdin?.end(buf);
    };
    tryRun(0);
  });
}

/** Accept a bank-statement PDF, extract its summary (income/outflow per business
    per month), and upsert it into the bank store. Idempotent by account+month. */
export async function POST(req: Request) {
  const gate = requireSession(req);
  if (gate) return gate;

  const ctype = req.headers.get('content-type') ?? '';
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
    return NextResponse.json({ error: 'expected a PDF upload (file field or PDF body)' }, { status: 400 });
  }
  if (buf.length > MAX_PDF_BYTES) {
    return NextResponse.json({ error: 'PDF too large (max 15 MB)' }, { status: 413 });
  }
  if (!looksLikePdf(buf)) {
    return NextResponse.json({ error: 'not a PDF' }, { status: 400 });
  }

  let text: string;
  try {
    text = await pdfToText(buf);
  } catch (e) {
    // Generic to the client; extractor detail (paths, stderr) stays server-side.
    console.error('pdftotext failed', e);
    return NextResponse.json({ error: 'failed to read the PDF' }, { status: 500 });
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
