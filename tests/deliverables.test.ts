import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';

/**
 * Agent deliverables (the operator, 2026-08-11): Paperclip agents write files into
 * workspace deliverables/ folders; the OS lists and serves them. The download
 * route reads real files off disk, so the path guard is the security line.
 */
let dir: string;

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'founder-os-deliverables-'));
  mkdirSync(path.join(dir, 'ws-1', 'deliverables'), { recursive: true });
  writeFileSync(path.join(dir, 'ws-1', 'deliverables', 'plan.pdf'), 'pdf-bytes');
  writeFileSync(path.join(dir, 'ws-1', 'secret.env'), 'KEY=nope'); // NOT in deliverables/
  process.env.PAPERCLIP_WORKSPACES_DIR = dir;
});

describe('resolveDeliverable — the traversal guard', () => {
  test('a clean <workspace>/<file> key resolves inside deliverables/', async () => {
    const { resolveDeliverable } = await import('@/lib/board-deliverables');
    expect(resolveDeliverable('ws-1/plan.pdf', dir)).toBe(path.join(dir, 'ws-1', 'deliverables', 'plan.pdf'));
  });

  test('traversal, nesting, and sibling-file tricks are all rejected', async () => {
    const { resolveDeliverable } = await import('@/lib/board-deliverables');
    for (const evil of [
      '../../../etc/passwd',
      'ws-1/../ws-1/deliverables/plan.pdf',
      'ws-1/deliverables/../secret.env',
      'ws-1/a/b',
      '/absolute/path',
      'ws-1/',
      '',
    ]) {
      expect(resolveDeliverable(evil, dir), evil).toBeNull();
    }
  });
});

describe('GET /api/board/deliverables', () => {
  test('lists workspace deliverables newest-first with download keys', async () => {
    const { GET } = await import('@/app/api/board/deliverables/route');
    const res = (await GET(new Request('http://localhost/api/board/deliverables'))) as Response;
    expect(res.status).toBe(200);
    const body = (await res.json()) as { deliverables: { id: string; name: string }[] };
    expect(body.deliverables.map((d) => d.id)).toContain('ws-1/plan.pdf');
    // the sibling secret.env outside deliverables/ is never listed
    expect(body.deliverables.some((d) => d.name === 'secret.env')).toBe(false);
  });

  test('?file= streams the file as an attachment', async () => {
    const { GET } = await import('@/app/api/board/deliverables/route');
    const res = (await GET(
      new Request('http://localhost/api/board/deliverables?file=ws-1%2Fplan.pdf'),
    )) as Response;
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Content-Disposition')).toContain('plan.pdf');
    expect(await res.text()).toBe('pdf-bytes');
  });

  test('bad keys 400, missing files 404, never a disk read outside the base', async () => {
    const { GET } = await import('@/app/api/board/deliverables/route');
    const bad = (await GET(
      new Request('http://localhost/api/board/deliverables?file=..%2F..%2Fetc%2Fpasswd'),
    )) as Response;
    expect(bad.status).toBe(400);
    const missing = (await GET(
      new Request('http://localhost/api/board/deliverables?file=ws-1%2Fnope.pdf'),
    )) as Response;
    expect(missing.status).toBe(404);
  });
});

describe('the /agents surface', () => {
  test('Deliverables rides as a tab with the download list', async () => {
    const { readFileSync } = await import('node:fs');
    const tabs = readFileSync(path.join(process.cwd(), 'components', 'AgentsTabs.tsx'), 'utf8');
    expect(tabs).toContain("'deliverables'");
    expect(tabs).toContain('<DeliverablesList');
    const list = readFileSync(path.join(process.cwd(), 'components', 'DeliverablesList.tsx'), 'utf8');
    expect(list).toContain('/api/board/deliverables');
    // The empty-state copy changed when proposals joined as folders (2026-08-17):
    // it must still explain the board-host caveat, since a dev machine seeing
    // nothing is expected rather than broken.
    expect(list).toMatch(/Nothing in review yet/);
    expect(list).toMatch(/board host/);
    // proposals render as their own folders, above the agent files
    expect(list).toContain('group.name');
    expect(list).toMatch(/kind === 'link'/);
  });
});
