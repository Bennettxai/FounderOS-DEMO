import { describe, expect, test } from 'vitest';
import { LIFE_AREAS } from '@/lib/life-map';
import {
  VENTURES,
  ventureAgentSet,
  venturesForAgent,
  getVenture,
} from '@/lib/ventures';

import { realAgents } from '@/lib/agents/real';

const KNOWN_AGENTS = new Set(realAgents.map((a) => a.id));

describe('VENTURES', () => {
  test("Alex's two active income sources, each with a distinct color and brain tag", () => {
    expect(VENTURES.map((v) => v.id)).toEqual(['vantage', 'launchpad-cohort']);
    expect(new Set(VENTURES.map((v) => v.color)).size).toBe(2);
    expect(new Set(VENTURES.map((v) => v.brainTag)).size).toBe(2);
    for (const v of VENTURES) {
      expect(v.focus.length).toBeGreaterThan(0); // executive task list
      expect(v.detail.length).toBeGreaterThan(0);
    }
  });

  test('venture colors match each real brand source', () => {
    const byId = new Map(VENTURES.map((v) => [v.id, v]));
    // Vantage — sampled from VANTAGE LOGO (spring green)
    expect(byId.get('vantage')?.color).toBe('#00ffaa');
    // Launchpad Cohort — hsl(355 70% 50%) from the live site theme + brand guide
    expect(byId.get('launchpad-cohort')?.color).toBe('#d9263f');
  });

  test('Personal Brand (brand-deals) is retired from the venture lens', () => {
    expect(getVenture('brand-deals')).toBeNull();
    expect(VENTURES.some((v) => v.label === 'Personal Brand')).toBe(false);
  });

  test('venture colors do not collide with life-area colors', () => {
    const areaColors = new Set(LIFE_AREAS.map((a) => a.color));
    for (const v of VENTURES) expect(areaColors.has(v.color)).toBe(false);
  });

  test('every areaAgents key is a real life area; every agent id is real', () => {
    const areaIds = new Set(LIFE_AREAS.map((a) => a.id));
    for (const v of VENTURES) {
      for (const [areaId, agents] of Object.entries(v.areaAgents)) {
        expect(areaIds.has(areaId), `unknown area ${areaId} in ${v.id}`).toBe(true);
        for (const id of agents) {
          expect(KNOWN_AGENTS.has(id), `unknown agent ${id} in ${v.id}/${areaId}`).toBe(true);
        }
      }
    }
  });

  test('every venture staffs marketing, communication, and finances at minimum', () => {
    for (const v of VENTURES) {
      for (const required of ['marketing', 'communication', 'finances']) {
        expect(
          (v.areaAgents[required] ?? []).length,
          `${v.id} has no agents on ${required}`,
        ).toBeGreaterThan(0);
      }
    }
  });
});

describe('lookups', () => {
  test('getVenture resolves by id and returns null for unknowns', () => {
    expect(getVenture('vantage')?.label).toBe('Vantage');
    expect(getVenture('nope')).toBeNull();
  });

  test('ventureAgentSet unions all areas for a venture', () => {
    const set = ventureAgentSet('vantage');
    const vantage = getVenture('vantage')!;
    for (const agents of Object.values(vantage.areaAgents)) {
      for (const id of agents) expect(set.has(id)).toBe(true);
    }
  });

  test('venturesForAgent reverse lookup: shared infra agents serve both ventures', () => {
    expect(venturesForAgent('conductor').map((v) => v.id)).toEqual([
      'vantage', 'launchpad-cohort',
    ]);
  });

  test('whatsapp-worker serves launchpad-cohort (students live on WhatsApp)', () => {
    expect(venturesForAgent('whatsapp-worker').some((v) => v.id === 'launchpad-cohort')).toBe(true);
  });
});
