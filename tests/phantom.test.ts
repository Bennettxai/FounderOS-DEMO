import { afterEach, describe, expect, test } from 'vitest';
import { phantomStatus, shortAddress, solFromLamports } from '@/lib/connectors/phantom';

/**
 * Phantom is read-only by construction: it holds a public Solana ADDRESS and
 * reads a public RPC. There is no key and no signing path, so the worst case is
 * a stale number on screen, never a moved coin.
 */

const ADDRESS = 'So1anaDemoWa11etAddressExamp1e1111111111111';
const original = process.env.PHANTOM_WALLET_ADDRESS;
afterEach(() => {
  if (original === undefined) delete process.env.PHANTOM_WALLET_ADDRESS;
  else process.env.PHANTOM_WALLET_ADDRESS = original;
});

describe('solFromLamports', () => {
  test('converts at nine decimals without floating-point noise', () => {
    expect(solFromLamports(10_200_600_779)).toBe(10.200601);
    expect(solFromLamports(1_000_000_000)).toBe(1);
    expect(solFromLamports(0)).toBe(0);
  });
});

describe('shortAddress', () => {
  test('keeps both ends so it stays identifiable', () => {
    expect(shortAddress(ADDRESS)).toBe('So1a…1111');
    expect(shortAddress('short')).toBe('short');
  });
});

describe('phantomStatus', () => {
  const balance = {
    address: ADDRESS,
    sol: 10.200601,
    usdPerSol: 76.15,
    usdValue: 776.78,
    fetchedAt: '2026-08-13T20:30:00.000Z',
  };

  test('not_configured when no address is set, and says it is not a key', () => {
    delete process.env.PHANTOM_WALLET_ADDRESS;
    const s = phantomStatus(null);
    expect(s.state).toBe('not_configured');
    expect(s.detail).toMatch(/not a key/i);
  });

  test('error — not connected — when the address is set but the RPC gave nothing', () => {
    process.env.PHANTOM_WALLET_ADDRESS = ADDRESS;
    const s = phantomStatus(null);
    expect(s.state).toBe('error');
  });

  test('connected reports the balance and a shortened address', () => {
    process.env.PHANTOM_WALLET_ADDRESS = ADDRESS;
    const s = phantomStatus(balance);
    expect(s.state).toBe('connected');
    expect(s.detail).toContain('So1a…1111');
    expect(s.meta?.sol).toBe(10.200601);
  });

  test('still connected when the price feed is down, flagging the missing price', () => {
    process.env.PHANTOM_WALLET_ADDRESS = ADDRESS;
    const s = phantomStatus({ ...balance, usdPerSol: null, usdValue: null });
    expect(s.state).toBe('connected');
    expect(s.detail).toMatch(/price unavailable/i);
  });
});
