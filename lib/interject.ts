/**
 * Interject — the home composer's no-LLM router. Free text becomes one of:
 *   task  → a REAL Paperclip board issue (the Conductor triages it)
 *   agent → also a board issue, with the "tell/ask <agent>" phrasing kept as
 *           the title so the Conductor relays instead of triaging
 *   note  → a G-Brain inbox page (inbox/YYYY-MM-DD-note)
 * Pattern order is deliberate: the task patterns win over the agent ones.
 */

export type InterjectRoute = 'task' | 'agent' | 'note';

export type InterjectReceipt = {
  ok: boolean;
  route: InterjectRoute;
  ref?: string | null;
  url?: string | null;
  slug?: string;
  error?: string;
};

export interface InterjectDeps {
  createTask(title: string, description: string): Promise<{ ref: string | null; url: string | null }>;
  captureNote(input: { text: string; title: string; slug: string }): Promise<
    { ok: true; slug: string } | { ok: false; error: string }
  >;
}

const TASK_RE = /^task[: ]|\b(todo|task)\b/i;
const AGENT_RE = /^(tell|ask)\s+\w+/i;

export function classifyInterject(text: string): InterjectRoute {
  if (TASK_RE.test(text)) return 'task';
  if (AGENT_RE.test(text)) return 'agent';
  return 'note';
}

/** First line, minus any leading task:/todo: prefix, clamped for a board title. */
function taskTitle(text: string): string {
  const first = text.split('\n')[0].replace(/^\s*(task|todo)\s*[:\-]\s*/i, '').trim();
  return (first || text.trim()).slice(0, 120);
}

export async function performInterject(
  text: string,
  route: InterjectRoute | undefined,
  deps: InterjectDeps,
  now: Date = new Date(),
): Promise<InterjectReceipt> {
  const resolved = route ?? classifyInterject(text);

  if (resolved === 'note') {
    const day = now.toISOString().slice(0, 10);
    const outcome = await deps.captureNote({
      text,
      title: `Interject ${day}`,
      slug: `inbox/${day}-note`,
    });
    return outcome.ok
      ? { ok: true, route: 'note', slug: outcome.slug }
      : { ok: false, route: 'note', error: outcome.error };
  }

  // task and agent both land on the board; agent keeps the relay phrasing.
  const title = resolved === 'agent' ? text.split('\n')[0].trim().slice(0, 120) : taskTitle(text);
  const description = `${text}\n\n— interjected from the OS home (route: ${resolved})`;
  try {
    const created = await deps.createTask(title, description);
    return { ok: true, route: resolved, ref: created.ref, url: created.url };
  } catch (err) {
    return { ok: false, route: resolved, error: err instanceof Error ? err.message : String(err) };
  }
}
