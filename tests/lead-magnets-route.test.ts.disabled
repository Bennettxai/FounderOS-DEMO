import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GET, POST } from '@/app/api/lead-magnets/route';

/** POST /api/lead-magnets is how a lead magnet gets registered from inside the
 *  OS: the create form on /content/lead-magnets and a content pipeline both
 *  post here after a page is deployed. */

let dir: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lm-route-'));
  process.env.FOUNDER_OS_DB = path.join(dir, 'test.db');
});

afterAll(() => {
  delete process.env.FOUNDER_OS_DB;
  fs.rmSync(dir, { recursive: true, force: true });
});

const post = (body: unknown) =>
  POST(new Request('http://x/api/lead-magnets', { method: 'POST', body: JSON.stringify(body) }));

describe('POST /api/lead-magnets', () => {
  it('creates one, slugs the id, stamps origin os and today', async () => {
    const res = await post({
      name: 'The Operator Teardown',
      url: 'https://teardown.example.com',
      offer: 'The workflow pulled apart, step by step',
      source: 'Short (comment TEARDOWN)',
    });
    expect(res.status).toBe(201);
    const { leadMagnet } = (await res.json()) as { leadMagnet: Record<string, string> };
    expect(leadMagnet.id).toBe('the-operator-teardown');
    expect(leadMagnet.origin).toBe('os');
    expect(leadMagnet.status).toBe('live'); // sensible default
    expect(leadMagnet.captures).toBe('email');
    expect(leadMagnet.launchedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('never collides an id with an existing row', async () => {
    const res = await post({ name: 'The Operator Teardown', url: 'https://example.com/again' });
    const { leadMagnet } = (await res.json()) as { leadMagnet: { id: string } };
    expect(leadMagnet.id).toBe('the-operator-teardown-2');
  });

  it('400s on a bad url rather than storing junk', async () => {
    const res = await post({ name: 'Broken', url: 'not-a-url' });
    expect(res.status).toBe(400);
  });

  it('400s when the name is missing', async () => {
    const res = await post({ url: 'https://example.com' });
    expect(res.status).toBe(400);
  });

  it('GET lists what was created', async () => {
    const body = (await (await GET()).json()) as { leadMagnets: { id: string }[] };
    expect(body.leadMagnets.map((m) => m.id)).toContain('the-operator-teardown');
  });
});
