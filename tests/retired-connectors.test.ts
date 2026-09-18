import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { INTEGRATIONS } from '@/lib/integrations-catalog';

/**
 * WebinarJam and Notion are retired (the operator, 2026-08-19: "remove webinar jam,
 * and notion i dont use them anymore").
 *
 * Both were permanently red on the connections board: neither key ever existed
 * on the machine, so they were two of the four systems dragging 22/26 down.
 * Retiring them is the honest fix, not planting a key.
 *
 * The two removals are deliberately DIFFERENT depths, per his call:
 *
 * - WebinarJam goes completely: connector, catalog row, seeded tool, brand
 *   marks, and the Launchpad Cohort agent's listRegistrants tool. That agent
 *   survives on Trakyo attribution alone.
 * - Notion first lost only its connector, then went entirely (2026-08-19, "i
 *   will not be using notion anymore"): the Notion Sync agent, its SOP, the
 *   onboarding agent's Notion rail and lib/connectors/notion.ts are all gone.
 *   The ONE survivor is /brand-deals, which he chose to keep: it talks to
 *   @notionhq/client directly and now stands on its seeded deals for good.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('the connections board no longer reports on either', () => {
  const registry = read('lib/connectors/index.ts');

  test('neither is registered as a live check', () => {
    expect(registry).not.toMatch(/\['webinarjam',/);
    expect(registry).not.toMatch(/\['notion',/);
  });

  test('the registry does not import a connector it no longer checks', () => {
    expect(registry).not.toContain("from '@/lib/connectors/webinarjam'");
    expect(registry).not.toContain("from '@/lib/connectors/notion'");
  });

  test('neither is offered in the integrations catalog', () => {
    const slugs = INTEGRATIONS.map((i) => i.slug);
    expect(slugs).not.toContain('webinarjam');
    expect(slugs).not.toContain('notion');
    // and the catalog is still a catalog, not emptied out by the scrub
    expect(INTEGRATIONS.length).toBeGreaterThanOrEqual(28);
  });
});

describe('WebinarJam is gone all the way down', () => {
  test('the connector module itself is deleted', () => {
    expect(existsSync(join(process.cwd(), 'lib/connectors/webinarjam.ts'))).toBe(false);
  });

  test('the Launchpad Cohort agent drops the tool and runs on Trakyo', () => {
    const agents = read('lib/agents/real.ts');
    expect(agents).not.toContain('webinarjam');
    expect(agents).not.toContain('listRegistrants');
    expect(agents).not.toContain('WEBINARJAM_API_KEY');
    // the agent survives the removal rather than going with it
    expect(agents).toContain('Launchpad Cohort');
    expect(agents).toContain('trakyoStatus');
  });

  test('nothing seeds a WebinarJam tool, and no agent points at the dead slug', async () => {
    const { openDb } = await import('@/lib/db');
    const { seedDatabase } = await import('@/lib/seed');
    const db = openDb(':memory:');
    seedDatabase(db);
    const tools = db.tools.all();
    const agents = db.agents.all();
    db.close();

    expect(tools.map((t) => t.id)).not.toContain('tool-webinarjam');
    expect(tools.map((t) => t.name)).not.toContain('WebinarJam');
    // and nothing still points at the slug we just deleted. (agent.tools is a
    // free-text capability list, not tool-row ids — 'comms-feed' names no row
    // either — so this checks the dead slug, not referential integrity.)
    for (const a of agents) {
      expect(a.tools, `agent ${a.id}`).not.toContain('webinarjam');
    }
  });

  test('the brand marks go with it', () => {
    expect(read('lib/workflow-tool-brands.ts')).not.toContain('webinarjam');
    expect(read('lib/brand-logos.tsx')).not.toContain('webinarjam');
  });
});

describe('Notion is gone except for /brand-deals, which he kept', () => {
  test('the Brand Deals page and its route survive', () => {
    expect(existsSync(join(process.cwd(), 'app/brand-deals/page.tsx'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'app/api/brand-deals/route.ts'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'lib/connectors/brand-deals.ts'))).toBe(true);
    expect(read('lib/nav.ts')).toContain("href: '/brand-deals'");
  });

  test('the connector module is deleted and nothing imports it', () => {
    expect(existsSync(join(process.cwd(), 'lib/connectors/notion.ts'))).toBe(false);
    expect(read('lib/agents/real.ts')).not.toContain('@/lib/connectors/notion');
  });

  test('the Notion Sync agent and its SOP are gone from the seed', async () => {
    const { openDb } = await import('@/lib/db');
    const { seedDatabase } = await import('@/lib/seed');
    const db = openDb(':memory:');
    seedDatabase(db);
    const agents = db.agents.all();
    const sops = db.sopTasks.all();
    db.close();

    expect(agents.map((a) => a.id)).not.toContain('notion-sync');
    expect(sops.map((t) => t.id)).not.toContain('sop-notion-sync');
    // and no surviving agent still claims Notion as a tool
    for (const a of agents) expect(a.tools, `agent ${a.id}`).not.toContain('notion');
  });

  test('the onboarding agent runs on the two rails that are left', () => {
    const agents = read('lib/agents/real.ts');
    expect(agents).not.toContain('notionStatus');
    expect(agents).toContain('Onboarding Agent');
    expect(agents).toContain('slackStatus');
  });

  test('/brand-deals keeps the SDK it talks to directly', () => {
    expect(read('lib/connectors/brand-deals.ts')).toContain("from '@notionhq/client'");
  });
});

/**
 * Seeded copy has to keep up with what the stack check actually does.
 *
 * The local stack was rewritten on 2026-08-18 ("I'm not using OpenClaw or tmux
 * or that stuff") and Ollama was stopped on 2026-08-20, but the seeded SOP and
 * tool row still described the old world. Stale seed copy is the same sin as a
 * fake connector status: the OS saying something it cannot back up.
 */
describe('the stack-monitor SOP matches the real stack check', () => {
  test('it names no retired port or service', async () => {
    const { openDb } = await import('@/lib/db');
    const { seedDatabase } = await import('@/lib/seed');
    const db = openDb(':memory:');
    seedDatabase(db);
    const sop = db.sopTasks.all().find((t) => t.id === 'sop-stack-monitor')!;
    const tools = db.tools.all();
    db.close();

    const blob = sop.steps.join(' | ');
    // the pre-mini ports (command-center :4000, :3789, ollama :11434, openclaw :18789)
    for (const dead of ['4000', '3789', '11434', '18789', 'tmux', 'OpenClaw']) {
      expect(blob, `SOP still mentions ${dead}`).not.toContain(dead);
    }
    // and it names what local-stack.ts genuinely probes
    expect(blob).toMatch(/3100/);
    expect(blob).toMatch(/8642/);

    // a stopped service must not be seeded as connected
    const ollama = tools.find((t) => t.id === 'tool-ollama');
    expect(ollama?.status, 'Ollama is not running; seeding it connected is a demo').not.toBe('connected');
  });
});
