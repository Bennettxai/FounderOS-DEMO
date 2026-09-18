import { NextResponse } from 'next/server';
import { getDb } from '@/lib/data';
import { scanClaudeProjects, defaultProjectsDir, seatId } from '@/lib/connectors/claude-usage';
import { codexSeat } from '@/lib/connectors/codex-usage';
import { ollamaLane } from '@/lib/connectors/ollama-usage';
import { seatVerdict, type SeatUsage } from '@/lib/usage';

export const dynamic = 'force-dynamic';

/**
 * The whole usage board in one read: this box's Claude seat (computed live),
 * every seat other machines pushed, the Codex plan gauge, and the Ollama
 * status lane. Polled every ~10s by the client; the transcript scan is
 * incremental so the poll costs the appended bytes, not the archive.
 */
export async function GET() {
  const now = new Date();
  const errors: Record<string, string> = {};

  let local: SeatUsage | null = null;
  try {
    local = await scanClaudeProjects(defaultProjectsDir(), now);
  } catch (err) {
    errors.claude = err instanceof Error ? err.message : String(err);
  }

  let pushed: SeatUsage[] = [];
  try {
    pushed = getDb().usageSnapshots.all().filter((s) => s.id !== (local?.id ?? seatId()));
  } catch (err) {
    errors.push = err instanceof Error ? err.message : String(err);
  }

  let codex: SeatUsage | null = null;
  try {
    codex = await codexSeat();
  } catch (err) {
    errors.codex = err instanceof Error ? err.message : String(err);
  }

  const seats = [...(local ? [local] : []), ...pushed];
  return NextResponse.json({
    generatedAt: now.toISOString(),
    seats,
    codex,
    ollama: await ollamaLane(),
    verdict: seatVerdict(seats.filter((s) => s.kind === 'claude'), now),
    errors: Object.keys(errors).length ? errors : undefined,
  });
}
