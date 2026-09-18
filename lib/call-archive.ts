import fs from 'node:fs';
import path from 'node:path';
import { slugifyTitle } from '@/lib/brain-dump';

/**
 * The call archive: every recorded sales call as one markdown page in the
 * brain-store's meetings/ folder (README there: "YYYY-MM-DD-topic.md, one
 * page per event"), so the knowledge base keeps the conversations after the
 * recorder's subscription ends. Two sources:
 *   attio  — Attio's built-in notetaker (cancelled 2026-08-26): every meeting
 *            → its call_recordings → the transcript. REST, 3 calls per hit.
 *   fathom — the Fathom notetaker: one paged call with transcript, summary
 *            and action items inline.
 * Pure code, no LLM. Idempotent: the file suffix `--<source>-<id>` is the
 * key; an existing page is never rewritten, a recording without a transcript
 * is left for the next pass (Attio finishes transcribing after the call).
 *
 * On the laptop the store is ~/brain-agent/brain-store and `gbrain sync`
 * embeds the new pages; on the host it is GBRAIN_STORE and the grep fallback
 * searches them as soon as they land.
 */

export type ArchiveSource = 'attio' | 'fathom';
type Fetch = typeof fetch;

export type ArchiveResult = {
  source: ArchiveSource;
  meetingsScanned: number;
  found: number;
  exported: string[]; // store-relative paths
  skippedExisting: string[]; // recording ids
  skippedSample: string[]; // the recorder's own demo calls
  noTranscript: string[]; // recording ids
  failed: { id: string; error: string }[];
};

const MEETINGS_DIR = 'meetings';

/** Bump when the page layout changes: pages without the current version line
 *  are rewritten on the next pass, so a format fix reaches every box. */
export const ARCHIVE_VERSION = 3;
const VERSION_LINE = `archive_version: ${ARCHIVE_VERSION}`;

/** YAML frontmatter gbrain reads for the page title/type (without it the title
 *  is derived from the slug, e.g. "2026 06 04 Example Call And ..."). */
function frontmatter(title: string, at: string, source: ArchiveSource): string[] {
  const day = /^\d{4}-\d{2}-\d{2}/.test(at) ? at.slice(0, 10) : '';
  const safe = title.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return ['---', `title: "${safe}"`, 'type: meeting', ...(day ? [`date: ${day}`] : []), `source: ${source}`, '---', ''];
}

function emptyResult(source: ArchiveSource): ArchiveResult {
  return { source, meetingsScanned: 0, found: 0, exported: [], skippedExisting: [], skippedSample: [], noTranscript: [], failed: [] };
}

function ensureDir(storeDir: string): string {
  const dir = path.join(storeDir, MEETINGS_DIR);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Recording ids already archived for a source, read once per pass. With
 *  `current`, only pages carrying the current archive_version count, so
 *  older pages get regenerated. */
function existingIds(storeDir: string, source: ArchiveSource, current = false): Set<string> {
  const dir = path.join(storeDir, MEETINGS_DIR);
  const out = new Set<string>();
  if (!fs.existsSync(dir)) return out;
  const re = new RegExp(`--${source}-(.+)\\.md$`);
  for (const f of fs.readdirSync(dir)) {
    const m = f.match(re);
    if (!m) continue;
    if (current) {
      try {
        if (!fs.readFileSync(path.join(dir, f), 'utf8').includes(`\n${VERSION_LINE}\n`)) continue;
      } catch {
        continue;
      }
    }
    out.add(m[1]);
  }
  return out;
}

/** Delete every page for one recording id (whatever date/slug it was filed under). */
function removePages(storeDir: string, source: ArchiveSource, id: string): void {
  const dir = path.join(storeDir, MEETINGS_DIR);
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith(`--${source}-${id}.md`)) fs.rmSync(path.join(dir, f), { force: true });
  }
}

function pageName(at: string, title: string, source: ArchiveSource, id: string): string {
  const day = /^\d{4}-\d{2}-\d{2}/.test(at) ? at.slice(0, 10) : 'undated';
  const slug = slugifyTitle(title) || 'untitled';
  return `${day}-${slug}--${source}-${id}.md`;
}

function writePage(storeDir: string, name: string, content: string): string {
  const dir = ensureDir(storeDir);
  fs.writeFileSync(path.join(dir, name), content, 'utf8');
  return `${MEETINGS_DIR}/${name}`;
}

const mmss = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

async function getJson<T>(url: string, init: RequestInit, fetchFn: Fetch): Promise<T> {
  const res = await fetchFn(url, { ...init, signal: AbortSignal.timeout(60_000) });
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 2000));
    return getJson<T>(url, init, fetchFn);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url.replace(/\?.*$/, '')}`);
  return (await res.json()) as T;
}

/* ───────────────────────────── Attio ───────────────────────────── */

const ATTIO = 'https://api.attio.com/v2';

export type AttioMeeting = {
  id: { meeting_id: string };
  title?: string | null;
  start?: { datetime?: string; date?: string } | null;
  participants?: { email_address?: string | null }[];
  linked_records?: { object_slug?: string; record_id?: string }[];
};
export type AttioCallRecording = {
  id: { meeting_id: string; call_recording_id: string };
  status?: string;
  web_url?: string;
  created_at?: string;
  transcript?: {
    segments?: { speech?: string; start_time?: number; end_time?: number; speaker?: { name?: string } }[];
    raw_transcript?: string;
  };
};

function meetingStart(m: AttioMeeting): string {
  return m.start?.datetime ?? m.start?.date ?? '';
}

/** Segments → "[MM:SS] Speaker: text", merging consecutive runs of one speaker. */
function attioTranscript(rec: AttioCallRecording): string {
  const raw = rec.transcript?.raw_transcript?.trim();
  if (raw) return raw;
  const segs = rec.transcript?.segments ?? [];
  const lines: string[] = [];
  let cur: { speaker: string; start: number; parts: string[] } | null = null;
  for (const s of segs) {
    const speaker = s.speaker?.name?.trim() || 'Speaker';
    const text = (s.speech ?? '').trim();
    if (!text) continue;
    if (cur && cur.speaker === speaker) {
      cur.parts.push(text);
      continue;
    }
    if (cur) lines.push(`[${mmss(cur.start)}] ${cur.speaker}: ${cur.parts.join(' ')}`);
    cur = { speaker, start: s.start_time ?? 0, parts: [text] };
  }
  if (cur) lines.push(`[${mmss(cur.start)}] ${cur.speaker}: ${cur.parts.join(' ')}`);
  return lines.join('\n');
}

export function attioHasTranscript(rec: AttioCallRecording): boolean {
  return !!(rec.transcript?.raw_transcript?.trim() || rec.transcript?.segments?.some((s) => (s.speech ?? '').trim()));
}

export function renderAttioCallPage(meeting: AttioMeeting, rec: AttioCallRecording): string {
  const title = meeting.title?.trim() || 'Untitled call';
  const participants = (meeting.participants ?? []).map((p) => p.email_address).filter(Boolean) as string[];
  const linked = (meeting.linked_records ?? []).map((r) => `${r.object_slug ?? 'record'}:${r.record_id ?? '?'}`);
  const at = meetingStart(meeting);
  const lines = [...frontmatter(title, at, 'attio'), `# ${title}`, '', VERSION_LINE, 'source: attio', `attio_meeting_id: ${rec.id.meeting_id}`, `attio_call_recording_id: ${rec.id.call_recording_id}`];
  if (at) lines.push(`recorded: ${at}`);
  if (participants.length) lines.push(`participants: ${participants.join(', ')}`);
  if (linked.length) lines.push(`linked_records: ${linked.join(', ')}`);
  if (rec.web_url) lines.push(`url: ${rec.web_url}`);
  lines.push('', '## Transcript', '', attioTranscript(rec), '');
  return lines.join('\n');
}

export async function exportAttioCalls(opts: {
  key: string;
  storeDir: string;
  fetchFn?: Fetch;
  onProgress?: (r: ArchiveResult) => void;
}): Promise<ArchiveResult> {
  const fetchFn = opts.fetchFn ?? fetch;
  const init = { headers: { Authorization: `Bearer ${opts.key}` } };
  const result = emptyResult('attio');
  const have = existingIds(opts.storeDir, 'attio', true);

  // 1. every meeting (cursor-paged, 200 a page)
  const meetings: AttioMeeting[] = [];
  let cursor: string | null = null;
  do {
    const q = new URLSearchParams({ limit: '200' });
    if (cursor) q.set('cursor', cursor);
    const page: { data: AttioMeeting[]; pagination?: { next_cursor?: string | null } } = await getJson(`${ATTIO}/meetings?${q}`, init, fetchFn);
    meetings.push(...page.data);
    cursor = page.pagination?.next_cursor ?? null;
  } while (cursor);
  result.meetingsScanned = meetings.length;

  // 2. each meeting's recordings, 3. each recording's transcript
  for (const meeting of meetings) {
    const mid = meeting.id.meeting_id;
    let recs: { id: { call_recording_id: string }; status?: string }[];
    try {
      const page: { data: typeof recs } = await getJson(`${ATTIO}/meetings/${mid}/call_recordings`, init, fetchFn);
      recs = page.data;
    } catch (err) {
      result.failed.push({ id: `meeting:${mid}`, error: err instanceof Error ? err.message : String(err) });
      continue;
    }
    for (const r of recs) {
      const rid = r.id.call_recording_id;
      result.found += 1;
      if (have.has(rid)) {
        result.skippedExisting.push(rid);
        continue;
      }
      try {
        const full: { data: AttioCallRecording } = await getJson(`${ATTIO}/meetings/${mid}/call_recordings/${rid}`, init, fetchFn);
        if (!attioHasTranscript(full.data)) {
          result.noTranscript.push(rid);
          continue;
        }
        const name = pageName(meetingStart(meeting), meeting.title?.trim() || 'untitled-call', 'attio', rid);
        result.exported.push(writePage(opts.storeDir, name, renderAttioCallPage(meeting, full.data)));
      } catch (err) {
        result.failed.push({ id: rid, error: err instanceof Error ? err.message : String(err) });
      }
    }
    opts.onProgress?.(result);
  }
  return result;
}

/* ───────────────────────────── Fathom ───────────────────────────── */

const FATHOM = 'https://api.fathom.ai/external/v1';

export type FathomMeetingFull = {
  title?: string;
  meeting_title?: string;
  url?: string;
  recording_id?: number | string;
  created_at?: string;
  recording_start_time?: string;
  recording_end_time?: string;
  recorded_by?: { name?: string; email?: string } | null;
  calendar_invitees?: { name?: string | null; email?: string | null }[];
  transcript?: { speaker?: { display_name?: string | null }; text?: string; timestamp?: string }[] | null;
  default_summary?: { template_name?: string; markdown_formatted?: string } | null;
  action_items?: { description?: string; completed?: boolean; recording_timestamp?: string; assignee?: { name?: string | null } | null }[] | null;
};

function fathomId(m: FathomMeetingFull): string {
  if (m.recording_id !== undefined && m.recording_id !== null) return String(m.recording_id);
  const fromUrl = m.url?.match(/\/calls\/(\d+)/);
  return fromUrl ? fromUrl[1] : '';
}

function fathomAt(m: FathomMeetingFull): string {
  return m.recording_start_time ?? m.created_at ?? '';
}

const DAY_MS = 86_400_000;
function durationMinutes(m: FathomMeetingFull): number | null {
  const a = Date.parse(m.recording_start_time ?? '');
  const b = Date.parse(m.recording_end_time ?? '');
  // Fathom's own demo call reports an end time years out; a call is under a day.
  return Number.isFinite(a) && Number.isFinite(b) && b > a && b - a < DAY_MS ? Math.round((b - a) / 60_000) : null;
}

/** Fathom's bundled demo call ("Fathom Demo", a fathom.video invitee). */
export function isFathomSample(m: FathomMeetingFull): boolean {
  const title = (m.meeting_title ?? m.title ?? '').trim().toLowerCase();
  if (title === 'fathom demo') return true;
  return (m.calendar_invitees ?? []).some((i) => (i.email ?? '').toLowerCase().endsWith('@fathom.video'));
}

/** Segments → "[HH:MM:SS] Speaker: text", merging consecutive runs of one speaker. */
function fathomTranscript(m: FathomMeetingFull): string[] {
  const lines: string[] = [];
  let cur: { speaker: string; at: string; parts: string[] } | null = null;
  for (const s of m.transcript ?? []) {
    const text = (s.text ?? '').trim();
    if (!text) continue;
    const speaker = s.speaker?.display_name?.trim() || 'Speaker';
    if (cur && cur.speaker === speaker) {
      cur.parts.push(text);
      continue;
    }
    if (cur) lines.push(`[${cur.at}] ${cur.speaker}: ${cur.parts.join(' ')}`);
    cur = { speaker, at: s.timestamp ?? '00:00:00', parts: [text] };
  }
  if (cur) lines.push(`[${cur.at}] ${cur.speaker}: ${cur.parts.join(' ')}`);
  return lines;
}

export function renderFathomCallPage(m: FathomMeetingFull): string {
  const title = (m.meeting_title ?? m.title ?? '').trim() || 'Untitled meeting';
  const at = fathomAt(m);
  const lines = [...frontmatter(title, at, 'fathom'), `# ${title}`, '', VERSION_LINE, 'source: fathom', `fathom_recording_id: ${fathomId(m)}`];
  if (m.url) lines.push(`url: ${m.url}`);
  if (at) lines.push(`recorded: ${at}`);
  const dur = durationMinutes(m);
  if (dur !== null) lines.push(`duration: ${dur}m`);
  if (m.recorded_by?.name || m.recorded_by?.email) lines.push(`recorded_by: ${m.recorded_by.name ?? ''} <${m.recorded_by.email ?? ''}>`.replace(' <>', ''));
  const invitees = (m.calendar_invitees ?? []).map((i) => (i.name ? `${i.name} <${i.email ?? ''}>` : i.email ?? '')).filter(Boolean);
  if (invitees.length) lines.push(`invitees: ${invitees.join(', ')}`);
  lines.push('');
  const summary = m.default_summary?.markdown_formatted?.trim();
  if (summary) lines.push('## Summary', '', summary, '');
  const actions = (m.action_items ?? []).filter((a) => (a.description ?? '').trim());
  if (actions.length) {
    lines.push('## Action items', '');
    for (const a of actions) {
      const who = [a.assignee?.name, a.recording_timestamp].filter(Boolean).join(', ');
      lines.push(`- [${a.completed ? 'x' : ' '}] ${a.description!.trim()}${who ? ` (${who})` : ''}`);
    }
    lines.push('');
  }
  const transcript = fathomTranscript(m);
  if (transcript.length) lines.push('## Transcript', '', ...transcript, '');
  return lines.join('\n');
}

export async function exportFathomCalls(opts: {
  key: string;
  storeDir: string;
  fetchFn?: Fetch;
  onProgress?: (r: ArchiveResult) => void;
}): Promise<ArchiveResult> {
  const fetchFn = opts.fetchFn ?? fetch;
  const init = { headers: { 'X-Api-Key': opts.key } };
  const result = emptyResult('fathom');
  const have = existingIds(opts.storeDir, 'fathom', true);
  let cursor: string | null = null;
  do {
    const q = new URLSearchParams({ include_transcript: 'true', include_summary: 'true', include_action_items: 'true', limit: '100' });
    if (cursor) q.set('cursor', cursor);
    const page: { items?: FathomMeetingFull[]; next_cursor?: string | null } = await getJson(`${FATHOM}/meetings?${q}`, init, fetchFn);
    const items = page.items ?? [];
    result.meetingsScanned += items.length;
    for (const m of items) {
      const id = fathomId(m);
      if (!id) {
        result.failed.push({ id: m.url ?? '?', error: 'no recording id' });
        continue;
      }
      result.found += 1;
      if (isFathomSample(m)) {
        result.skippedSample.push(id);
        removePages(opts.storeDir, 'fathom', id); // an earlier pass may have written it
        continue;
      }
      if (have.has(id)) {
        result.skippedExisting.push(id);
        continue;
      }
      if (!(m.transcript ?? []).some((s) => (s.text ?? '').trim())) {
        result.noTranscript.push(id);
        continue;
      }
      try {
        const name = pageName(fathomAt(m), (m.meeting_title ?? m.title ?? '').trim() || 'untitled-meeting', 'fathom', id);
        result.exported.push(writePage(opts.storeDir, name, renderFathomCallPage(m)));
      } catch (err) {
        result.failed.push({ id, error: err instanceof Error ? err.message : String(err) });
      }
    }
    opts.onProgress?.(result);
    cursor = page.next_cursor ?? null;
  } while (cursor);
  return result;
}

/* ───────────────────────────── status + job ───────────────────────────── */

export function archiveStatus(storeDir: string): { dir: string; attio: number; fathom: number; total: number } {
  const attio = existingIds(storeDir, 'attio').size;
  const fathom = existingIds(storeDir, 'fathom').size;
  return { dir: path.join(storeDir, MEETINGS_DIR), attio, fathom, total: attio + fathom };
}

export type ArchiveJob = {
  state: 'running' | 'done';
  startedAt: string;
  finishedAt: string | null;
  sources: ArchiveSource[];
  results: ArchiveResult[];
  /** the source currently being exported, with its live counters */
  current: ArchiveResult | null;
  done: Promise<void>;
};

let job: ArchiveJob | null = null;
export function __resetArchiveJob(): void {
  job = null;
}
export function getArchiveJob(): ArchiveJob | null {
  return job;
}

/** One export at a time (an Attio pass is minutes of API calls). Calling
 *  while a job runs returns that job; a finished job is replaced. */
export function startArchiveJob(opts: {
  sources: ArchiveSource[];
  storeDir: string;
  keys: Partial<Record<ArchiveSource, string | undefined>>;
  fetchFn?: Fetch;
}): ArchiveJob {
  if (job && job.state === 'running') return job;
  const record: Omit<ArchiveJob, 'done'> = { state: 'running', startedAt: new Date().toISOString(), finishedAt: null, sources: opts.sources, results: [], current: null };
  const done = (async () => {
    for (const source of opts.sources) {
      const key = opts.keys[source];
      const missing = source === 'attio' ? 'ATTIO_API_KEY' : 'FATHOM_API_KEY';
      const empty = emptyResult(source);
      if (!key) {
        record.results.push({ ...empty, failed: [{ id: source, error: `${missing} is not configured on this box` }] });
        continue;
      }
      const onProgress = (r: ArchiveResult) => {
        record.current = r;
      };
      try {
        const run = source === 'attio' ? exportAttioCalls : exportFathomCalls;
        record.results.push(await run({ key, storeDir: opts.storeDir, fetchFn: opts.fetchFn, onProgress }));
      } catch (err) {
        record.results.push({ ...(record.current?.source === source ? record.current : empty), failed: [{ id: source, error: err instanceof Error ? err.message : String(err) }] });
      }
      record.current = null;
    }
    record.state = 'done';
    record.finishedAt = new Date().toISOString();
  })();
  job = Object.assign(record, { done });
  return job;
}
