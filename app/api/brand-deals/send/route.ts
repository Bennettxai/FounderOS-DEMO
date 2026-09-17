import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getBrandDeals, invalidateBrandDealsCache } from '@/lib/brand-deals';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Approve a pending draft from GladOS: same verified gsend path as the
 *  Telegram tap. Gmail deletes the draft on send, so a send is atomic —
 *  a later Telegram tap on the same deal fails harmlessly. */
export async function POST(req: Request) {
  let dealId: string;
  try {
    ({ dealId } = z.object({ dealId: z.string().regex(/^r-?\d+$/) }).parse(await req.json()));
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 400 });
  }
  const { execFile } = await import('node:child_process');
  const os = await import('node:os');
  const gsend = process.env.GSEND_BIN ?? `${os.homedir()}/bin/gsend`;
  const result = await new Promise<{ ok: boolean; out: string }>((resolve) => {
    execFile(gsend, ['send', dealId], { timeout: 60_000 }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: (err ? stderr || String(err) : stdout).trim() });
    });
  });
  invalidateBrandDealsCache();
  if (!result.ok) return NextResponse.json({ ok: false, error: result.out }, { status: 502 });
  return NextResponse.json({ ok: true, detail: result.out, snapshot: await getBrandDeals() });
}
