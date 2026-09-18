import type { ConnectorStatus } from '@/lib/connectors/types';

/**
 * Phantom wallet (Solana) — read-only balance for the /trading top row.
 *
 * No credential of any kind: a Solana address is public and the balance is read
 * from a public RPC, so this connector holds a wallet ADDRESS, never a key. It
 * can never move funds; there is no signing path here and there should not be.
 *
 * Address comes from PHANTOM_WALLET_ADDRESS so it stays out of the repo and can
 * be changed without a deploy.
 */

const RPC = process.env.SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com';
const PRICE_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd';
const LAMPORTS_PER_SOL = 1_000_000_000;

export type PhantomBalance = {
  address: string;
  sol: number;
  usdPerSol: number | null;
  usdValue: number | null;
  fetchedAt: string;
};

/** Lamports are integers; SOL has 9 decimals. */
export function solFromLamports(lamports: number): number {
  return Math.round((lamports / LAMPORTS_PER_SOL) * 1e6) / 1e6;
}

/** Short display form, because the full address is unreadable at a glance. */
export function shortAddress(address: string): string {
  return address.length <= 12 ? address : `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export function phantomAddress(): string | null {
  const a = process.env.PHANTOM_WALLET_ADDRESS?.trim();
  return a && a.length > 0 ? a : null;
}

async function json(url: string, init?: RequestInit): Promise<unknown | null> {
  try {
    const r = await fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(8000) });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

/**
 * Balance in SOL plus its USD value. The price is a separate, best-effort call:
 * a price outage must not hide the balance, so usdValue goes null rather than
 * the whole reading failing.
 */
export async function phantomBalance(address = phantomAddress()): Promise<PhantomBalance | null> {
  if (!address) return null;
  const res = (await json(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [address] }),
  })) as { result?: { value?: number } } | null;

  const lamports = res?.result?.value;
  if (typeof lamports !== 'number') return null;

  const price = (await json(PRICE_URL)) as { solana?: { usd?: number } } | null;
  const usdPerSol = typeof price?.solana?.usd === 'number' ? price.solana.usd : null;
  const sol = solFromLamports(lamports);

  return {
    address,
    sol,
    usdPerSol,
    usdValue: usdPerSol === null ? null : Math.round(sol * usdPerSol * 100) / 100,
    fetchedAt: new Date().toISOString(),
  };
}

/** Honest status: no address configured is a different thing from a dead RPC. */
export function phantomStatus(balance: PhantomBalance | null): ConnectorStatus {
  const base = { id: 'phantom', name: 'Phantom', kind: 'payments' } as const;
  if (!phantomAddress()) {
    return {
      ...base,
      state: 'not_configured',
      detail: 'No PHANTOM_WALLET_ADDRESS set. It is a public address, not a key — no signing capability is involved.',
    };
  }
  if (!balance) {
    return { ...base, state: 'error', detail: 'Solana RPC did not return a balance.' };
  }
  return {
    ...base,
    state: 'connected',
    detail: `${shortAddress(balance.address)} · ${balance.sol} SOL${
      balance.usdValue === null ? ' (price unavailable)' : ''
    }`,
    meta: { sol: balance.sol, usdValue: balance.usdValue ?? 0 },
  };
}
