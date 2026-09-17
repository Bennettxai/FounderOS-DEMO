import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildPrompt, parseWorkflowDraft, runClaude } from './logic';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // shells out to a local binary: keep off the edge runtime

const DraftRequestSchema = z.object({ prompt: z.string().min(1).max(4000) });

/**
 * Drafts a workflow from a free-text description by shelling out to the
 * `claude` CLI. Validates the reply against WorkflowInputSchema (see
 * ./logic.ts); on a validation failure, retries once with the error
 * appended so the model can self-correct. Never writes to the database -
 * the draft only fills the builder panel for the operator to review and
 * explicitly save. When the CLI is missing or errors, this returns an
 * honest `unavailable` state rather than fabricating a draft.
 */
export async function POST(request: Request) {
  const parsed = DraftRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'a prompt is required' }, { status: 400 });

  const first = await runClaude(buildPrompt(parsed.data.prompt));
  if (!first.ok) {
    return NextResponse.json({
      ok: false,
      unavailable: first.unavailable,
      error: first.unavailable
        ? 'drafting assistant unavailable: build manually'
        : `drafting assistant failed: ${first.error}`,
    });
  }

  const firstDraft = parseWorkflowDraft(first.stdout);
  if (firstDraft.ok) return NextResponse.json({ ok: true, draft: firstDraft.data });

  // One retry, with the validation error fed back in.
  const second = await runClaude(buildPrompt(parsed.data.prompt, firstDraft.error));
  if (!second.ok) {
    return NextResponse.json({
      ok: false,
      unavailable: second.unavailable,
      error: second.unavailable
        ? 'drafting assistant unavailable: build manually'
        : `drafting assistant failed: ${second.error}`,
    });
  }
  const secondDraft = parseWorkflowDraft(second.stdout);
  if (secondDraft.ok) return NextResponse.json({ ok: true, draft: secondDraft.data });

  return NextResponse.json({
    ok: false,
    unavailable: false,
    error: `drafting assistant returned an invalid draft twice: build manually (${secondDraft.error})`,
  });
}
