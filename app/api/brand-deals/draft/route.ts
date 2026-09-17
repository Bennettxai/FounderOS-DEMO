import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getBrandDeals, invalidateBrandDealsCache } from '@/lib/brand-deals';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ID = z.string().regex(/^r-?\d+$/);

async function gsendBin(): Promise<string> {
  const os = await import('node:os');
  return process.env.GSEND_BIN ?? `${os.homedir()}/bin/gsend`;
}

/** Read a pending draft's current body (for the GladOS edit flow). */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('id') ?? '';
  if (!ID.safeParse(id).success) {
    return NextResponse.json({ ok: false, error: 'bad id' }, { status: 400 });
  }
  const { execFile } = await import('node:child_process');
  const bin = await gsendBin();
  const result = await new Promise<{ ok: boolean; out: string }>((resolve) => {
    execFile(bin, ['draft-get', id], { timeout: 30_000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: (err ? stderr || String(err) : stdout).trim() });
    });
  });
  // Soft-fail like the connectors: a missing binary or vanished draft is an
  // honest {ok:false}, not a 5xx.
  if (!result.ok) return NextResponse.json({ ok: false, error: result.out });
  try {
    return NextResponse.json({ ok: true, draft: JSON.parse(result.out) });
  } catch {
    return NextResponse.json({ ok: false, error: 'unparseable draft' });
  }
}

/** Update a pending draft's body. gsend locks recipient/subject/thread to
 *  the existing draft in code — an edit can never redirect the email. */
export async function POST(req: Request) {
  let body: { dealId: string; text: string };
  try {
    body = z.object({ dealId: ID, text: z.string().min(1).max(20_000) }).parse(await req.json());
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 400 });
  }
  const { execFile } = await import('node:child_process');
  const bin = await gsendBin();
  const result = await new Promise<{ ok: boolean; out: string }>((resolve) => {
    const child = execFile(bin, ['draft-update', body.dealId], { timeout: 60_000 }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: (err ? stderr || String(err) : stdout).trim() });
    });
    child.stdin?.write(body.text);
    child.stdin?.end();
  });
  invalidateBrandDealsCache();
  if (!result.ok) return NextResponse.json({ ok: false, error: result.out }, { status: 502 });
  return NextResponse.json({ ok: true, snapshot: await getBrandDeals() });
}
