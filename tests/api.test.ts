import { beforeAll, describe, expect, test } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

beforeAll(() => {
  process.env.FOUNDER_OS_DB = path.join(
    mkdtempSync(path.join(tmpdir(), 'startup-test-')),
    'test.db',
  );
});

describe('Company foundation API', () => {
  test('GET /api/agents returns the 19 registered company agents', async () => {
    const { GET } = await import('@/app/api/agents/route');

    const res = await GET();

    expect(res.status).toBe(200);

    const body = await res.json();

    expect(Array.isArray(body.agents)).toBe(true);
    expect(body.agents).toHaveLength(19);

    for (const agent of body.agents) {
      expect(agent).toHaveProperty('id');
      expect(agent).toHaveProperty('name');
      expect(agent).toHaveProperty('role');
      expect(agent).toHaveProperty('departmentId');
      expect(agent).toHaveProperty('status');
    }
  });

  test('GET /api/departments returns the 3 company departments in order', async () => {
    const { GET } = await import('@/app/api/departments/route');

    const res = await GET();

    expect(res.status).toBe(200);

    const body = await res.json();

    expect(body.departments).toHaveLength(3);

    expect(
      body.departments.map(
        (department: { id: string }) => department.id,
      ),
    ).toEqual([
      'dept-research',
      'dept-risk',
      'dept-monitoring',
    ]);
  });
});