import { NextResponse } from 'next/server';
import { getDb } from '@/lib/data';
import { compileBlueprint } from '@/lib/blueprint/compile';
import { buildHierarchy, describeScope, indexHierarchy } from '@/lib/blueprint/hierarchy';
import { chat, llmStatus } from '@/lib/connectors/llm';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SYSTEM = [
  "You are Founder OS's Blueprint analyst. The operator is looking at a live map of the system and asked a question about the SELECTED scope.",
  'Answer ONLY from the CONTEXT. It was compiled from the running system a moment ago. If the context does not say, say so plainly. Never invent numbers, files, keys or status.',
  'Be direct, specific and short: 90 words max unless asked for a list. Plain text only, no markdown, no headers, no bullet symbols. Name components by their names.',
].join('\n');

/** Strip the markdown a model may emit despite the instruction. */
function plainText(s: string): string {
  return s
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^#+\s*/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '')
    .trim();
}

/**
 * POST { question, selected } -> the ask bar's answer, grounded in the
 * selected scope (its chain, members and relations) from the graph compiled
 * right now. Same engine as every chat in the OS: the AI Gateway. An honest
 * 503 when the gateway is not configured on this host.
 */
export async function POST(req: Request) {
  let body: { question?: unknown; selected?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: 'bad json' }, { status: 400 });
  }
  const question = String(body.question ?? '')
    .trim()
    .slice(0, 600);
  if (question.length < 3) return NextResponse.json({ ok: false, error: 'ask a real question' }, { status: 400 });
  const selected = typeof body.selected === 'string' ? body.selected : null;

  const llm = await llmStatus();
  if (llm.state !== 'connected') {
    return NextResponse.json({ ok: false, error: 'AI Gateway not configured on this host' }, { status: 503 });
  }

  const graph = await compileBlueprint(getDb(), { llm });
  const h = buildHierarchy(graph);
  const idx = indexHierarchy(h);
  const ctx = describeScope(h, idx, selected);
  const prompt = `CONTEXT (selected scope):\n${JSON.stringify(ctx)}\n\nQUESTION: ${question}`;

  try {
    const r = await chat({ system: SYSTEM, messages: [{ role: 'user', content: prompt }] });
    return NextResponse.json({ ok: true, text: plainText(r.text), model: process.env.LLM_MODEL ?? 'gateway default', scope: String(ctx.scope) });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
