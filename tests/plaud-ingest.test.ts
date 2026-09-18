import { afterEach, describe, expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb, type FounderDb } from '@/lib/db';
import { parsePlaudFile, type PlaudFile } from '@/lib/connectors/plaud';
import { extractActionItems, ingestPlaudRecordings, markIngested, renderRecordingMarkdown } from '@/lib/plaud-ingest';
import type { CaptureInput, CaptureOutcome } from '@/lib/connectors/gbrain';

/**
 * Plaud → knowledge base. A recording that Plaud has synced AND transcribed
 * becomes one markdown page (summary + timestamped transcript) captured into
 * G-Brain, with the AI note's action items pushed to OptimalEngine as claims
 * when the engine is reachable. Idempotent by file id (plaud_ingests table),
 * no LLM anywhere in the path: Plaud already did the transcription and the
 * summary, this just files them.
 */

let db: FounderDb;
const tmp: string[] = [];
afterEach(() => {
  db?.close();
  for (const d of tmp.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

const fileBody = {
  id: 'f1',
  name: 'Acme Parking site walk',
  created_at: '2026-08-26T15:00:00',
  start_at: '2026-08-26T15:00:00.100000',
  duration: 1_500_000,
  presigned_url: 'https://example.invalid/audio.mp3',
  source_list: [
    {
      data_type: 'transaction',
      data_content: JSON.stringify([
        { start_time: 0, end_time: 31200, content: 'We walked the north lot first.', speaker: 'the operator' },
        { start_time: 32110, end_time: 62776, content: 'Gate two needs a new reader before the 16th.', speaker: 'Dana' },
      ]),
    },
    { data_type: 'mark_memo', data_content: '', data_link: 'https://example.invalid/memo' },
  ],
  note_list: [
    {
      data_type: 'auto_sum_note',
      data_title: 'Summary',
      data_content: '## Overview\nSite walk with Dana.\n\n## Action Items\n* Send the gate-two reader quote by Friday\n- Confirm the next month on-site window\n\n## Notes\nNothing else.',
    },
  ],
};

describe('parsePlaudFile', () => {
  test('maps transcript segments (ms → MM:SS-able), the AI note, and the transcribed flag', () => {
    const f = parsePlaudFile(fileBody)!;
    expect(f.id).toBe('f1');
    expect(f.title).toBe('Acme Parking site walk');
    expect(f.at).toBe('2026-08-26T15:00:00Z');
    expect(f.durationMinutes).toBe(25);
    expect(f.transcript).toHaveLength(2);
    expect(f.transcript[1]).toEqual({ startMs: 32110, endMs: 62776, speaker: 'Dana', text: 'Gate two needs a new reader before the 16th.' });
    expect(f.note).toContain('## Action Items');
    expect(f.transcribed).toBe(true);
  });

  test('an untranscribed recording (no transaction source) is not transcribed, never a throw', () => {
    const f = parsePlaudFile({ ...fileBody, source_list: [], note_list: [] })!;
    expect(f.transcribed).toBe(false);
    expect(f.transcript).toEqual([]);
    expect(f.note).toBeNull();
    expect(parsePlaudFile(null)).toBeNull();
    expect(parsePlaudFile({ source_list: [{ data_type: 'transaction', data_content: 'not json' }] })?.transcript).toEqual([]);
  });
});

describe('renderRecordingMarkdown', () => {
  test('one page: header facts, the summary, then the timestamped speaker transcript', () => {
    const md = renderRecordingMarkdown(parsePlaudFile(fileBody)!);
    expect(md.startsWith('# Acme Parking site walk')).toBe(true);
    expect(md).toContain('source: plaud');
    expect(md).toContain('plaud_file_id: f1');
    expect(md).toContain('recorded: 2026-08-26');
    expect(md).toContain('duration: 25m');
    expect(md).toContain('## Summary');
    expect(md).toContain('Site walk with Dana.');
    expect(md).toContain('## Transcript');
    expect(md).toContain('[00:32 - 01:02] Dana: Gate two needs a new reader before the 16th.');
    expect(md.indexOf('## Summary')).toBeLessThan(md.indexOf('## Transcript'));
  });
});

describe('extractActionItems', () => {
  test('pulls the bullets under an Action Items / Next Steps heading, and only those', () => {
    expect(extractActionItems(fileBody.note_list[0].data_content)).toEqual([
      'Send the gate-two reader quote by Friday',
      'Confirm the next month on-site window',
    ]);
    expect(extractActionItems('## Next steps\n1. Call back\n2. Send deck\n## Other\n- no')).toEqual(['Call back', 'Send deck']);
    expect(extractActionItems('## Overview\n- just notes')).toEqual([]);
    expect(extractActionItems(null)).toEqual([]);
  });
});

type Deps = Parameters<typeof ingestPlaudRecordings>[0];

function deps(over: Partial<Deps> = {}): Deps & { captured: CaptureInput[]; claimed: CaptureInput[] } {
  const captured: CaptureInput[] = [];
  const claimed: CaptureInput[] = [];
  db = openDb(':memory:');
  const files: Record<string, PlaudFile | null> = {
    f1: parsePlaudFile(fileBody),
    f2: parsePlaudFile({ ...fileBody, id: 'f2', name: 'Not synced yet', source_list: [], note_list: [] }),
  };
  return {
    captured,
    claimed,
    db,
    list: async () => [
      { id: 'f1', title: 'Acme Parking site walk', at: '2026-08-26T15:00:00Z', durationMinutes: 25 },
      { id: 'f2', title: 'Not synced yet', at: '2026-08-26T16:00:00Z', durationMinutes: 3 },
    ],
    fetchFile: async (id: string) => files[id] ?? null,
    captureProse: async (input: CaptureInput): Promise<CaptureOutcome> => {
      captured.push(input);
      return { ok: true, slug: `recordings/${input.slug ?? 'x'}`, contentHash: 'h' };
    },
    captureClaims: async (input: CaptureInput): Promise<CaptureOutcome> => {
      claimed.push(input);
      return { ok: true, slug: 'sig_1', contentHash: 'p' };
    },
    now: Date.parse('2026-08-26T17:00:00Z'),
    ...over,
  };
}

describe('ingestPlaudRecordings', () => {
  test('captures each transcribed recording once as a markdown page, pushes action items as claims, records the ingest', async () => {
    const d = deps();
    const r = await ingestPlaudRecordings(d);
    expect(r.ingested.map((i) => i.fileId)).toEqual(['f1']);
    expect(r.skipped.notTranscribed).toEqual(['f2']);
    expect(r.failed).toEqual([]);
    expect(d.captured).toHaveLength(1);
    expect(d.captured[0].title).toBe('Acme Parking site walk');
    expect(d.captured[0].type).toBe('recording');
    expect(d.captured[0].slug).toBe('2026-08-26-acme-parking-site-walk');
    expect(d.captured[0].text).toContain('## Transcript');
    expect(d.claimed).toHaveLength(1);
    expect(d.claimed[0].text).toContain('Send the gate-two reader quote by Friday');
    expect(d.claimed[0].text).toContain('Acme Parking site walk');
    expect(r.claims).toBe(2);

    const rows = db.plaudIngests.all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ fileId: 'f1', title: 'Acme Parking site walk', via: 'gbrain', slug: 'recordings/2026-08-26-acme-parking-site-walk', claims: 2 });
    expect(rows[0].ingestedAt).toBe('2026-08-26T17:00:00.000Z');

    // idempotent: a second pass does nothing
    const again = await ingestPlaudRecordings(d);
    expect(again.ingested).toEqual([]);
    expect(again.skipped.alreadyIngested).toEqual(['f1']);
    expect(d.captured).toHaveLength(1);
  });

  test("Plaud's bundled sample recordings are skipped, never filed as the operator's knowledge", async () => {
    const d = deps({
      list: async () => [
        { id: 's1', title: 'Welcome to Plaud.ai', at: '2026-08-26T02:10:34Z', durationMinutes: 4 },
        { id: 's2', title: 'How to use Plaud', at: '2026-08-26T02:10:33Z', durationMinutes: 4 },
        { id: 's3', title: 'Steve Jobs & Bill Gates: A Conversation That Shaped Technology', at: '2026-08-26T02:10:35Z', durationMinutes: 81 },
        { id: 'f1', title: 'Acme Parking site walk', at: '2026-08-26T15:00:00Z', durationMinutes: 25 },
      ],
    });
    const r = await ingestPlaudRecordings(d);
    expect(r.skipped.sample).toEqual(['s1', 's2', 's3']);
    expect(r.ingested.map((i) => i.fileId)).toEqual(['f1']);
    expect(d.captured).toHaveLength(1);
  });

  test('no claims capture when the engine is off (null), and none when the note has no action items', async () => {
    const d = deps({ captureClaims: null });
    const r = await ingestPlaudRecordings(d);
    expect(r.ingested).toHaveLength(1);
    expect(r.claims).toBe(0);
    expect(db.plaudIngests.all()[0].claims).toBe(0);
  });

  test('falls back to writing the page into the brain-store when gbrain capture fails, and says so', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-'));
    tmp.push(dir);
    const d = deps({
      storeDir: dir,
      captureProse: async () => ({ ok: false, error: 'gbrain: command not found' }),
    });
    const r = await ingestPlaudRecordings(d);
    expect(r.ingested).toHaveLength(1);
    expect(r.ingested[0].via).toBe('store');
    const file = path.join(dir, 'inbox', 'recordings', '2026-08-26-acme-parking-site-walk.md');
    expect(fs.existsSync(file)).toBe(true);
    expect(fs.readFileSync(file, 'utf8')).toContain('## Transcript');
    expect(db.plaudIngests.all()[0].via).toBe('store');
  });

  test('a recording that cannot be filed anywhere is reported failed, not silently dropped, and is retried next pass', async () => {
    const d = deps({ captureProse: async () => ({ ok: false, error: 'gbrain down' }) }); // no storeDir
    const r = await ingestPlaudRecordings(d);
    expect(r.ingested).toEqual([]);
    expect(r.failed).toEqual([{ fileId: 'f1', error: 'gbrain down' }]);
    expect(db.plaudIngests.all()).toEqual([]);
  });

  test('a fetch that throws fails that one recording only', async () => {
    const d = deps({
      fetchFile: async (id: string) => {
        if (id === 'f1') throw new Error('HTTP 500');
        return null;
      },
    });
    const r = await ingestPlaudRecordings(d);
    expect(r.failed).toEqual([{ fileId: 'f1', error: 'HTTP 500' }]);
  });
});

describe('markIngested', () => {
  test('stamps recordings with where they landed in the brain', () => {
    const rows = markIngested(
      [
        { id: 'plaud-f1', source: 'plaud', title: 'a', at: '', durationMinutes: null, url: null },
        { id: 'plaud-f9', source: 'plaud', title: 'b', at: '', durationMinutes: null, url: null },
        { id: 'fathom-x', source: 'fathom', title: 'c', at: '', durationMinutes: null, url: null },
      ],
      [{ fileId: 'f1', title: 'a', recordedAt: '', ingestedAt: '', via: 'gbrain', slug: 'recordings/a', claims: 0 }],
    );
    expect(rows.map((r) => r.brain ?? null)).toEqual(['gbrain', null, null]);
  });
});

describe('db.plaudIngests', () => {
  test('insert / all / has, validated on the way out', () => {
    db = openDb(':memory:');
    expect(db.plaudIngests.all()).toEqual([]);
    db.plaudIngests.insert({ fileId: 'f1', title: 't', recordedAt: '2026-08-26T15:00:00Z', ingestedAt: '2026-08-26T17:00:00Z', via: 'gbrain', slug: 's', claims: 1 });
    expect(db.plaudIngests.has('f1')).toBe(true);
    expect(db.plaudIngests.has('nope')).toBe(false);
    expect(db.plaudIngests.all()[0].via).toBe('gbrain');
  });
});
