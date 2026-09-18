import { beforeEach, describe, expect, test } from 'vitest';
import {
  flattenPaperclipOrg,
  mapPaperclipAgents,
  paperclipStatus,
} from '@/lib/connectors/paperclip';

/**
 * Paperclip = the agent harness (board on the private network). The connector reads the
 * REAL org: company agents + the CEO→reports tree, so /org and /agents can show
 * the live company instead of seeded rows. Mapping is pure and defensive:
 * malformed rows are skipped, never fatal (same contract as mapAttioDeals).
 */

// Shapes captured from the live API (GET /companies/:id/agents and /org).
const RAW_AGENTS = [
  { id: 'a1', name: 'Conductor', status: 'running', adapterType: 'claude_local', model: 'claude-fable-5' },
  { id: 'a2', name: 'Hermes Workers', status: 'idle', adapterType: 'hermes_gateway' },
  { id: 'a3', name: 'TECH', status: 'idle', adapterType: 'codex_local', model: 'gpt-5.6' },
  { id: 'bad' }, // no name → skipped
  'not-an-object', // → skipped
];

const RAW_ORG = [
  {
    id: 'a1',
    name: 'Conductor',
    role: 'ceo',
    status: 'running',
    reports: [
      { id: 'a2', name: 'Hermes Workers', role: 'general', status: 'idle', reports: [] },
      {
        id: 'a3',
        name: 'TECH',
        role: 'cto',
        status: 'idle',
        reports: [{ id: 'a4', name: 'Sub', role: 'general', status: 'idle', reports: [] }],
      },
    ],
  },
];

describe('mapPaperclipAgents', () => {
  test('maps valid agents and skips malformed rows', () => {
    const agents = mapPaperclipAgents(RAW_AGENTS);
    expect(agents.map((a) => a.name)).toEqual(['Conductor', 'Hermes Workers', 'TECH']);
    expect(agents[0]).toMatchObject({ id: 'a1', status: 'running', adapterType: 'claude_local', model: 'claude-fable-5' });
    // model is optional (gateway agents have none)
    expect(agents[1].model).toBeNull();
  });

  test('unknown status collapses to idle (never trusts the wire)', () => {
    const agents = mapPaperclipAgents([{ id: 'x', name: 'X', status: 'exploded' }]);
    expect(agents[0].status).toBe('idle');
  });

  test('model falls back to adapterConfig.model (where the board stores it)', () => {
    const agents = mapPaperclipAgents([
      { id: 'y', name: 'Comms', status: 'idle', adapterType: 'claude_local', adapterConfig: { model: 'claude-haiku-4-6' } },
    ]);
    expect(agents[0].model).toBe('claude-haiku-4-6');
  });
});

describe('flattenPaperclipOrg', () => {
  test('flattens the tree with depth + parent links, preorder', () => {
    const nodes = flattenPaperclipOrg(RAW_ORG);
    expect(nodes.map((n) => [n.name, n.depth, n.parentId])).toEqual([
      ['Conductor', 0, null],
      ['Hermes Workers', 1, 'a1'],
      ['TECH', 1, 'a1'],
      ['Sub', 2, 'a3'],
    ]);
  });

  test('tolerates malformed nodes without throwing', () => {
    expect(flattenPaperclipOrg([{ nonsense: true }, null])).toEqual([]);
  });
});

describe('mapPaperclipIssues', () => {
  test('maps board issues and skips malformed rows', async () => {
    const { mapPaperclipIssues } = await import('@/lib/connectors/paperclip');
    const issues = mapPaperclipIssues([
      { id: 'i1', identifier: 'OS-3', title: 'Dashboard v0', status: 'done', updatedAt: '2026-08-03T10:00:00Z' },
      { id: 'i2', identifier: 'OS-20', title: 'New thing', status: 'in_progress', assigneeName: 'Conductor' },
      { id: 'nope' }, // no title → skipped
    ]);
    expect(issues.map((i) => i.identifier)).toEqual(['OS-3', 'OS-20']);
    expect(issues[0].status).toBe('done');
    expect(issues[1].assigneeName).toBe('Conductor');
  });
});

describe('mapPaperclipRuns', () => {
  test('maps heartbeat runs with agent attribution', async () => {
    const { mapPaperclipRuns } = await import('@/lib/connectors/paperclip');
    const runs = mapPaperclipRuns([
      { id: 'r1', agentId: 'a1', agentName: 'Conductor', status: 'succeeded', startedAt: '2026-08-03T09:00:00Z', finishedAt: '2026-08-03T09:04:00Z' },
      { id: 'r2', agentId: 'a2', status: 'running', startedAt: '2026-08-03T09:10:00Z' },
      { broken: true },
    ]);
    expect(runs).toHaveLength(2);
    expect(runs[0]).toMatchObject({ agentName: 'Conductor', status: 'succeeded' });
    expect(runs[1].agentName).toBeNull();
    expect(runs[1].finishedAt).toBeNull();
  });
});

describe('mapPaperclipComments', () => {
  test('maps thread comments with author attribution, skips deleted + malformed', async () => {
    const { mapPaperclipComments } = await import('@/lib/connectors/paperclip');
    const comments = mapPaperclipComments([
      { id: 'c1', body: 'Status?', authorType: 'user', authorUserId: 'u1', createdAt: '2026-08-04T10:00:00Z' },
      { id: 'c2', body: 'On it.', authorType: 'agent', authorAgentId: 'a1', createdAt: '2026-08-04T10:01:00Z' },
      { id: 'c3', body: 'gone', authorType: 'agent', deletedAt: '2026-08-04T10:02:00Z', createdAt: '2026-08-04T10:02:00Z' },
      { id: 'c4' }, // no body → skipped
    ]);
    expect(comments.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(comments[0].authorType).toBe('user');
    expect(comments[1]).toMatchObject({ authorType: 'agent', authorAgentId: 'a1' });
  });
});

describe('paperclipStatus', () => {
  beforeEach(() => {
    delete process.env.PAPERCLIP_API_URL;
    delete process.env.PAPERCLIP_BOARD_KEY;
  });

  test('honest not_configured without creds', async () => {
    const s = await paperclipStatus();
    expect(s.id).toBe('paperclip');
    expect(s.kind).toBe('orchestration');
    expect(s.state).toBe('not_configured');
  });
});
