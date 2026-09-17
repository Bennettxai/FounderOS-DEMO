import { WorkflowInputSchema, type WorkflowInput } from '../shared';

/**
 * Everything the drafting route needs that ISN'T a route export lives here -
 * Next.js's route type-checker rejects a route.ts module with any named
 * export besides HTTP verbs and a small allow-list (dynamic, runtime, …), so
 * the pure, directly-testable pieces (prompt building, reply parsing, the
 * CLI wrapper) are split out. Tests import from this module, never from
 * route.ts, and never invoke the real `claude` binary.
 */

export const SCHEMA_INSTRUCTIONS = `Reply with STRICT JSON only: no prose, no markdown code fences: matching exactly this shape:
{
  "name": string,
  "subtitle": string,
  "steps": [
    {
      "title": string,
      "detail": string,           // one or two sentences, what actually happens in this step
      "ownerKind": "human" | "agent",
      "owner": string,            // a name: a real person or a plausible agent name
      "hoursPerWeek": number,     // >= 0
      "tools": string[],          // short lowercase tool ids, e.g. "gmail", "attio", "notion"
      "automation": null | { "title": string, "state": "live" | "suggested", "recoveredUsd": number },
      "branchFromIndex": null | number,   // index (0-based) of an EARLIER step in this same array that this step forks from, or null for the normal sequence
      "branchCondition": null | string    // required together with branchFromIndex, e.g. "approved", "went quiet"
    }
  ]
}
Steps run in array order by default (step i follows step i-1). Only set branchFromIndex when the workflow genuinely forks (e.g. "if approved, do X; if rejected, do Y"): branchFromIndex must point at an earlier index in the SAME array. Most workflows do not need any branching at all.`;

export function buildPrompt(userPrompt: string, priorError?: string): string {
  const base = `You are drafting a business workflow for an operator dashboard. The operator describes a process; you map it into discrete steps, each owned by a human or an agent.\n\nDescribe: ${userPrompt}\n\n${SCHEMA_INSTRUCTIONS}`;
  if (!priorError) return base;
  return `${base}\n\nYour previous reply failed validation with this error:\n${priorError}\nReply again with ONLY corrected strict JSON: nothing else.`;
}

/** Pulls the model's reply text out of a `claude -p ... --output-format
 *  json` envelope. The CLI wraps the reply in `{ "result": "...", ... }`;
 *  fall back to treating the whole stdout as the reply text if it isn't
 *  that shape, so a plain-text or already-raw-JSON stdout still parses. */
export function extractReplyText(stdout: string): string {
  const trimmed = stdout.trim();
  try {
    const envelope = JSON.parse(trimmed);
    if (envelope && typeof envelope === 'object') {
      if (typeof (envelope as any).result === 'string') return (envelope as any).result;
      if (typeof (envelope as any).message === 'string') return (envelope as any).message;
    }
  } catch {
    // stdout wasn't a JSON envelope at all: treat it as the reply text itself
  }
  return trimmed;
}

/** Strips ```json … ``` / ``` … ``` fences a model sometimes wraps its
 *  reply in despite being told not to. */
function stripCodeFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

/** Parses + validates one CLI reply into a `WorkflowInput`. Pure: no
 *  process spawning: so this is what the tests exercise directly instead
 *  of mocking `execFile`. */
export function parseWorkflowDraft(stdout: string): { ok: true; data: WorkflowInput } | { ok: false; error: string } {
  const text = stripCodeFence(extractReplyText(stdout));
  let candidate: unknown;
  try {
    candidate = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `reply was not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  const parsed = WorkflowInputSchema.safeParse(candidate);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  return { ok: true, data: parsed.data };
}

export type CliResult = { ok: true; stdout: string } | { ok: false; unavailable: boolean; error: string };

/** Shells out to the `claude` CLI, resolved from PATH (no hardcoded path).
 *  Never throws: a missing binary, a timeout, or a nonzero exit all come
 *  back as an honest `{ ok: false, unavailable, error }` for the route to
 *  degrade against, rather than a fabricated draft. */
export async function runClaude(prompt: string): Promise<CliResult> {
  const { execFile } = await import('node:child_process');
  return new Promise((resolve) => {
    const child = execFile(
      'claude',
      ['-p', prompt, '--output-format', 'json'],
      { timeout: 60_000, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          const code = (err as NodeJS.ErrnoException).code;
          const unavailable = code === 'ENOENT' || code === 'ETIMEDOUT' || /command not found/i.test(String(stderr));
          resolve({ ok: false, unavailable, error: stderr?.trim() || err.message });
          return;
        }
        resolve({ ok: true, stdout });
      },
    );
    child.on('error', (err) => {
      resolve({ ok: false, unavailable: true, error: err.message });
    });
  });
}
