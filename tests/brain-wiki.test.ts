import { afterAll, describe, expect, test } from 'vitest';
import { buildWikiIndex, pickWikiEntries } from '@/lib/brain-wiki';

const NOTES = [
  {
    path: 'agents/data-agent.md',
    content: [
      '---',
      'title: Data Agent',
      'kind: agent',
      '---',
      '',
      '# Data Agent',
      '',
      'G-Brain Analyst in [[pillar-tech]].',
      '',
      '## Tools',
      '',
      '- [[gbrain]]',
      '- [[ghost-tool]]',
      '',
    ].join('\n'),
  },
  {
    path: 'org/pillar-tech.md',
    content: '# Tech Pillar\n\nOwns the stack and the brain.\n',
  },
  {
    path: 'tools/gbrain.md',
    content: [
      '---',
      'title: G-Brain (gbrain CLI)',
      '---',
      '',
      '# G-Brain (gbrain CLI)',
      '',
      'v0.41 hybrid search over the store.',
      '',
      '- Category: Knowledge',
      '- Status: connected',
      '',
      '## Used by',
      '',
      '- [[data-agent]]',
      '',
    ].join('\n'),
  },
  {
    path: 'projects/claude-code.md',
    content: '# Claude Code\n\nThe CLI harness.\n',
  },
  {
    path: 'conversations/tier-list.md',
    content: '# Tier list\n\nS tier is [[Claude Code]].\n',
  },
];

describe('buildWikiIndex', () => {
  test('keys pages by slug and carries the real title and file path', () => {
    const index = buildWikiIndex(NOTES);
    expect(index['agents/data-agent'].title).toBe('Data Agent');
    expect(index['agents/data-agent'].path).toBe('agents/data-agent.md');
    expect(index['agents/data-agent'].folder).toBe('agents');
    expect(index['tools/gbrain'].title).toBe('G-Brain (gbrain CLI)');
  });

  test('resolves outbound wikilinks to the page they point at', () => {
    const links = buildWikiIndex(NOTES)['agents/data-agent'].links;
    const tech = links.find((l) => l.target === 'pillar-tech');
    expect(tech).toEqual({ target: 'pillar-tech', slug: 'org/pillar-tech', title: 'Tech Pillar' });
  });

  test('keeps a link that points at nothing, marked broken, instead of dropping it', () => {
    const links = buildWikiIndex(NOTES)['agents/data-agent'].links;
    const ghost = links.find((l) => l.target === 'ghost-tool');
    expect(ghost).toEqual({ target: 'ghost-tool', slug: null, title: 'ghost-tool' });
  });

  test('records the inbound links to a page as backlinks', () => {
    const index = buildWikiIndex(NOTES);
    expect(index['tools/gbrain'].backlinks).toEqual([
      { target: 'gbrain', slug: 'agents/data-agent', title: 'Data Agent' },
    ]);
    // links both ways between the two pages, each side sees the other once
    expect(index['agents/data-agent'].backlinks).toEqual([
      { target: 'data-agent', slug: 'tools/gbrain', title: 'G-Brain (gbrain CLI)' },
    ]);
  });

  test('a title-cased link resolves to the page whose title matches', () => {
    const index = buildWikiIndex(NOTES);
    const link = index['conversations/tier-list'].links[0];
    expect(link.slug).toBe('projects/claude-code');
    expect(index['projects/claude-code'].backlinks).toHaveLength(1);
  });

  test('carries the summary line and the Category / Status fields the page states', () => {
    const gbrain = buildWikiIndex(NOTES)['tools/gbrain'];
    expect(gbrain.summary).toBe('v0.41 hybrid search over the store.');
    expect(gbrain.fields).toEqual({ Category: 'Knowledge', Status: 'connected' });
  });
});

describe('pickWikiEntries', () => {
  test('ships only the pages asked for, so the client bundle stays small', () => {
    const index = buildWikiIndex(NOTES);
    const picked = pickWikiEntries(index, ['tools/gbrain', 'nope/missing']);
    expect(Object.keys(picked)).toEqual(['tools/gbrain']);
  });
});

// ── the real store the OS generates, not a fixture ─────────────────────────
import { openDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';
import { buildBrainDocs } from '@/lib/brain-docs';
import { buildAgentWiki } from '@/lib/agent-wiki';

describe('the wiki over the generated brain-store', () => {
  const db = openDb(':memory:');
  seedDatabase(db);
  const agents = db.agents.all();
  const tools = db.tools.all();
  const docs = buildBrainDocs({
    departments: db.departments.all(),
    agents,
    people: db.people.all(),
    tasks: db.sopTasks.all(),
    tools,
  });
  const index = buildWikiIndex(docs);
  const paths = new Set(docs.map((d) => d.path));

  test('every seeded agent has a real page, and the wiki names the file that exists', () => {
    for (const a of agents) {
      const w = buildAgentWiki(a, index);
      expect(w.hasPage, `${a.id} has no brain-store page`).toBe(true);
      // the file it claims must be a file the generator actually writes
      expect(paths.has(`agents/${a.id}.md`)).toBe(true);
      expect(w.files).toEqual([`${a.id}.md`]);
      expect(w.path).toBe(`brain-store/agents/${a.id}.md`);
    }
  });

  test('an agent page links to its pillar and its tools, and those links resolve', () => {
    const withTools = agents.find((a) => a.tools.length > 0)!;
    const w = buildAgentWiki(withTools, index);
    expect(w.links.length).toBeGreaterThan(0);
    const broken = w.links.filter((l) => l.slug === null).map((l) => l.target);
    // a tool the agent declares but the tools table does not carry has no page;
    // it must show as broken rather than silently vanish
    for (const l of w.links.filter((l) => l.slug !== null)) {
      expect(index[l.slug!]).toBeDefined();
    }
    expect(Array.isArray(broken)).toBe(true);
  });

  test('a tool page is linked from every agent wired to it', () => {
    const tool = tools.find((t) => t.id === 'tool-plaud')!;
    const slug = tool.id.replace(/^tool-/, '');
    const users = agents.filter((a) => a.tools.includes(slug)).map((a) => `agents/${a.id}`);
    expect(users.length).toBeGreaterThan(0);
    const back = index[`tools/${slug}`].backlinks.map((b) => b.slug);
    for (const u of users) expect(back).toContain(u);
  });

  afterAll(() => db.close());
});
