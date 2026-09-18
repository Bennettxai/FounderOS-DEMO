import fs from 'node:fs';
import path from 'node:path';
import type { FounderDb } from '@/lib/db';
import type { CaptureInput, CaptureOutcome } from '@/lib/connectors/gbrain';
import type { PlaudFile, PlaudRecording } from '@/lib/connectors/plaud';
import type { PlaudIngest } from '@/lib/schemas';
import { isPlaudSample, type Recording } from '@/lib/recordings-format';
import { slugifyTitle } from '@/lib/brain-dump';

/**
 * Plaud → the knowledge base. Every recording Plaud has synced AND
 * transcribed becomes one markdown page (facts header, Plaud's AI summary,
 * the timestamped speaker transcript) captured into G-Brain, where bge-m3
 * embeds it and /brain search finds it. The AI note's action items, verbatim,
 * go to OptimalEngine as claims when the engine is reachable (it is only on
 * the laptop). No LLM runs anywhere in this path: Plaud already did the
 * transcription and the summary; this files them.
 *
 * Idempotent by file id through the plaud_ingests table. A recording that
 * cannot be filed anywhere stays un-ingested and is retried next pass; when
 * the gbrain CLI is missing (the host) the page is written straight into the
 * brain-store, which the grep fallback searches.
 */

export type IngestDeps = {
  db: FounderDb;
  list: () => Promise<PlaudRecording[]>;
  fetchFile: (id: string) => Promise<PlaudFile | null>;
  captureProse: (input: CaptureInput) => Promise<CaptureOutcome>;
  /** null when OptimalEngine is not reachable: claims are skipped, not failed. */
  captureClaims?: ((input: CaptureInput) => Promise<CaptureOutcome>) | null;
  /** brain-store root for the file fallback; omit to disable the fallback. */
  storeDir?: string;
  now?: number;
};

export type IngestResult = {
  scanned: number;
  ingested: { fileId: string; title: string; via: PlaudIngest['via']; slug: string; claims: number }[];
  skipped: { alreadyIngested: string[]; notTranscribed: string[]; sample: string[] };
  failed: { fileId: string; error: string }[];
  claims: number;
};

export { isPlaudSample };

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export function recordingSlug(file: Pick<PlaudFile, 'title' | 'at' | 'id'>): string {
  const day = /^\d{4}-\d{2}-\d{2}/.test(file.at) ? file.at.slice(0, 10) : 'undated';
  const title = slugifyTitle(file.title) || file.id.slice(0, 8);
  return `${day}-${title}`;
}

export function renderRecordingMarkdown(file: PlaudFile): string {
  const lines: string[] = [`# ${file.title}`, ''];
  lines.push(`source: plaud`);
  lines.push(`plaud_file_id: ${file.id}`);
  if (file.at) lines.push(`recorded: ${file.at.slice(0, 10)}`);
  if (file.durationMinutes !== null) lines.push(`duration: ${file.durationMinutes}m`);
  lines.push('');
  if (file.note) {
    lines.push('## Summary', '', file.note.trim(), '');
  }
  if (file.transcript.length) {
    lines.push('## Transcript', '');
    for (const seg of file.transcript) {
      const who = seg.speaker ? `${seg.speaker}: ` : '';
      lines.push(`[${mmss(seg.startMs)} - ${mmss(seg.endMs)}] ${who}${seg.text}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

/** Bullets (or numbered items) under a heading that reads like a to-do list. */
export function extractActionItems(note: string | null): string[] {
  if (!note) return [];
  const out: string[] = [];
  let inSection = false;
  for (const raw of note.split('\n')) {
    const line = raw.trim();
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      inSection = /action items?|next steps?|to-?dos?|follow-?ups?/i.test(heading[1]);
      continue;
    }
    if (!inSection) continue;
    const item = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (item) {
      const text = item[1].replace(/\*\*/g, '').trim();
      if (text) out.push(text);
    }
  }
  return out;
}

function writeToStore(storeDir: string, slug: string, markdown: string): string {
  const dir = path.join(storeDir, 'inbox', 'recordings');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${slug}.md`);
  fs.writeFileSync(file, markdown, 'utf8');
  return path.relative(storeDir, file).replace(/\.md$/, '');
}

export async function ingestPlaudRecordings(deps: IngestDeps): Promise<IngestResult> {
  const now = deps.now ?? Date.now();
  const result: IngestResult = { scanned: 0, ingested: [], skipped: { alreadyIngested: [], notTranscribed: [], sample: [] }, failed: [], claims: 0 };
  const recordings = await deps.list();
  result.scanned = recordings.length;

  for (const rec of recordings) {
    if (isPlaudSample(rec.title)) {
      result.skipped.sample.push(rec.id);
      continue;
    }
    if (deps.db.plaudIngests.has(rec.id)) {
      result.skipped.alreadyIngested.push(rec.id);
      continue;
    }
    let file: PlaudFile | null;
    try {
      file = await deps.fetchFile(rec.id);
    } catch (err) {
      result.failed.push({ fileId: rec.id, error: err instanceof Error ? err.message : String(err) });
      continue;
    }
    if (!file || !file.transcribed) {
      result.skipped.notTranscribed.push(rec.id);
      continue;
    }

    const slug = recordingSlug(file);
    const markdown = renderRecordingMarkdown(file);
    let via: PlaudIngest['via'];
    let ref: string;
    const prose = await deps.captureProse({ text: markdown, title: file.title, type: 'recording', slug });
    if (prose.ok) {
      via = 'gbrain';
      ref = prose.slug;
    } else if (deps.storeDir) {
      try {
        ref = writeToStore(deps.storeDir, slug, markdown);
        via = 'store';
      } catch (err) {
        result.failed.push({ fileId: rec.id, error: `${prose.error}; store write failed: ${err instanceof Error ? err.message : String(err)}` });
        continue;
      }
    } else {
      result.failed.push({ fileId: rec.id, error: prose.error });
      continue;
    }

    let claims = 0;
    const items = extractActionItems(file.note);
    if (deps.captureClaims && items.length) {
      const text = [`Action items from "${file.title}" (Plaud recording, ${file.at.slice(0, 10)}):`, ...items.map((i) => `- ${i}`)].join('\n');
      const outcome = await deps.captureClaims({ text, title: `Action items: ${file.title}`, type: 'claims', slug: `${slug}-claims` });
      if (outcome.ok) claims = items.length;
    }

    deps.db.plaudIngests.insert({
      fileId: file.id,
      title: file.title,
      recordedAt: file.at,
      ingestedAt: new Date(now).toISOString(),
      via,
      slug: ref,
      claims,
    });
    result.ingested.push({ fileId: file.id, title: file.title, via, slug: ref, claims });
    result.claims += claims;
  }
  return result;
}

/** The live wiring: Plaud API in, gbrain capture (store-file fallback) and
 *  OptimalEngine claims out. What the agent, the cron and POST /api/plaud/ingest run. */
export async function ingestPlaudNow(db: FounderDb): Promise<IngestResult> {
  const { recentPlaudRecordings, getPlaudFile, plaudConfigured } = await import('@/lib/connectors/plaud');
  const { createGBrainProvider, gbrainStorePath } = await import('@/lib/connectors/gbrain');
  const { createOptimalProvider } = await import('@/lib/connectors/optimal');
  if (!plaudConfigured()) {
    return { scanned: 0, ingested: [], skipped: { alreadyIngested: [], notTranscribed: [], sample: [] }, failed: [], claims: 0 };
  }
  const gbrain = createGBrainProvider();
  const optimal = createOptimalProvider();
  const engineUp = await optimal
    .status()
    .then((s) => s.connected)
    .catch(() => false);
  return ingestPlaudRecordings({
    db,
    list: () => recentPlaudRecordings(100),
    fetchFile: (id) => getPlaudFile(id),
    captureProse: (input) => gbrain.capture(input),
    captureClaims: engineUp ? (input) => optimal.capture(input) : null,
    storeDir: gbrainStorePath(),
  });
}

/** Stamp the Recordings tab rows with where each Plaud recording landed. */
export function markIngested(recordings: Recording[], rows: PlaudIngest[]): Recording[] {
  const via = new Map(rows.map((r) => [`plaud-${r.fileId}`, r.via]));
  return recordings.map((r) => (via.has(r.id) ? { ...r, brain: via.get(r.id)! } : r));
}
