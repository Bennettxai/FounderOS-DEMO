import { beforeEach, describe, expect, test } from 'vitest';
import { createFederatedBrain, clearGovernedProbe } from '@/lib/brain-federated';
import type { BrainProvider, BrainSearchResult } from '@/lib/brain';

function fake(
  name: string,
  hits: BrainSearchResult[] | Error,
  status: { connected: boolean; detail: string } = { connected: true, detail: 'up' },
): BrainProvider & { calls: number } {
  const p = {
    name,
    calls: 0,
    async status() {
      return { connected: status.connected, provider: name, detail: status.detail };
    },
    async search() {
      p.calls++;
      if (hits instanceof Error) throw hits;
      return hits;
    },
  };
  return p;
}

const hit = (title: string, source: string): BrainSearchResult => ({
  title,
  snippet: `body of ${title}`,
  source,
});

beforeEach(() => clearGovernedProbe());

describe('createFederatedBrain', () => {
  test('governed answers come first, prose chunks after', async () => {
    const brain = createFederatedBrain({
      governed: fake('optimal', [hit('vantage/pricing', 'optimal')]),
      documents: fake('gbrain', [hit('conversations/2026-03-01-chat', 'gbrain')]),
    });
    const out = await brain.search('vantage pricing');
    expect(out.map((h) => h.title)).toEqual(['vantage/pricing', 'conversations/2026-03-01-chat']);
  });

  test('the same page from both stores is returned once, governed copy kept', async () => {
    const brain = createFederatedBrain({
      governed: fake('optimal', [hit('vantage/pricing', 'optimal')]),
      documents: fake('gbrain', [hit('vantage/pricing', 'gbrain'), hit('other', 'gbrain')]),
    });
    const out = await brain.search('q');
    expect(out).toHaveLength(2);
    expect(out[0].source).toBe('optimal');
  });

  test('an engine that is not running costs nothing and loses no chunks', async () => {
    const documents = fake('gbrain', [hit('a', 'gbrain')]);
    const brain = createFederatedBrain({
      governed: fake('optimal', new Error('ECONNREFUSED 127.0.0.1:4200')),
      documents,
    });
    const out = await brain.search('q');
    expect(out.map((h) => h.title)).toEqual(['a']);
    expect(documents.calls).toBe(1);
  });

  test('an unreachable engine is not probed again on every call', async () => {
    const governed = fake('optimal', new Error('ECONNREFUSED'));
    const brain = createFederatedBrain({ governed, documents: fake('gbrain', [hit('a', 'gbrain')]) });
    await brain.search('one');
    await brain.search('two');
    await brain.search('three');
    expect(governed.calls).toBe(1); // the host has no engine; it must not pay per read
  });

  test('a documents store that throws still surfaces the governed answers', async () => {
    const brain = createFederatedBrain({
      governed: fake('optimal', [hit('vantage/pricing', 'optimal')]),
      documents: fake('gbrain', new Error('supabase paused')),
    });
    expect((await brain.search('q')).map((h) => h.title)).toEqual(['vantage/pricing']);
  });

  test('both down is an error, not a quiet empty answer', async () => {
    const brain = createFederatedBrain({
      governed: fake('optimal', new Error('ECONNREFUSED')),
      documents: fake('gbrain', new Error('supabase paused')),
    });
    await expect(brain.search('q')).rejects.toThrow(/supabase paused/);
  });

  test('status names which halves answered', async () => {
    const brain = createFederatedBrain({
      governed: fake('optimal', [], { connected: false, detail: 'engine not running' }),
      documents: fake('gbrain', [], { connected: true, detail: 'health 90/100' }),
    });
    const status = await brain.status();
    expect(status.connected).toBe(true); // one working half is a working brain
    expect(status.detail).toContain('health 90/100');
    expect(status.detail).toContain('engine not running');
  });

  test('is down only when both halves are', async () => {
    const brain = createFederatedBrain({
      governed: fake('optimal', [], { connected: false, detail: 'engine not running' }),
      documents: fake('gbrain', [], { connected: false, detail: 'CLI missing' }),
    });
    expect((await brain.status()).connected).toBe(false);
  });
});

describe('provider registry', () => {
  test('federated is the default, because it degrades to gbrain by itself', async () => {
    const previous = process.env.BRAIN_PROVIDER;
    delete process.env.BRAIN_PROVIDER;
    try {
      const { getBrainProvider } = await import('@/lib/brain');
      expect(getBrainProvider().name).toBe('federated');
    } finally {
      if (previous !== undefined) process.env.BRAIN_PROVIDER = previous;
    }
  });

  test('BRAIN_PROVIDER=federated selects it', async () => {
    const previous = process.env.BRAIN_PROVIDER;
    process.env.BRAIN_PROVIDER = 'federated';
    try {
      const { getBrainProvider } = await import('@/lib/brain');
      expect(getBrainProvider().name).toBe('federated');
    } finally {
      if (previous === undefined) delete process.env.BRAIN_PROVIDER;
      else process.env.BRAIN_PROVIDER = previous;
    }
  });
});

/**
 * The federated brain is a wrapper, and a wrapper that answers fewer questions
 * than the thing it wraps is a downgrade wearing the default's clothes.
 *
 * `federated` became the default on 2026-08-25, and it forwarded only status()
 * and search(). Two callers duck-type the configured provider for capabilities
 * that live on gbrain, and both quietly lost them the day the default moved:
 *
 *  - lib/live-metrics.ts probes localStats() for the brain-store page count.
 *    In production it answered `null` with the reason 'brain provider
 *    "federated" reports no page count', while /api/brain reported a real
 *    local page count in the same breath. The rule is that null means we could
 *    not read it, so a forwardable read reported as a gap is the exact failure
 *    this guards against.
 *  - lib/memory-provider.ts probes capture() for POST /api/memory, the write
 *    half of the surface Hermes workers use. Without it, remember() answers
 *    "the federated brain provider cannot write memories (no capture)".
 *
 * Both belong to the documents half, so the wrapper forwards them there.
 */
describe('federated brain: the gbrain capabilities survive the wrapper', () => {
  const withExtras = () => {
    const p = fake('gbrain', []) as ReturnType<typeof fake> & {
      localStatsCalls: number;
      captured: unknown[];
      localStats(): Promise<{ markdownFiles: number; storePath: string }>;
      capture(input: { text: string }): Promise<{ ok: true; id: string }>;
    };
    p.localStatsCalls = 0;
    p.captured = [];
    p.localStats = async () => {
      p.localStatsCalls++;
      return { markdownFiles: 382, storePath: '/brain-store' };
    };
    p.capture = async (input) => {
      p.captured.push(input);
      return { ok: true as const, id: 'page-1' };
    };
    return p;
  };

  test('localStats reaches the documents half, so the page count is a number', async () => {
    const documents = withExtras();
    const brain = createFederatedBrain({ governed: fake('optimal', []), documents });
    const stats = await (brain as { localStats?: () => Promise<{ markdownFiles: number }> }).localStats?.();
    expect(stats?.markdownFiles).toBe(382);
    expect(documents.localStatsCalls).toBe(1);
  });

  test('capture reaches the documents half, so POST /api/memory can write', async () => {
    const documents = withExtras();
    const brain = createFederatedBrain({ governed: fake('optimal', []), documents });
    const out = await (brain as { capture?: (i: { text: string }) => Promise<unknown> }).capture?.({ text: 'hi' });
    expect(out).toEqual({ ok: true, id: 'page-1' });
    expect(documents.captured).toEqual([{ text: 'hi' }]);
  });

  test('a documents half without them does not grow them', async () => {
    const brain = createFederatedBrain({ governed: fake('optimal', []), documents: fake('plain', []) });
    expect((brain as { localStats?: unknown }).localStats).toBeUndefined();
    expect((brain as { capture?: unknown }).capture).toBeUndefined();
  });
});
