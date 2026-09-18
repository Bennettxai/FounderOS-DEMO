import { afterEach, describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';
import { buildKnowledgeGraph, toolSlugOf } from '@/lib/knowledge-graph';
import { playbookFor } from '@/lib/sop-playbooks';
import { buildToolWiki } from '@/lib/agent-wiki';
import { buildWikiIndex } from '@/lib/brain-wiki';
import { buildBrainDocs } from '@/lib/brain-docs';
import { INTEGRATIONS } from '@/lib/integrations-catalog';

/**
 * Plaud sits everywhere Fathom sits: it is the recorder for the room the way
 * Fathom is the recorder for calls. Tools table, the sales pillar and the
 * agents that mine recordings, the SOP that does the mining, the G-Brain
 * knowledge graph (a tool node with `uses` edges), the wiki, the catalog.
 */

let db: FounderDb;
afterEach(() => db?.close());

function seeded(): FounderDb {
  db = openDb(':memory:');
  seedDatabase(db);
  return db;
}

describe('Plaud placement across the OS', () => {
  test('tools table carries Plaud next to Fathom under CRM & Revenue', () => {
    const tools = seeded().tools.all();
    const plaud = tools.find((t) => t.id === 'tool-plaud');
    expect(plaud?.name).toBe('Plaud');
    expect(plaud?.category).toBe(tools.find((t) => t.id === 'tool-recall')?.category);
    expect(plaud?.description).toMatch(/recorder/i);
  });

  test('the sales pillar, Sales Calls Data and Client Success all use plaud', () => {
    const agents = seeded().agents.all();
    for (const id of ['sales-agent', 'sales-calls-data', 'client-success']) {
      expect(agents.find((a) => a.id === id)?.tools, id).toContain('plaud');
    }
  });

  test('the call-mining SOP ingests Plaud recordings too, and its playbook builds on Plaud', () => {
    const task = seeded().sopTasks.all().find((t) => t.id === 'sop-sales-calls-data')!;
    expect(task.summary).toMatch(/Plaud/);
    expect(task.steps.some((s) => /Plaud/.test(s))).toBe(true);
    const pb = playbookFor(task);
    expect(pb.buildsOn).toContain('Plaud');
    expect(pb.breaksInto).toContain('plaud-ingest');
  });

  test('the G-Brain knowledge graph grows a Plaud tool node wired to the agents that use it', () => {
    const d = seeded();
    const graph = buildKnowledgeGraph(d.agents.all(), d.departments.all(), d.people.all(), d.sopTasks.all());
    const plaudNodes = graph.nodes.filter((n) => n.kind === 'tool' && toolSlugOf(n.id) === 'plaud');
    expect(plaudNodes.length).toBeGreaterThan(0);
    expect(plaudNodes.every((n) => n.label === 'Plaud')).toBe(true);
    const uses = graph.edges.filter((e) => e.kind === 'uses' && toolSlugOf(e.target) === 'plaud').map((e) => e.source);
    expect(uses).toContain('emp:sales-calls-data');
    expect(uses).toContain('emp:client-success');
  });

  test('wiki + catalog know the tool', () => {
    // The wiki reads the generated brain-store page, not a dictionary in the
    // code: build the docs the generator writes and index them the way the
    // /brain page does.
    const d = seeded();
    const index = buildWikiIndex(
      buildBrainDocs({
        departments: d.departments.all(),
        agents: d.agents.all(),
        people: d.people.all(),
        tasks: d.sopTasks.all(),
        tools: d.tools.all(),
      }),
    );
    const wiki = buildToolWiki('plaud', [], index);
    expect(wiki.hasPage).toBe(true);
    expect(wiki.path).toBe('brain-store/tools/plaud.md');
    expect(wiki.summary).toMatch(/recorder/i);
    expect(wiki.fields.Category).toBe('CRM & Revenue');
    // the agents that mine recordings link to it, so the page has real backlinks
    expect(wiki.backlinks.map((b) => b.slug)).toContain('agents/sales-calls-data');
    expect(INTEGRATIONS.find((i) => i.slug === 'plaud')?.connectorId).toBe('plaud');
  });
});
