import { NextResponse } from 'next/server';
import { createPaperclipIssue, paperclipIssues } from '@/lib/connectors/paperclip';

export const dynamic = 'force-dynamic';

/** Live company-board tasks (Paperclip issues). [] when the board is away. */
export async function GET() {
  return NextResponse.json({ issues: await paperclipIssues(30) });
}

/** Create a REAL task on the board — the Conductor triages it from there. */
export async function POST(req: Request) {
  let body: { title?: string; description?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  const title = body.title?.trim();
  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });
  try {
    const issue = await createPaperclipIssue({ title, description: body.description });
    return NextResponse.json({ issue }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
