import { afterEach, describe, expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  archiveStatus,
  exportAttioCalls,
  exportFathomCalls,
  renderAttioCallPage,
  renderFathomCallPage,
  startArchiveJob,
  getArchiveJob,
  __resetArchiveJob,
} from '@/lib/call-archive';

/**
 * The call archive: every recorded sales call, from Attio's notetaker (being
 * cancelled) and Fathom, exported as one markdown page each into the
 * brain-store's meetings/ folder so the knowledge base keeps them after the
 * subscription ends. Idempotent by recording id (the file suffix), pure code.
 */

const tmp: string[] = [];
afterEach(() => {
  __resetArchiveJob();
  for (const d of tmp.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});
function store(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'store-'));
  tmp.push(d);
  return d;
}

const attioMeeting = (id: string, title: string, start: string) => ({
  id: { workspace_id: 'w', meeting_id: id },
  title,
  description: '',
  start: { datetime: start, timezone: 'UTC' },
  end: { datetime: start, timezone: 'UTC' },
  participants: [{ email_address: 'marco@vantage.example.com' }, { email_address: 'anthony@acme.com' }],
  linked_records: [{ object_slug: 'deals', object_id: 'o', record_id: 'rec-1' }],
});
const attioRecording = (mid: string, rid: string, withTranscript = true) => ({
  data: {
    id: { workspace_id: 'w', meeting_id: mid, call_recording_id: rid },
    status: 'completed',
    web_url: `https://app.attio.com/x/calls/${mid}/${rid}`,
    created_at: '2026-03-18T20:04:25Z',
    transcript: withTranscript
      ? {
          segments: [
            { speech: 'Hello,', start_time: 0.51, end_time: 0.81, speaker: { name: 'Marco Ellis' } },
            { speech: 'Mr Watson, come here.', start_time: 0.81, end_time: 2.11, speaker: { name: 'Marco Ellis' } },
            { speech: "I'm here.", start_time: 64.21, end_time: 64.91, speaker: { name: 'Anthony' } },
          ],
          raw_transcript: "[00:00] Marco Ellis: Hello, Mr Watson, come here.\n[01:04] Anthony: I'm here.",
        }
      : { segments: [], raw_transcript: '' },
  },
});

function attioFetch(): { fetchFn: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  const meetingsP1 = [attioMeeting('m1', 'Anthony X Vantage', '2026-03-18T20:00:00.000Z'), attioMeeting('m2', 'No recording', '2026-03-19T20:00:00.000Z')];
  const meetingsP2 = [attioMeeting('m3', 'Beta Corp discovery', '2026-04-02T15:00:00.000Z')];
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    calls.push(u);
    const headers = new Headers(init?.headers);
    if (headers.get('Authorization') !== 'Bearer atk') return new Response('{}', { status: 401 });
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (u.startsWith('https://api.attio.com/v2/meetings?')) {
      const cursor = new URL(u).searchParams.get('cursor');
      return cursor ? json({ data: meetingsP2, pagination: { next_cursor: null } }) : json({ data: meetingsP1, pagination: { next_cursor: 'c2' } });
    }
    let m = u.match(/\/v2\/meetings\/(\w+)\/call_recordings\/(\S+)$/);
    if (m) return m[1] === 'm3' ? json(attioRecording('m3', 'r3', false)) : json(attioRecording(m[1], m[2]));
    m = u.match(/\/v2\/meetings\/(\w+)\/call_recordings$/);
    if (m) {
      const recs = m[1] === 'm1' ? [{ id: { call_recording_id: 'r1' }, status: 'completed' }] : m[1] === 'm3' ? [{ id: { call_recording_id: 'r3' }, status: 'completed' }] : [];
      return json({ data: recs, pagination: { next_cursor: null } });
    }
    throw new Error(`unexpected url ${u}`);
  }) as unknown as typeof fetch;
  return { fetchFn, calls };
}

describe('renderAttioCallPage', () => {
  test('YAML frontmatter (so gbrain gets the real title), facts header, then the transcript (raw when present)', () => {
    const md = renderAttioCallPage(attioMeeting('m1', 'Anthony X Vantage', '2026-03-18T20:00:00.000Z') as never, attioRecording('m1', 'r1').data as never);
    expect(md.startsWith('---\ntitle: "Anthony X Vantage"\ntype: meeting\ndate: 2026-03-18\nsource: attio\n---\n\n# Anthony X Vantage')).toBe(true);
    expect(md).toContain('source: attio');
    expect(md).toContain('attio_call_recording_id: r1');
    expect(md).toContain('recorded: 2026-03-18T20:00:00.000Z');
    expect(md).toContain('participants: marco@vantage.example.com, anthony@acme.com');
    expect(md).toContain('linked_records: deals:rec-1');
    expect(md).toContain('url: https://app.attio.com/x/calls/m1/r1');
    expect(md).toContain('## Transcript');
    expect(md).toContain("[01:04] Anthony: I'm here.");
  });

  test('builds the transcript from segments when raw_transcript is missing, merging a speaker run', () => {
    const rec = attioRecording('m1', 'r1').data as { transcript: { raw_transcript?: string } };
    delete rec.transcript.raw_transcript;
    const md = renderAttioCallPage(attioMeeting('m1', 'T', '2026-03-18T20:00:00.000Z') as never, rec as never);
    expect(md).toContain('[00:00] Marco Ellis: Hello, Mr Watson, come here.');
    expect(md).toContain("[01:04] Anthony: I'm here.");
  });
});

describe('exportAttioCalls', () => {
  test('pages every meeting, fetches each completed recording, writes one page per transcript, idempotent', async () => {
    const dir = store();
    const { fetchFn, calls } = attioFetch();
    const r = await exportAttioCalls({ key: 'atk', storeDir: dir, fetchFn });
    expect(r.source).toBe('attio');
    expect(r.meetingsScanned).toBe(3);
    expect(r.found).toBe(2);
    expect(r.exported).toEqual(['meetings/2026-03-18-anthony-x-vantage--attio-r1.md']);
    expect(r.noTranscript).toEqual(['r3']);
    expect(r.failed).toEqual([]);
    const file = path.join(dir, 'meetings', '2026-03-18-anthony-x-vantage--attio-r1.md');
    expect(fs.readFileSync(file, 'utf8')).toContain('## Transcript');
    expect(calls.filter((c) => c.includes('?')).length).toBe(2); // two meeting pages

    const again = await exportAttioCalls({ key: 'atk', storeDir: dir, fetchFn });
    expect(again.exported).toEqual([]);
    expect(again.skippedExisting).toEqual(['r1']);
    expect(again.noTranscript).toEqual(['r3']); // retried: Attio may transcribe later
  });

  test('a rejected key fails fast with the status, nothing written', async () => {
    const dir = store();
    const { fetchFn } = attioFetch();
    await expect(exportAttioCalls({ key: 'wrong', storeDir: dir, fetchFn })).rejects.toThrow(/401/);
    expect(fs.existsSync(path.join(dir, 'meetings'))).toBe(false);
  });
});

const fathomItem = (id: number, title: string, at: string) => ({
  title,
  meeting_title: title,
  url: `https://fathom.video/calls/${id}`,
  recording_id: id,
  created_at: at,
  recording_start_time: at,
  recording_end_time: at,
  recorded_by: { name: 'Alex Rivera', email: 'alex@launchpadcohort.example.com' },
  calendar_invitees: [{ email: 'casey@example.com', name: 'Casey Example' }],
  transcript: [
    { speaker: { display_name: 'Casey Example' }, text: 'Doing well, my man.', timestamp: '00:00:00' },
    { speaker: { display_name: 'Alex Rivera' }, text: 'Tell me about the rollout.', timestamp: '00:00:04' },
  ],
  default_summary: { template_name: 'Enhanced', markdown_formatted: '## Meeting Purpose\n\nExplore AI for retention.' },
  action_items: [
    { description: 'Draft proposal w/ CTO', completed: false, recording_timestamp: '00:31:12', assignee: { name: 'Alex Rivera' } },
  ],
});

function fathomFetch(): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const headers = new Headers(init?.headers);
    if (headers.get('X-Api-Key') !== 'fk') return new Response('{}', { status: 401 });
    if (!u.startsWith('https://api.fathom.ai/external/v1/meetings?')) throw new Error(`unexpected url ${u}`);
    const p = new URL(u).searchParams;
    if (p.get('include_transcript') !== 'true' || p.get('include_summary') !== 'true' || p.get('include_action_items') !== 'true') throw new Error('missing include flags');
    const cursor = p.get('cursor');
    const demo = { ...fathomItem(3, 'Fathom Demo', '2021-09-16T20:42:47Z'), calendar_invitees: [{ email: 'demo.user@fathom.video', name: 'Demo User' }] };
    const body = cursor
      ? { items: [{ ...fathomItem(2, 'Empty call', '2026-07-01T10:00:00Z'), transcript: [] }, demo], next_cursor: null }
      : { items: [fathomItem(1, 'Casey Example x Alex Rivera', '2026-08-25T16:03:36Z')], next_cursor: 'n2' };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;
}

describe('renderFathomCallPage', () => {
  test('facts, summary, action items, transcript, in that order', () => {
    const md = renderFathomCallPage(fathomItem(1, 'Casey Example x Alex Rivera', '2026-08-25T16:03:36Z') as never);
    expect(md.startsWith('---\ntitle: "Casey Example x Alex Rivera"\ntype: meeting\ndate: 2026-08-25\nsource: fathom\n---\n\n# Casey Example x Alex Rivera')).toBe(true);
    expect(md).toContain('source: fathom');
    expect(md).toContain('fathom_recording_id: 1');
    expect(md).toContain('url: https://fathom.video/calls/1');
    expect(md).toContain('recorded_by: Alex Rivera <alex@launchpadcohort.example.com>');
    expect(md).toContain('invitees: Casey Example <casey@example.com>');
    expect(md).toContain('## Summary');
    expect(md).toContain('Explore AI for retention.');
    expect(md).toContain('## Action items');
    expect(md).toContain('- [ ] Draft proposal w/ CTO (Alex Rivera, 00:31:12)');
    expect(md).toContain('## Transcript');
    expect(md).toContain('[00:00:04] Alex Rivera: Tell me about the rollout.');
    expect(md).toContain('archive_version: 3');
    const order = ['## Summary', '## Action items', '## Transcript'].map((h) => md.indexOf(h));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  test('merges a run of short segments from one speaker into one line, and drops a nonsense duration', () => {
    const m = fathomItem(1, 'T', '2026-08-25T16:03:36Z');
    m.transcript = [
      { speaker: { display_name: 'Evan Mercer' }, text: 'All right.', timestamp: '00:00:00' },
      { speaker: { display_name: 'Evan Mercer' }, text: 'Hello.', timestamp: '00:00:01' },
      { speaker: { display_name: 'Alex Rivera' }, text: 'Hi.', timestamp: '00:00:03' },
    ];
    m.recording_end_time = '2031-01-01T00:00:00Z';
    const md = renderFathomCallPage(m as never);
    expect(md).toContain('[00:00:00] Evan Mercer: All right. Hello.');
    expect(md).toContain('[00:00:03] Alex Rivera: Hi.');
    expect(md).not.toContain('duration:');
  });
});

describe('sample cleanup', () => {
  test('a sample page written by an earlier pass is removed, not left behind', async () => {
    const dir = store();
    fs.mkdirSync(path.join(dir, 'meetings'), { recursive: true });
    const stale = path.join(dir, 'meetings', '2021-09-16-fathom-demo--fathom-3.md');
    fs.writeFileSync(stale, '# Fathom Demo\n\nsource: fathom\n');
    const r = await exportFathomCalls({ key: 'fk', storeDir: dir, fetchFn: fathomFetch() });
    expect(r.skippedSample).toEqual(['3']);
    expect(fs.existsSync(stale)).toBe(false);
  });
});

describe('page regeneration by archive_version', () => {
  test('an existing page written by an older exporter is rewritten, a current one is skipped', async () => {
    const dir = store();
    const name = '2026-08-25-casey-example-x-alex-rivera--fathom-1.md';
    fs.mkdirSync(path.join(dir, 'meetings'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'meetings', name), '# old format page\n\nsource: fathom\n');
    const r = await exportFathomCalls({ key: 'fk', storeDir: dir, fetchFn: fathomFetch() });
    expect(r.exported).toEqual([`meetings/${name}`]);
    expect(fs.readFileSync(path.join(dir, 'meetings', name), 'utf8')).toContain('archive_version: 3');
    // a title with a double quote survives the YAML frontmatter
    expect(renderFathomCallPage({ ...fathomItem(9, 'Bob "Sales" Smith', '2026-01-01T00:00:00Z') } as never)).toContain('title: "Bob \\"Sales\\" Smith"');
    const again = await exportFathomCalls({ key: 'fk', storeDir: dir, fetchFn: fathomFetch() });
    expect(again.skippedExisting).toEqual(['1']);
  });
});

describe('exportFathomCalls', () => {
  test('pages with the include flags, writes one page per transcribed meeting, idempotent', async () => {
    const dir = store();
    const r = await exportFathomCalls({ key: 'fk', storeDir: dir, fetchFn: fathomFetch() });
    expect(r.source).toBe('fathom');
    expect(r.found).toBe(3);
    expect(r.exported).toEqual(['meetings/2026-08-25-casey-example-x-alex-rivera--fathom-1.md']);
    expect(r.noTranscript).toEqual(['2']);
    expect(r.skippedSample).toEqual(['3']); // Fathom's own demo call, never the operator's knowledge
    const again = await exportFathomCalls({ key: 'fk', storeDir: dir, fetchFn: fathomFetch() });
    expect(again.skippedExisting).toEqual(['1']);
  });
});

describe('archiveStatus', () => {
  test('counts archived pages by source', async () => {
    const dir = store();
    expect(archiveStatus(dir)).toEqual({ dir: path.join(dir, 'meetings'), attio: 0, fathom: 0, total: 0 });
    await exportAttioCalls({ key: 'atk', storeDir: dir, fetchFn: attioFetch().fetchFn });
    await exportFathomCalls({ key: 'fk', storeDir: dir, fetchFn: fathomFetch() });
    expect(archiveStatus(dir)).toMatchObject({ attio: 1, fathom: 1, total: 2 });
  });
});

describe('archive job (single-flight, reports progress)', () => {
  test('one job at a time; result lands in the job record', async () => {
    const dir = store();
    const started = startArchiveJob({ sources: ['attio', 'fathom'], storeDir: dir, keys: { attio: 'atk', fathom: 'fk' }, fetchFn: attioAndFathom() });
    expect(started.state).toBe('running');
    expect(startArchiveJob({ sources: ['attio'], storeDir: dir, keys: { attio: 'atk' }, fetchFn: attioAndFathom() }).state).toBe('running'); // same job returned
    await started.done;
    const job = getArchiveJob()!;
    expect(job.state).toBe('done');
    expect(job.results.map((r) => r.source)).toEqual(['attio', 'fathom']);
    expect(job.results.flatMap((r) => r.exported)).toHaveLength(2);
  });

  test('a source without a key is reported, not thrown', async () => {
    const dir = store();
    const started = startArchiveJob({ sources: ['attio'], storeDir: dir, keys: {}, fetchFn: attioAndFathom() });
    await started.done;
    expect(getArchiveJob()!.state).toBe('done');
    expect(getArchiveJob()!.results[0].failed[0].error).toMatch(/ATTIO_API_KEY/);
  });
});

function attioAndFathom(): typeof fetch {
  const a = attioFetch().fetchFn;
  const f = fathomFetch();
  return ((url: string | URL | Request, init?: RequestInit) => (String(url).includes('fathom.ai') ? f(url, init) : a(url, init))) as typeof fetch;
}
