import { NextResponse } from 'next/server';
import { paperclipAgents } from '@/lib/connectors/paperclip';
import { quickActionsFor, screenContextFor, screenTitleFor } from '@/lib/screen-context';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // better-sqlite3 is native — keep off the edge runtime

const CONTEXT_BUDGET_MS = 2500;

/**
 * Which model is actually sitting in the Conductor seat on the board. Resolved
 * here rather than in /api/conductor/chat because this route runs once per
 * route change while chat is polled every 4s — one board read per navigation,
 * not one per tick. Unreachable board means null, and the dock says so.
 */
async function conductorModel(): Promise<string | null> {
  try {
    return (await paperclipAgents()).find((a) => a.name === 'Conductor')?.model ?? null;
  } catch {
    return null;
  }
}

/** What the Conductor panel tells the agent about the screen it's docked on. */
export async function GET(req: Request) {
  const path = new URL(req.url).searchParams.get('path') ?? '/';
  const fallback = new Promise<{ title: string; context: string; quickActions: ReturnType<typeof quickActionsFor> }>(
    (resolve) =>
      setTimeout(
        () =>
          resolve({
            title: screenTitleFor(path),
            context: `${screenTitleFor(path)} view of Founder OS.`,
            quickActions: quickActionsFor(path),
          }),
        CONTEXT_BUDGET_MS,
      ),
  );
  const [resolved, model] = await Promise.all([
    Promise.race([screenContextFor(path), fallback]),
    Promise.race([conductorModel(), new Promise<null>((r) => setTimeout(() => r(null), CONTEXT_BUDGET_MS))]),
  ]);
  return NextResponse.json({ ...resolved, model });
}
