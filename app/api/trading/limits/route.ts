import { NextResponse } from 'next/server';
import { getDb } from '@/lib/data';
import { TradingLimitsSchema } from '@/lib/schemas';
import { DEFAULT_LIMITS, clampLimits, type EditableLimits } from '@/lib/trading-guardrails';

export const dynamic = 'force-dynamic';

/**
 * The Markets Agent's guardrail limits, read by the agent at the start of every
 * run and edited from the /trading card.
 *
 * Same private network trust model as the other /api/trading/* routes, which is exactly
 * why clampLimits() runs on the way IN as well as on the way out: this route can
 * change how much real money an agent deploys, so no request can push a value
 * past LIMIT_BOUNDS regardless of what it asks for. Widening those needs a code
 * edit and a deploy.
 */

/** The 7 numeric fields, without the code-only symbol lists. */
function editable(l: typeof DEFAULT_LIMITS): EditableLimits {
  const { allowedSymbols: _a, blockedSymbols: _b, ...rest } = l;
  return rest;
}

export async function GET() {
  const stored = getDb().trading.limits();
  const { limits, clamped } = clampLimits(stored ?? editable(DEFAULT_LIMITS));
  return NextResponse.json({
    // the switch rides beside the numbers; the clamp only knows the numbers
    limits: { ...limits, autopilot: stored?.autopilot ?? false },
    clamped,
    source: stored ? 'stored' : 'default',
    updatedAt: getDb().trading.limitsUpdatedAt(),
  });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 });
  }
  const parsed = TradingLimitsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues }, { status: 400 });
  }
  // Store the clamped values, not the requested ones, and echo back what was
  // actually written — telling the operator their number took when it did not
  // would be worse than rejecting it.
  const { limits, clamped } = clampLimits(parsed.data);
  const stored = { ...limits, autopilot: parsed.data.autopilot };
  getDb().trading.saveLimits(stored);
  return NextResponse.json({ ok: true, limits: stored, clamped });
}
