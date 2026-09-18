import { beforeAll, describe, expect, test } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * The route contract. The policy itself is covered by tests/agent-failover.test.ts;
 * what matters here is that an unreachable board degrades honestly instead of
 * throwing, because this route runs unattended on a timer.
 */
beforeAll(() => {
  process.env.FOUNDER_OS_DB = path.join(mkdtempSync(path.join(tmpdir(), 'founder-os-failover-')), 'test.db');
  // No board creds: the connector must return empty rather than reach the private network.
  delete process.env.PAPERCLIP_API_URL;
  delete process.env.PAPERCLIP_BOARD_KEY;
  delete process.env.PAPERCLIP_COMPANY_ID;
});

describe('/api/agents/failover', () => {
  test('GET is a dry run: 200, writes nothing, says it inspected nothing', async () => {
    const { GET } = await import('@/app/api/agents/failover/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.applied).toBe(false);
    expect(body.actions).toEqual([]);
    expect(body.inspected).toBe(0);
    expect(body.notes.join(' ')).toMatch(/unreachable|unconfigured/i);
  });

  test('POST with an unreachable board is a no-op, not a 500', async () => {
    const { POST } = await import('@/app/api/agents/failover/route');
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.applied).toBe(true);
    expect(body.actions).toEqual([]);
    expect(body.exhausted).toEqual([]);
    expect(body.resumes).toEqual([]);
    expect(body.alerts).toEqual([]);
  });
});

describe('failover route source contract', () => {
  test('it never replaces the whole adapterConfig, only the model', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync('lib/connectors/paperclip.ts', 'utf8'),
    );
    // replaceAdapterConfig:true would wipe instructionsFilePath and the
    // permission flags off the seat. The merge is the whole safety property.
    // the flag may be DISCUSSED in a comment; what matters is it is never sent
    expect(src).not.toMatch(/replaceAdapterConfig\s*:/);
    expect(src).toMatch(/adapterConfig: \{ model \}/);
  });

  test('the connector hands the classifier resultJson.summary, not just error', async () => {
    // 2026-09-05: Paperclip filed the Codex quota failure as error "Internal
    // error" with the real wording in resultJson.summary. The loop was blind.
    const src = await import('node:fs').then((fs) => fs.readFileSync('lib/connectors/paperclip.ts', 'utf8'));
    expect(src).toMatch(/resultJson/);
    expect(src).toMatch(/summary: str\(/);
  });

  test('the route applies resumes and posts alerts, so a parked seat is never silent', async () => {
    const src = await import('node:fs').then((fs) => fs.readFileSync('app/api/agents/failover/route.ts', 'utf8'));
    expect(src).toMatch(/plan\.resumes/);
    expect(src).toMatch(/plan\.alerts/);
    expect(src).toMatch(/postFailoverAlert/);
  });
});

/**
 * The tick is the whole point: a policy nobody runs is a policy that does not
 * exist. It is easy to lose in an instrumentation refactor, so pin it.
 */
describe('the failover tick is actually wired', () => {
  test('instrumentation POSTs the failover route on an interval', async () => {
    const src = await import('node:fs').then((fs) => fs.readFileSync('instrumentation.ts', 'utf8'));
    expect(src).toMatch(/\/api\/agents\/failover/);
    expect(src).toMatch(/setInterval\(tick/);
    // It must reach the route over HTTP: importing the connectors here pulls
    // node-only deps into the edge trace and fails the build outright.
    expect(src).not.toMatch(/from '@\/lib\/connectors/);
  });
});
