import { describe, expect, test } from 'vitest';
import { buildAgentWiki, buildToolWiki, prettifySlug } from '@/lib/agent-wiki';
import type { Agent } from '@/lib/schemas';

const agent = (over: Partial<Agent> & { id: string }): Agent => ({
  name: over.id,
  role: 'Worker',
  status: 'active',
  tier: 'worker',
  description: '',
  model: 'claude-opus-4-8',
  tools: [],
  parentId: null,
  instance: 'builtin',
  departmentId: 'dept-tech',
  ...over,
});

describe('prettifySlug', () => {
  test('humanizes a slug', () => {
    expect(prettifySlug('comms-feed')).toBe('Comms Feed');
    expect(prettifySlug('attio')).toBe('Attio');
  });
});

describe('buildAgentWiki', () => {
  test('exposes the agent header + a brain-store path + markdown definition files', () => {
    const w = buildAgentWiki(agent({ id: 'data-agent', name: 'Data Agent', role: 'Knowledge', model: 'opus' }));
    expect(w.name).toBe('Data Agent');
    expect(w.role).toBe('Knowledge');
    expect(w.path).toBe('brain-store/agents/data-agent');
    expect(w.files).toContain('system.md');
    expect(w.files).toContain('data-agent.config.md');
  });

  test('maps each tool to a server, flagging MCP-backed ones', () => {
    const w = buildAgentWiki(agent({ id: 'sales-agent', tools: ['attio', 'openclaw'] }));
    const attio = w.servers.find((s) => s.slug === 'attio');
    const openclaw = w.servers.find((s) => s.slug === 'openclaw');
    expect(attio).toEqual({ slug: 'attio', name: 'Attio', mcp: true });
    expect(openclaw).toEqual({ slug: 'openclaw', name: 'Openclaw', mcp: false });
  });

  test('no tools → no servers', () => {
    expect(buildAgentWiki(agent({ id: 'x', tools: [] })).servers).toEqual([]);
  });
});

describe('buildToolWiki', () => {
  test('flags MCP servers vs plain integrations and carries a path + usedBy', () => {
    const attio = buildToolWiki('attio', ['Sales Agent', 'CRM Pulse']);
    expect(attio.mcp).toBe(true);
    expect(attio.kind).toBe('MCP server');
    expect(attio.name).toBe('Attio');
    expect(attio.path).toBe('brain-store/tools/attio.md');
    expect(attio.usedBy).toEqual(['Sales Agent', 'CRM Pulse']);
    expect(attio.summary.length).toBeGreaterThan(0);

    const oc = buildToolWiki('openclaw');
    expect(oc.mcp).toBe(false);
    expect(oc.kind).toBe('integration');
    expect(oc.usedBy).toEqual([]);
  });

  test('unknown tool gets a generic summary', () => {
    expect(buildToolWiki('some-new-tool').summary).toContain('Some New Tool');
  });
});
