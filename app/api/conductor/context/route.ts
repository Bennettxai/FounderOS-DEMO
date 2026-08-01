import { NextResponse } from 'next/server';
import { screenContextFor, screenTitleFor } from '@/lib/screen-context';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // better-sqlite3 is native — keep off the edge runtime

// The panel must open instantly: context building can hit live connectors
// (the funnel path awaits Attio + GHL), so it gets a hard time budget and
// degrades to the plain title instead of hanging the dock.
const CONTEXT_BUDGET_MS = 2500;

/** What the Conductor panel tells the agent about the screen it's docked on. */
export async function GET(req: Request) {
  const path = new URL(req.url).searchParams.get('path') ?? '/';
  const fallback = new Promise<{ title: string; context: string }>((resolve) =>
    setTimeout(() => resolve({ title: screenTitleFor(path), context: `${screenTitleFor(path)} view of Founder OS.` }), CONTEXT_BUDGET_MS),
  );
  const resolved = await Promise.race([screenContextFor(path), fallback]);
  return NextResponse.json(resolved);
}
