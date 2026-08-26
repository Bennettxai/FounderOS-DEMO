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
  test("Nik's two active ventures, each with a distinct color and brain tag", () => {
    expect(VENTURES.map((v) => v.id)).toEqual(['diagnostic-maps', 'openfieldpro']);
    expect(new Set(VENTURES.map((v) => v.color)).size).toBe(2);
    expect(new Set(VENTURES.map((v) => v.brainTag)).size).toBe(2);
    for (const v of VENTURES) {
      expect(v.focus.length).toBeGreaterThan(0); // executive task list
      expect(v.detail.length).toBeGreaterThan(0);
    }
  });

  test('venture colors match each real brand source', () => {
    const byId = new Map(VENTURES.map((v) => [v.id, v]));
    // Diagnostic Maps — deep teal, distinct from the life areas
    expect(byId.get('diagnostic-maps')?.color).toBe('#0d9488');
    // OpenFieldPro — the platform's spring green
    expect(byId.get('openfieldpro')?.color).toBe('#00ffaa');
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

  test('every venture staffs research and operations at minimum', () => {
    for (const v of VENTURES) {
      for (const required of ['research', 'operations']) {
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
    expect(getVenture('diagnostic-maps')?.label).toBe('Diagnostic Maps');
    expect(getVenture('nope')).toBeNull();
  });

  test('ventureAgentSet unions all areas for a venture', () => {
    const set = ventureAgentSet('diagnostic-maps');
    const dm = getVenture('diagnostic-maps')!;
    for (const agents of Object.values(dm.areaAgents)) {
      for (const id of agents) expect(set.has(id)).toBe(true);
    }
  });

  test('venturesForAgent reverse lookup: shared infra agents serve both ventures', () => {
    expect(venturesForAgent('conductor').map((v) => v.id)).toEqual([
      'diagnostic-maps', 'openfieldpro',
    ]);
  });

  test('data-agent serves both ventures (shared knowledge base)', () => {
    expect(venturesForAgent('data-agent').map((v) => v.id)).toEqual([
      'diagnostic-maps', 'openfieldpro',
    ]);
  });
});
