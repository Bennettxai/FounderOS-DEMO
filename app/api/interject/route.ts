import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getBrainProvider } from '@/lib/brain';
import { getDb } from '@/lib/data';
import { performInterject } from '@/lib/interject';
import { createMemoryProvider, type MemoryBrain } from '@/lib/memory-provider';
import { createPaperclipIssue } from '@/lib/connectors/paperclip';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // better-sqlite3 is native — keep off the edge runtime

const InterjectSchema = z.object({
  text: z.string().trim().min(1).max(10_000),
  route: z.enum(['task', 'agent', 'note']).optional(),
});

/** The home composer: free text → board task / agent relay / G-Brain note. */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 });
  }
  const parsed = InterjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues }, { status: 400 });
  }

  const receipt = await performInterject(parsed.data.text, parsed.data.route, {
    async createTask(title, description) {
      const issue = await createPaperclipIssue({ title, description });
      // PaperclipIssue carries no url; the board UI lives at the API origin.
      const base = process.env.PAPERCLIP_API_URL?.replace(/\/$/, '');
      const url = issue && base ? `${base}/issues/${issue.id}` : null;
      return { ref: issue?.identifier ?? null, url };
    },
    async captureNote(input) {
      const brain: MemoryBrain = getBrainProvider();
      const outcome = await createMemoryProvider({ db: getDb(), brain }).remember(input);
      return outcome.ok ? { ok: true, slug: outcome.slug } : { ok: false, error: outcome.error };
    },
  });

  // A landed interject is a 200; one that could not land anywhere is a 502 so
  // the composer can show the failure instead of a fake receipt.
  return NextResponse.json(receipt, { status: receipt.ok ? 200 : 502 });
}
