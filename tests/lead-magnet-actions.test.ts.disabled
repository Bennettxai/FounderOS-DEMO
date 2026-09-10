import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { POST } from '@/app/api/lead-magnets/route';
import { PATCH, DELETE } from '@/app/api/lead-magnets/[id]/route';

/**
 * Rounding out the panel a register you can only add to
 * is half a tool. A row has to be retirable and editable from the same page.
 */

let dir: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lm-actions-'));
  process.env.FOUNDER_OS_DB = path.join(dir, 'test.db');
});

afterAll(() => {
  delete process.env.FOUNDER_OS_DB;
  fs.rmSync(dir, { recursive: true, force: true });
});

const create = async (name: string, url = 'https://example.com/x') => {
  const res = await POST(
    new Request('http://x/api/lead-magnets', { method: 'POST', body: JSON.stringify({ name, url }) }),
  );
  const { leadMagnet } = (await res.json()) as { leadMagnet: { id: string } };
  return leadMagnet.id;
};

const patch = (id: string, body: unknown) =>
  PATCH(new Request(`http://x/api/lead-magnets/${id}`, { method: 'PATCH', body: JSON.stringify(body) }), {
    params: { id },
  });

describe('PATCH /api/lead-magnets/[id]', () => {
  it('changes status without touching anything else', async () => {
    const id = await create('Retire Me');
    const res = await patch(id, { status: 'archived' });
    expect(res.status).toBe(200);
    const { leadMagnet } = (await res.json()) as { leadMagnet: Record<string, string> };
    expect(leadMagnet.status).toBe('archived');
    expect(leadMagnet.name).toBe('Retire Me'); // untouched
  });

  it('edits the fields a page actually needs corrected', async () => {
    const id = await create('Typo Nmae');
    const res = await patch(id, { name: 'Typo Name', url: 'https://example.com/fixed', notes: 'renamed' });
    const { leadMagnet } = (await res.json()) as { leadMagnet: Record<string, string> };
    expect(leadMagnet.name).toBe('Typo Name');
    expect(leadMagnet.url).toBe('https://example.com/fixed');
    expect(leadMagnet.notes).toBe('renamed');
  });

  it('404s on a row that does not exist', async () => {
    expect((await patch('nope', { status: 'paused' })).status).toBe(404);
  });

  it('400s on an invalid status rather than storing it', async () => {
    const id = await create('Bad Status');
    expect((await patch(id, { status: 'sideways' })).status).toBe(400);
  });

  it('400s on a url that is not a url', async () => {
    const id = await create('Bad Url');
    expect((await patch(id, { url: 'nope' })).status).toBe(400);
  });
});

describe('DELETE /api/lead-magnets/[id]', () => {
  it('removes the row', async () => {
    const id = await create('Delete Me');
    const res = await DELETE(new Request('http://x', { method: 'DELETE' }), { params: { id } });
    expect(res.status).toBe(200);
    const after = await patch(id, { status: 'live' });
    expect(after.status, 'the row should be gone').toBe(404);
  });

  it('404s when it was never there', async () => {
    const res = await DELETE(new Request('http://x', { method: 'DELETE' }), { params: { id: 'ghost' } });
    expect(res.status).toBe(404);
  });
});
