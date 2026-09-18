import { afterEach, describe, expect, test } from 'vitest';
import { getBrainProvider } from '@/lib/brain';

afterEach(() => {
  delete process.env.BRAIN_PROVIDER;
});

describe('G Brain adapter', () => {
  // The default moved to 'federated' on 2026-08-25: both stores at once,
  // governed answers first, degrading to gbrain alone wherever the engine is
  // not running. gbrain stays selectable on its own.
  test('defaults to the federated brain, which falls back to gbrain', () => {
    const brain = getBrainProvider();
    expect(brain.name).toBe('federated');
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
