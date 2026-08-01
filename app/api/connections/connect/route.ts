import { NextResponse } from 'next/server';
import { z } from 'zod';
import { INTEGRATIONS, connectKeysFor } from '@/lib/integrations-catalog';
import { readEnvLocal, upsertEnvLocal, removeEnvLocal } from '@/lib/creds';

export const dynamic = 'force-dynamic';

/**
 * The Connections board's connect flow. Writes ONLY to .env.local (gitignored)
 * and only key names the catalog declares for that integration — never to
 * Alex's canonical machine files, and never arbitrary env vars. Values are
 * accepted, stored, and NEVER echoed back. Credential resolution reads
 * .env.local fresh at call time, so a saved key takes effect without a
 * server restart.
 */

const ConnectBody = z.object({
  slug: z.string().min(1),
  values: z.record(z.string(), z.string().min(1).max(600)),
});

const DisconnectBody = z.object({ slug: z.string().min(1) });

function entryFor(slug: string) {
  return INTEGRATIONS.find((i) => i.slug === slug) ?? null;
}

export async function POST(req: Request) {
  let body: z.infer<typeof ConnectBody>;
  try {
    body = ConnectBody.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, error: 'bad body' }, { status: 400 });
  }
  const entry = entryFor(body.slug);
  if (!entry) return NextResponse.json({ ok: false, error: 'unknown integration' }, { status: 400 });

  const allowed = new Set(connectKeysFor(entry));
  const names = Object.keys(body.values);
  if (allowed.size === 0) {
    return NextResponse.json(
      { ok: false, error: `${entry.name} does not connect with a pasted key` },
      { status: 400 },
    );
  }
  if (names.length === 0 || names.some((k) => !allowed.has(k))) {
    return NextResponse.json({ ok: false, error: 'unexpected key name' }, { status: 400 });
  }
  for (const v of Object.values(body.values)) {
    if (/[\r\n]/.test(v) || v.trim().length === 0) {
      return NextResponse.json({ ok: false, error: 'unsafe value' }, { status: 400 });
    }
  }

  upsertEnvLocal(Object.fromEntries(names.map((k) => [k, body.values[k].trim()])));
  const saved = readEnvLocal();
  const keySaved = [...allowed].every((k) => Boolean(saved[k]));
  return NextResponse.json({ ok: true, keySaved, partial: !keySaved });
}

export async function DELETE(req: Request) {
  let body: z.infer<typeof DisconnectBody>;
  try {
    body = DisconnectBody.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, error: 'bad body' }, { status: 400 });
  }
  const entry = entryFor(body.slug);
  if (!entry) return NextResponse.json({ ok: false, error: 'unknown integration' }, { status: 400 });
  removeEnvLocal(connectKeysFor(entry));
  return NextResponse.json({ ok: true, keySaved: false });
}
