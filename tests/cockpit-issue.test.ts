import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { cockpitIssueCreateBody, cockpitRepairPatch, COCKPIT_TITLE } from '@/lib/cockpit-issue';

/**
 * Paperclip's successful-run handoff and stranded-issue sweep both fire on an
 * issue that is `in_progress` (or todo / in_review) with an agent assignee.
 * On 2026-09-05 that put the Conductor into a 23-run ping-pong on OS-246 and
 * burned the Codex window. The cockpit issue is a chat thread, not a task, so
 * it lives in `backlog`: both automations skip it and a new comment still
 * wakes the agent assignee. The board allows exactly one assignee (verified
 * 2026-09-06: "Issue can only have one assignee"), so that assignee is the
 * Conductor, never a human co-owner.
 */
describe('cockpit issue shape', () => {
  test('a new cockpit issue is born in backlog, assigned to the Conductor only', () => {
    const body = cockpitIssueCreateBody({ conductorId: 'c1' });
    expect(body.title).toBe(COCKPIT_TITLE);
    expect(body.status).toBe('backlog');
    expect(body.assigneeAgentId).toBe('c1');
    expect('assigneeUserId' in body).toBe(false);
    expect(body.description).toMatch(/Conductor/);
    expect(body.description).toMatch(/backlog/);
  });

  test('an unknown Conductor id is omitted rather than sent as null', () => {
    const body = cockpitIssueCreateBody({ conductorId: null });
    expect('assigneeAgentId' in body).toBe(false);
    expect(body.status).toBe('backlog');
  });
});

describe('cockpit repair guard', () => {
  test('the loop state (in_progress) is parked back in backlog', () => {
    expect(cockpitRepairPatch({ status: 'in_progress', assigneeAgentId: 'c1', assigneeUserId: null }, 'c1')).toEqual({
      status: 'backlog',
    });
  });

  test('blocked (the escalation state) is parked too', () => {
    expect(cockpitRepairPatch({ status: 'blocked', assigneeAgentId: 'c1', assigneeUserId: null }, 'c1')).toEqual({
      status: 'backlog',
    });
  });

  test('backlog with the Conductor assigned is already safe: nothing to write', () => {
    expect(cockpitRepairPatch({ status: 'backlog', assigneeAgentId: 'c1', assigneeUserId: null }, 'c1')).toBeNull();
  });

  test('a closed cockpit issue is left alone (ensureCockpitIssue replaces it)', () => {
    expect(cockpitRepairPatch({ status: 'done', assigneeAgentId: 'c1', assigneeUserId: null }, 'c1')).toBeNull();
  });

  test('a human assignee would stop comments waking the Conductor: hand it back, one assignee only', () => {
    expect(cockpitRepairPatch({ status: 'backlog', assigneeAgentId: null, assigneeUserId: 'u1' }, 'c1')).toEqual({
      assigneeAgentId: 'c1',
      assigneeUserId: null,
    });
  });

  test('no Conductor id known: still parks the status, never touches assignees', () => {
    expect(cockpitRepairPatch({ status: 'todo', assigneeAgentId: null, assigneeUserId: null }, null)).toEqual({
      status: 'backlog',
    });
  });
});

describe('wiring', () => {
  test('the connector creates and repairs the cockpit issue through the shared shape', () => {
    const src = readFileSync('lib/connectors/paperclip.ts', 'utf8');
    expect(src).toMatch(/cockpitIssueCreateBody\(/);
    expect(src).toMatch(/cockpitRepairPatch\(/);
    expect(src).toMatch(/export async function repairCockpitIssue/);
    // the board allows one assignee; the OS must never try to add a human co-owner
    expect(src).not.toMatch(/assigneeUserId: ownerUserId/);
  });

  test('the failover tick runs the repair guard every pass', () => {
    const src = readFileSync('app/api/agents/failover/route.ts', 'utf8');
    expect(src).toMatch(/repairCockpitIssue\(/);
  });
});
