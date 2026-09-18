import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createForeplayClient } from '@/lib/foreplay/client';
import { mineConcept, naiveProbes } from '@/lib/foreplay/mine';
import { toWallAd } from '@/lib/foreplay/wall';
import { extractReplyText, runClaude } from '@/app/api/workflows/draft/logic';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Concept mining: a concept expands into probe queries (Claude CLI when
 * available, deterministic fallback otherwise), each probe hits Discovery,
 * the pool dedupes and ranks by longevity. Explicit credit spend: this
 * route only runs when someone submits the mine prompt.
 */

const MineRequestSchema = z.object({
  concept: z.string().min(3).max(300),
  minDays: z.number().int().min(1).max(365).optional(),
  format: z.enum(['video', 'image']).optional(),
});

const ProbeReplySchema = z.array(z.string().min(2).max(80)).min(2).max(8);

async function expandProbes(concept: string): Promise<{ probes: string[]; expandedBy: 'claude' | 'fallback' }> {
  const prompt = [
    'You expand an ad-concept into search queries for an ad-library keyword search (searches ad text, not transcripts).',
    `Concept: "${concept}"`,
    'Reply with STRICT JSON only: an array of 4-6 short probe queries (2-5 words each): phrasings this concept leaves in real ad copy. Mix exact phrases and keyword pairs. No markdown.',
  ].join('\n');
  const res = await runClaude(prompt);
  if (res.ok) {
    try {
      const cleaned = extractReplyText(res.stdout).replace(/```(?:json)?|```/g, '').trim();
      const probes = ProbeReplySchema.parse(JSON.parse(cleaned));
      return { probes, expandedBy: 'claude' };
    } catch {
      // fall through to the deterministic expansion
    }
  }
  return { probes: naiveProbes(concept), expandedBy: 'fallback' };
}

export async function POST(request: Request) {
  const parsed = MineRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'a concept (3-300 chars) is required' }, { status: 400 });
  }
  const client = createForeplayClient();
  if (!client) {
    return NextResponse.json(
      { ok: false, error: 'Foreplay not configured: set FOREPLAY_API_KEY in .env.local' },
      { status: 503 },
    );
  }

  const { probes, expandedBy } = await expandProbes(parsed.data.concept);
  try {
    const result = await mineConcept(client, parsed.data.concept, probes, {
      minDays: parsed.data.minDays,
      format: parsed.data.format,
    });
    return NextResponse.json({
      ok: true,
      concept: result.concept,
      expandedBy,
      probes: result.probes,
      pooled: result.pooled,
      apiCalls: result.apiCalls,
      winners: result.winners.map((w) => toWallAd(w.ad)),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'mine failed' },
      { status: 502 },
    );
  }
}
