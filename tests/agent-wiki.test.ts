import { describe, expect, test } from 'vitest';
import { buildAgentWiki, buildToolWiki, prettifySlug } from '@/lib/agent-wiki';
import { buildWikiIndex } from '@/lib/brain-wiki';
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

// A miniature brain-store shaped exactly like the real generated pages.
const INDEX = buildWikiIndex([
  {
    path: 'agents/data-agent.md',
    content: [
      '---', 'title: Data Agent', 'kind: agent', 'generated: founder-os', '---', '',
      '# Data Agent', '', 'G-Brain Analyst in [[pillar-tech]].', '',
      '## Harness', '', '- Tier: lead', '- Status: active', '',
      '## Tools', '', '- [[gbrain]]', '',
    ].join('\n'),
  },
  {
    path: 'tools/gbrain.md',
    content: [
      '---', 'title: G-Brain (gbrain CLI)', 'kind: tool', '---', '',
      '# G-Brain (gbrain CLI)', '', 'Hybrid search over the store.', '',
      '- Category: Knowledge', '- Status: connected', '',
      '## Used by', '', '- [[data-agent]]', '',
    ].join('\n'),
  },
  { path: 'org/pillar-tech.md', content: '# Tech Pillar\n\nOwns the stack.\n' },
]);

describe('prettifySlug', () => {
  test('humanizes a slug', () => {
    expect(prettifySlug('comms-feed')).toBe('Comms Feed');
    expect(prettifySlug('attio')).toBe('Attio');
  });
});

describe('buildAgentWiki', () => {
  test('reads the real page: its path, its own summary and the fields it states', () => {
    const w = buildAgentWiki(agent({ id: 'data-agent', name: 'Data Agent', role: 'Knowledge' }), INDEX);
    expect(w.path).toBe('brain-store/agents/data-agent.md');
    expect(w.files).toEqual(['data-agent.md']);
    expect(w.summary).toBe('G-Brain Analyst in pillar-tech.');
    expect(w.fields).toEqual({ Tier: 'lead', Status: 'active' });
  });

  test('carries the page real outbound links and real backlinks', () => {
    const w = buildAgentWiki(agent({ id: 'data-agent', name: 'Data Agent' }), INDEX);
    expect(w.links.map((l) => l.target)).toEqual(['pillar-tech', 'gbrain']);
    expect(w.links.every((l) => l.slug !== null)).toBe(true);
    expect(w.backlinks).toEqual([
      { target: 'data-agent', slug: 'tools/gbrain', title: 'G-Brain (gbrain CLI)' },
    ]);
  });

  test('an agent with no page says so instead of inventing files', () => {
    const w = buildAgentWiki(agent({ id: 'ghost-agent', name: 'Ghost' }), INDEX);
    expect(w.path).toBeNull();
    expect(w.files).toEqual([]);
    expect(w.summary).toBe('');
    expect(w.hasPage).toBe(false);
  });

  test('maps each tool to a server, flagging MCP-backed ones and whether it has a page', () => {
    const w = buildAgentWiki(agent({ id: 'data-agent', tools: ['gbrain', 'openclaw'] }), INDEX);
    expect(w.servers.find((s) => s.slug === 'gbrain')).toEqual({
      slug: 'gbrain', name: 'G-Brain (gbrain CLI)', mcp: true, hasPage: true,
    });
    expect(w.servers.find((s) => s.slug === 'openclaw')).toEqual({
      slug: 'openclaw', name: 'Openclaw', mcp: false, hasPage: false,
    });
  });

  test('no tools → no servers', () => {
    expect(buildAgentWiki(agent({ id: 'x', tools: [] }), INDEX).servers).toEqual([]);
  });
});

describe('buildToolWiki', () => {
  test('takes its name, summary and fields from the tool page', () => {
    const gbrain = buildToolWiki('gbrain', ['Data Agent'], INDEX);
    expect(gbrain.name).toBe('G-Brain (gbrain CLI)');
    expect(gbrain.summary).toBe('Hybrid search over the store.');
    expect(gbrain.fields).toEqual({ Category: 'Knowledge', Status: 'connected' });
    expect(gbrain.path).toBe('brain-store/tools/gbrain.md');
    expect(gbrain.usedBy).toEqual(['Data Agent']);
    expect(gbrain.backlinks.map((b) => b.slug)).toEqual(['agents/data-agent']);
    expect(gbrain.mcp).toBe(true);
    expect(gbrain.kind).toBe('MCP server');
  });

  test('a tool with no page is reported as having none, never given a made-up one', () => {
    const t = buildToolWiki('some-new-tool', [], INDEX);
    expect(t.hasPage).toBe(false);
    expect(t.path).toBeNull();
    expect(t.summary).toBe('');
    expect(t.name).toBe('Some New Tool');
  });

  test('works with no index at all, and admits it has no page', () => {
    const t = buildToolWiki('attio');
    expect(t.hasPage).toBe(false);
    expect(t.mcp).toBe(true);
    expect(t.usedBy).toEqual([]);
  });
});
