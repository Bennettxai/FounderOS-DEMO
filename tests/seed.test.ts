import { afterEach, describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';

let db: FounderDb;

afterEach(() => {
  db?.close();
});

describe('seedDatabase', () => {
  test('populates every entity', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    expect(db.departments.all().length).toBeGreaterThanOrEqual(5);
    expect(db.agents.all().length).toBeGreaterThanOrEqual(5);
    expect(db.tools.all().length).toBeGreaterThanOrEqual(8);
    expect(db.roadmap.all().length).toBeGreaterThanOrEqual(10);
    expect(db.metrics.all().length).toBeGreaterThanOrEqual(4);
    expect(db.domains.all().length).toBeGreaterThanOrEqual(8);
    expect(db.phases.all().length).toBeGreaterThanOrEqual(3);
    expect(db.workflows.all().length).toBeGreaterThanOrEqual(2);
    expect(db.workflows.all().every((w) => w.steps.length >= 3)).toBe(true);
    expect(db.skills.all().length).toBeGreaterThanOrEqual(8);
    expect(db.agentTasks.all().length).toBeGreaterThanOrEqual(8);
  });

  test('every agent belongs to an existing department', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const deptIds = new Set(db.departments.all().map((d) => d.id));
    for (const agent of db.agents.all()) {
      expect(deptIds.has(agent.departmentId)).toBe(true);
    }
  });

  test('every seeded agent maps to a real runtime agent — no larp', async () => {
    const { realAgents } = await import('@/lib/agents/real');
    db = openDb(':memory:');
    seedDatabase(db);
    const runtimeIds = new Set(realAgents.map((a) => a.id));
    for (const agent of db.agents.all()) {
      expect(runtimeIds.has(agent.id)).toBe(true);
    }
  });

  test('the seven operating pillars, in order', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    expect(db.departments.all().map((d) => d.name)).toEqual([
      'Diagnostic Maps',
      'Field Ops',
      'Development',
      'Research',
      'Models',
      'Picks',
      'Operations',
    ]);
  });

  test('agents are homed in the right department', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const byId = new Map(db.agents.all().map((a) => [a.id, a.departmentId]));
    // Diagnostic Maps: the fleet crew
    for (const id of ['map-builder', 'guided-qa', 'fleet-coverage']) {
      expect(byId.get(id)).toBe('dept-diagmaps');
    }
    // Field Ops: the OpenFieldPro lanes
    for (const id of ['fieldops-agent', 'release-gate', 'ops-data']) {
      expect(byId.get(id)).toBe('dept-fieldops');
    }
    // Development: code + test
    for (const id of ['dev-agent', 'code-worker', 'test-worker']) {
      expect(byId.get(id)).toBe('dept-dev');
    }
    // Research: bounties, SurfSense, knowledge
    for (const id of ['research-agent', 'bounty-radar', 'surf-research', 'data-agent']) {
      expect(byId.get(id)).toBe('dept-research');
    }
    // Models: eval + training
    for (const id of ['models-agent', 'eval-runner', 'training-run']) {
      expect(byId.get(id)).toBe('dept-models');
    }
    // Picks: the Brainz bots
    for (const id of ['picks-agent', 'sportsclaw', 'tradingdesk', 'sysbot']) {
      expect(byId.get(id)).toBe('dept-picks');
    }
    // Operations: cron, github, drift, orchestrator
    for (const id of ['ops-agent', 'cron-health', 'github-agent', 'drift-sentinel', 'conductor']) {
      expect(byId.get(id)).toBe('dept-ops');
    }
  });

  test('re-seeding removes departments that left the model', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    db.departments.insert({ id: 'dept-ghost', name: 'Ghost', slug: 'ghost', tagline: '', color: '#fff', order: 99 });
    seedDatabase(db);
    expect(db.departments.all().some((d) => d.id === 'dept-ghost')).toBe(false);
  });

  test('instance agents have task workers parented beneath them', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const byId = new Map(db.agents.all().map((a) => [a.id, a]));

    // DiagMaps: the QA + fleet workers hang off the map builder
    for (const worker of ['guided-qa', 'fleet-coverage']) {
      expect(byId.get(worker)?.parentId).toBe('map-builder');
      expect(byId.get(worker)?.tier).toBe('worker');
    }
    // Field Ops
    for (const worker of ['release-gate', 'ops-data']) {
      expect(byId.get(worker)?.parentId).toBe('fieldops-agent');
    }
    // Development
    for (const worker of ['code-worker', 'test-worker']) {
      expect(byId.get(worker)?.parentId).toBe('dev-agent');
    }
    // Research
    for (const worker of ['bounty-radar', 'surf-research']) {
      expect(byId.get(worker)?.parentId).toBe('research-agent');
    }
    // Models
    for (const worker of ['eval-runner', 'training-run']) {
      expect(byId.get(worker)?.parentId).toBe('models-agent');
    }
    // Picks (Brainz)
    for (const worker of ['sportsclaw', 'tradingdesk', 'sysbot']) {
      expect(byId.get(worker)?.parentId).toBe('picks-agent');
    }
    // Operations
    for (const worker of ['cron-health', 'github-agent', 'drift-sentinel']) {
      expect(byId.get(worker)?.parentId).toBe('ops-agent');
    }
    // Top-level agents are instance slots awaiting Clawline/Claude Code bindings
    expect(byId.get('map-builder')?.parentId).toBeNull();
    expect(byId.get('map-builder')?.instance).not.toBe('');
  });

  test('re-seeding removes agents that left the roster', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    db.agents.insert({
      id: 'ghost', departmentId: 'dept-dev', name: 'Ghost', role: 'r', status: 'active',
      tier: 'lead', description: '', model: 'm', tools: [], parentId: null, instance: 'builtin',
    });
    seedDatabase(db);
    expect(db.agents.all().some((a) => a.id === 'ghost')).toBe(false);
  });

  test('is idempotent — seeding twice does not duplicate rows', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const counts = {
      departments: db.departments.all().length,
      agents: db.agents.all().length,
      tools: db.tools.all().length,
    };
    seedDatabase(db);
    expect(db.departments.all().length).toBe(counts.departments);
    expect(db.agents.all().length).toBe(counts.agents);
    expect(db.tools.all().length).toBe(counts.tools);
  });

  test('email list reflects the real Beehiiv account, not the retired ~30k larp', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const snaps = db.emailList.snapshots();
    expect(snaps.length).toBeGreaterThan(0);
    // Latest count is the seeded "Alex Rivera" subscriber count
    // Bumped deliberately as the list grows.
    expect(db.emailList.latest()?.subscribers).toBe(1850);
    // Honest shape: the list only exists from its seeded bulk import — no
    // pre-import history, and nowhere near the old dummy ~30k ramp.
    expect(snaps[0].capturedAt >= '2026-05-28').toBe(true);
    for (const s of snaps) expect(s.subscribers).toBeLessThan(6000);
  });

  test('re-seeding reconciles email history: stale dummy dropped, live snapshots kept', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    // an older DB still holding retired ~30k dummy history + a live Beehiiv snapshot
    db.emailList.insertSnapshot({ capturedAt: '2026-03-14', subscribers: 25800, source: 'seed-dummy' });
    db.emailList.insertSnapshot({ capturedAt: '2026-07-07', subscribers: 4830, source: 'beehiiv' });
    seedDatabase(db);
    const snaps = db.emailList.snapshots();
    // retired dummy history is reconciled away on re-seed...
    expect(snaps.some((s) => s.source === 'seed-dummy')).toBe(false);
    expect(snaps.some((s) => s.subscribers > 6000)).toBe(false);
    // ...but a real live-synced snapshot survives
    expect(snaps.find((s) => s.capturedAt === '2026-07-07')?.source).toBe('beehiiv');
  });

  test('seeded data passes schema validation end to end', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    // openDb repos parse rows through Zod on the way out, so a full read
    // of every table proves the seed data conforms to every schema.
    expect(() => {
      db.departments.all();
      db.agents.all();
      db.tools.all();
      db.roadmap.all();
      db.metrics.all();
      db.domains.all();
      db.phases.all();
    }).not.toThrow();
  });
});

describe('roadmap grouping', () => {
  test('groups roadmap items by quarter in chronological order', async () => {
    const { groupRoadmapByQuarter } = await import('@/lib/roadmap');
    db = openDb(':memory:');
    seedDatabase(db);
    const grouped = groupRoadmapByQuarter(db.roadmap.all());
    const quarters = grouped.map((g) => g.quarter);
    expect(quarters.length).toBeGreaterThanOrEqual(3);
    expect([...quarters].sort()).toEqual(quarters);
    for (const group of grouped) {
      expect(group.items.length).toBeGreaterThan(0);
    }
  });
});
