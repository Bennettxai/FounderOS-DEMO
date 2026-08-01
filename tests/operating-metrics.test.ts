import { describe, expect, test } from 'vitest';
import { splitMetrics, type MetricInput } from '@/lib/operating-metrics';

const inputs: MetricInput[] = [
  { id: 'audience', label: 'Audience', unit: 'followers', source: 'Zernio', value: 55989, delta: 3.6, deltaPct: true },
  { id: 'pipeline', label: 'Open Pipeline', unit: 'deals', source: 'Attio', value: 14, delta: 2 },
  { id: 'agent-runs', label: 'Agent Runs', unit: 'runs', source: 'all time', value: 7, delta: 7 },
  { id: 'brain', label: 'Brain-store Pages', unit: 'pages', source: 'GBrain', value: 918 },
  { id: 'dictations', label: 'Dictations', unit: 'dictations', source: 'Wispr Flow', value: null },
  { id: 'unread', label: 'Unread (all inboxes)', unit: 'emails', source: 'pending creds', value: null },
  { id: 'stripe', label: 'Stripe Available', unit: 'usd', source: 'pending creds', value: 0 },
];

describe('splitMetrics', () => {
  test('a metric is live only when it carries a real positive value', () => {
    const { live, pending } = splitMetrics(inputs);
    expect(live.map((m) => m.id)).toEqual(['audience', 'pipeline', 'agent-runs', 'brain']);
    expect(pending.map((m) => m.id)).toEqual(['dictations', 'unread', 'stripe']);
  });

  test('null / zero / negative values are treated as pending, never faked', () => {
    const { pending } = splitMetrics(inputs);
    expect(pending.find((m) => m.id === 'dictations')?.value).toBe(0); // null normalised to 0
    expect(pending.find((m) => m.id === 'stripe')?.value).toBe(0);
  });

  test('normalises missing delta/deltaPct to flat defaults', () => {
    const { live } = splitMetrics(inputs);
    const brain = live.find((m) => m.id === 'brain')!;
    expect(brain.delta).toBe(0);
    expect(brain.deltaPct).toBe(false);
    const audience = live.find((m) => m.id === 'audience')!;
    expect(audience.delta).toBe(3.6);
    expect(audience.deltaPct).toBe(true);
  });

  test('preserves input order within each bucket', () => {
    const { live } = splitMetrics(inputs);
    expect(live[0].id).toBe('audience');
    expect(live[live.length - 1].id).toBe('brain');
  });
});
