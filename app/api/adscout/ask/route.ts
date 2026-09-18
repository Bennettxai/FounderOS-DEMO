import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adStore } from '@/lib/foreplay/store';
import { storeWall } from '@/lib/foreplay/wall';
import { extractReplyText, runClaude } from '@/app/api/workflows/draft/logic';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Ask Adscout: grounds a question in the synced store (winners, hooks,
 * drivers, signals) and answers via the local Claude CLI. Reads only local
 * snapshots: zero Foreplay credits per question. Honest 503 when the CLI
 * isn't available.
 */

const AskSchema = z.object({ question: z.string().min(3).max(600) });

export async function POST(request: Request) {
  const parsed = AskSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'a question (3-600 chars) is required' }, { status: 400 });
  }

  const wall = storeWall(30).map((w) => ({
    brand: w.brand,
    hook: w.hook,
    daysRunning: w.daysRunning,
    live: w.live,
    format: w.format,
    topDrivers: Object.entries(w.drivers)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, v]) => `${k}:${v}`),
  }));
  const signals = adStore.readSignals().slice(0, 25).map((s) => s.message);

  if (wall.length === 0 && signals.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'The ad store is empty: add brands to the watchlist and sync first.' },
      { status: 409 },
    );
  }

  const prompt = [
    "You are Adscout, the user's ad-intelligence analyst. Answer from the DATA below: competitor ads tracked via Foreplay.",
    'Rules: days-running-while-live is the only spend proxy (no engagement/spend numbers exist: never invent any).',
    'Be direct and specific; cite brands and hooks from the data. 120 words max. Plain text, no markdown.',
    '',
    `DATA: tracked ads (longevity-ranked): ${JSON.stringify(wall)}`,
    `DATA: recent signals: ${JSON.stringify(signals)}`,
    '',
    `QUESTION: ${parsed.data.question}`,
  ].join('\n');

  const res = await runClaude(prompt);
  if (!res.ok) {
    return NextResponse.json(
      { ok: false, unavailable: res.unavailable, error: res.unavailable ? 'Analyst unavailable' : res.error },
      { status: res.unavailable ? 503 : 502 },
    );
  }
  return NextResponse.json({ ok: true, answer: extractReplyText(res.stdout) });
}
