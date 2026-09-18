import { describe, expect, test } from 'vitest';
import { overlayLiveOrg } from '@/lib/org-live';
import type { PaperclipAgent } from '@/lib/connectors/paperclip';

/**
 * /org live overlay: the board's department leads are named after the OS's
 * pillars (Sales, Marketing/Growth, TECH, Finances, Communications), so a
 * name-match lets the frozen markup wear LIVE statuses. Conductor maps to the
 * Conductor card; board agents with no pillar (Forge, Hermes Workers,
 * Reflection Coach) surface as extras for the live strip.
 */
const DEPTS = [
  { id: 'dept-sales', name: 'Sales' },
  { id: 'dept-marketing-growth', name: 'Marketing/Growth' },
  { id: 'dept-tech', name: 'TECH' },
  { id: 'dept-clients', name: 'Clients' }, // no board counterpart
];

const live = (name: string, status: PaperclipAgent['status'], model: string | null = null): PaperclipAgent => ({
  id: `id-${name}`,
  name,
  status,
  adapterType: 'claude_local',
  model,
  lastHeartbeatAt: null,
});

describe('overlayLiveOrg', () => {
  test('matches pillars by name (case-insensitive), conductor separately, rest are extras', () => {
    const o = overlayLiveOrg(DEPTS, [
      live('Conductor', 'running', 'claude-fable-5'),
      live('sales', 'idle', 'claude-sonnet-4-6'),
      live('TECH', 'error', 'gpt-5.5'),
      live('Forge', 'running'),
      live('Hermes Workers', 'idle'),
    ]);
    expect(o.conductor?.status).toBe('running');
    expect(o.byDepartment['dept-sales']?.model).toBe('claude-sonnet-4-6');
    expect(o.byDepartment['dept-tech']?.status).toBe('error');
    expect(o.byDepartment['dept-clients']).toBeUndefined();
    expect(o.extras.map((e) => e.name)).toEqual(['Forge', 'Hermes Workers']);
  });

  test('empty live list (board down) yields an inert overlay', () => {
    const o = overlayLiveOrg(DEPTS, []);
    expect(o.conductor).toBeNull();
    expect(o.byDepartment).toEqual({});
    expect(o.extras).toEqual([]);
  });
});
