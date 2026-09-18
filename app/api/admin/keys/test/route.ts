import { NextResponse } from 'next/server';
import { z } from 'zod';
import { connectorStatusById } from '@/lib/connectors';
import { KEY_SLOTS } from '@/lib/keys';

export const dynamic = 'force-dynamic';

const TestKeySchema = z.object({
  envVar: z.string().regex(/^[A-Z_][A-Z0-9_]*$/),
});

/**
 * Mock 3f: prove a key still works, and say how long it took.
 *
 * The artboard's key row ends in "✓ 212ms". That number is the whole point of
 * the control: a rotated key that saves fine and then fails on first use is the
 * exact failure this is meant to catch, so the test runs the connector's real
 * status check and times it. Nothing about the secret itself comes back — only
 * whether the far end answered, what it said, and how many milliseconds it
 * spent saying it.
 */
export async function POST(request: Request) {
  const parsed = TestKeySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const slot = KEY_SLOTS.find((s) => s.envVar === parsed.data.envVar);
  if (!slot) {
    return NextResponse.json({ error: `unknown key slot: ${parsed.data.envVar}` }, { status: 400 });
  }
  if (!slot.connectorId) {
    return NextResponse.json({ error: `${slot.envVar} has no live connector to test` }, { status: 400 });
  }

  const started = Date.now();
  const status = await connectorStatusById(slot.connectorId);
  const ms = Date.now() - started;
  if (!status) {
    return NextResponse.json({ error: `unknown connector: ${slot.connectorId}` }, { status: 400 });
  }

  return NextResponse.json(
    { ok: status.state === 'connected', state: status.state, detail: status.detail, ms },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
