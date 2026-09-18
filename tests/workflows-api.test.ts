process.env.FOUNDER_OS_DB = ':memory:';

import { describe, expect, test } from 'vitest';
import { GET, POST } from '@/app/api/workflows/route';
import { PATCH, DELETE } from '@/app/api/workflows/[id]/route';
import { getDb } from '@/lib/data';

function post(body: unknown) {
  return POST(new Request('http://test/api/workflows', { method: 'POST', body: JSON.stringify(body) }));
}
function patch(id: string, body: unknown) {
  return PATCH(new Request(`http://test/api/workflows/${id}`, { method: 'PATCH', body: JSON.stringify(body) }), {
    params: { id },
  });
}
function del(id: string) {
  return DELETE(new Request(`http://test/api/workflows/${id}`, { method: 'DELETE' }), { params: { id } });
}

const basicInput = {
  name: 'Test onboarding flow',
  subtitle: 'A workflow authored through the API test.',
  steps: [
    {
      title: 'Kickoff',
      detail: 'Opens the kickoff packet.',
      ownerKind: 'agent',
      owner: 'Test Agent',
      hoursPerWeek: 1,
      tools: ['notion'],
      automation: null,
      branchFromIndex: null,
      branchCondition: null,
    },
    {
      title: 'Approved path',
      detail: 'Runs once approved.',
      ownerKind: 'agent',
      owner: 'Test Agent',
      hoursPerWeek: 0,
      tools: [],
      automation: { title: 'Auto-approve', state: 'live', recoveredUsd: 0 },
      branchFromIndex: 0,
      branchCondition: 'approved',
    },
  ],
};

describe('GET /api/workflows', () => {
  test('lists exactly what the workflows table holds (the operator seeds its two machines; Slab seeded none)', async () => {
    const body = await (await GET()).json();
    expect(body.workflows.map((w: { id: string }) => w.id)).toEqual(getDb().workflows.all().map((w) => w.id));
  });
});

describe('POST /api/workflows', () => {
  test('creates a workflow, generating a fresh id, step ids, and resolving branchFromIndex to a real branch.from', async () => {
    const res = await post(basicInput);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.workflow.name).toBe('Test onboarding flow');
    expect(body.workflow.id).toMatch(/^wf-test-onboarding-flow-[0-9a-f]{6}$/);
    expect(body.workflow.steps).toHaveLength(2);
    const [first, second] = body.workflow.steps;
    expect(first.branch).toBeNull();
    expect(second.branch).toEqual({ from: first.id, condition: 'approved' });

    // actually persisted, readable back through the repo
    expect(getDb().workflows.get(body.workflow.id)).toEqual(body.workflow);
  });

  test('appends new workflows after the existing max order', async () => {
    const before = getDb().workflows.all();
    const maxOrder = before.reduce((m, w) => Math.max(m, w.order), -1);
    const res = await post(basicInput);
    const body = await res.json();
    expect(body.workflow.order).toBe(maxOrder + 1);
  });

  test('rejects a missing name with 400 and does not touch the db', async () => {
    const before = getDb().workflows.all().length;
    const res = await post({ ...basicInput, name: '' });
    expect(res.status).toBe(400);
    expect(getDb().workflows.all().length).toBe(before);
  });

  test('rejects a step that branches from a later or equal index', async () => {
    const res = await post({
      ...basicInput,
      steps: [
        { ...basicInput.steps[0], branchFromIndex: 1 }, // points forward — invalid
        basicInput.steps[1],
      ],
    });
    expect(res.status).toBe(400);
  });

  test('rejects a workflow with zero steps', async () => {
    const res = await post({ ...basicInput, steps: [] });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/workflows/[id]', () => {
  test('updates name/subtitle/steps in place, keeping the same id and order', async () => {
    const created = await (await post(basicInput)).json();
    const res = await patch(created.workflow.id, {
      name: 'Renamed flow',
      subtitle: 'Updated.',
      steps: [basicInput.steps[0]],
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.workflow.id).toBe(created.workflow.id);
    expect(body.workflow.order).toBe(created.workflow.order);
    expect(body.workflow.name).toBe('Renamed flow');
    expect(body.workflow.steps).toHaveLength(1);
    expect(getDb().workflows.get(created.workflow.id)?.name).toBe('Renamed flow');
  });

  test('404s for an unknown workflow id', async () => {
    const res = await patch('wf-does-not-exist', basicInput);
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/workflows/[id]', () => {
  test('removes the workflow (round trip: create then delete)', async () => {
    const created = await (await post(basicInput)).json();
    expect(getDb().workflows.get(created.workflow.id)).not.toBeNull();
    const res = await del(created.workflow.id);
    expect(res.status).toBe(200);
    expect(getDb().workflows.get(created.workflow.id)).toBeNull();
  });

  test('404s for an unknown workflow id', async () => {
    const res = await del('wf-does-not-exist');
    expect(res.status).toBe(404);
  });
});
