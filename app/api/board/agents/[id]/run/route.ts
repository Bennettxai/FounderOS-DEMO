import { NextResponse } from 'next/server';
import { invokePaperclipHeartbeat } from '@/lib/connectors/paperclip';

export const dynamic = 'force-dynamic';

/** The OS Run button, for real: trigger a board heartbeat for this agent. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ok = await invokePaperclipHeartbeat(params.id);
    if (!ok) return NextResponse.json({ error: 'board rejected the heartbeat' }, { status: 502 });
    return NextResponse.json({ ok: true }, { status: 202 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
