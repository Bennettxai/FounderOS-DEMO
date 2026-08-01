import { afterEach, describe, expect, test } from 'vitest';
import { getBrainProvider } from '@/lib/brain';

afterEach(() => {
  delete process.env.BRAIN_PROVIDER;
});

describe('G Brain adapter', () => {
  test('defaults to the real gbrain provider', () => {
    const brain = getBrainProvider();
    expect(brain.name).toBe('gbrain');
  });

  test('falls back to stub when BRAIN_PROVIDER=stub', () => {
    process.env.BRAIN_PROVIDER = 'stub';
    const brain = getBrainProvider();
    expect(brain.name).toBe('stub');
  });

  test('stub reports a disconnected status with wiring instructions', async () => {
    process.env.BRAIN_PROVIDER = 'stub';
    const brain = getBrainProvider();
    const status = await brain.status();
    expect(status.connected).toBe(false);
    expect(status.provider).toBe('stub');
    expect(status.detail.length).toBeGreaterThan(0);
  });

  test('stub search returns an empty result set, never throws', async () => {
    process.env.BRAIN_PROVIDER = 'stub';
    const brain = getBrainProvider();
    await expect(brain.search('launchpad cohort')).resolves.toEqual([]);
  });
});
