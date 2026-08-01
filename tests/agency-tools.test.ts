import { afterEach, describe, expect, test } from 'vitest';
import { webinarjamStatus, listRegistrants } from '@/lib/connectors/webinarjam';
import { trakyoStatus } from '@/lib/connectors/trakyo';

const WJ = 'WEBINARJAM_API_KEY';
const TK = 'TRAKYO_API_KEY';
const prevWj = process.env[WJ];
const prevTk = process.env[TK];

afterEach(() => {
  if (prevWj === undefined) delete process.env[WJ];
  else process.env[WJ] = prevWj;
  if (prevTk === undefined) delete process.env[TK];
  else process.env[TK] = prevTk;
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('webinarjamStatus', () => {
  test('not_configured without a key — and makes no network call', async () => {
    delete process.env[WJ];
    let called = false;
    const status = await webinarjamStatus((async () => {
      called = true;
      return json({});
    }) as typeof fetch);
    expect(status.state).toBe('not_configured');
    expect(status.id).toBe('webinarjam');
    expect(status.kind).toBe('crm');
    expect(called).toBe(false);
  });

  test('connected when the key validates against the webinars endpoint', async () => {
    process.env[WJ] = 'wj_test';
    const status = await webinarjamStatus((async () =>
      json({ status: 'success', webinars: [{ webinar_id: 1 }, { webinar_id: 2 }] })) as typeof fetch);
    expect(status.state).toBe('connected');
    expect(status.detail).toContain('2');
  });

  test('error when the key is present but the API rejects it', async () => {
    process.env[WJ] = 'bad';
    const status = await webinarjamStatus((async () => json({ error: 'unauthorized' }, 401)) as typeof fetch);
    expect(status.state).toBe('error');
  });

  test('listRegistrants posts api_key + ids and returns the registrants', async () => {
    process.env[WJ] = 'wj_test';
    let sentBody = '';
    const regs = await listRegistrants('123', '456', (async (_url: string, init: RequestInit) => {
      sentBody = String(init.body);
      return json({ status: 'success', registrants: [{ name: 'Lead A' }] });
    }) as typeof fetch);
    expect(regs).toHaveLength(1);
    expect(sentBody).toContain('123'); // webinar_id in the form body
    expect(sentBody).toContain('456'); // schedule_id
  });
});

describe('trakyoStatus', () => {
  test('honest not_configured: no public API / no key yet', async () => {
    delete process.env[TK];
    const status = await trakyoStatus();
    expect(status.state).toBe('not_configured');
    expect(status.id).toBe('trakyo');
    expect(status.kind).toBe('crm');
  });

  test('connected once a key is provided', async () => {
    process.env[TK] = 'tk_test';
    const status = await trakyoStatus();
    expect(status.state).toBe('connected');
  });
});
