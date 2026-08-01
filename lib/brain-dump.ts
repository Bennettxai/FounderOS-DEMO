/**
 * Brain dump: turn a voice/text capture into a real markdown memory file
 * inside the canonical brain-store. The file is the source of truth —
 * `gbrain sync` picks it up and pushes it into the vector DB on its next run.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { CaptureInput, CaptureOutcome } from '@/lib/connectors/gbrain';

const DEFAULT_STORE = process.env.GBRAIN_STORE ?? path.join(os.homedir(), 'knowledge', 'brain-store');

export type BrainDumpInput = {
  text: string;
  title?: string;
  folder: string; // top-level brain-store folder, e.g. 'inbox' | 'ideas'
  tags: string[]; // venture tags etc. — #vantage, #launchpad-cohort …
};

export type BrainDumpResult = { relPath: string; title: string };

export function slugifyTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || 'untitled';
}

export function writeBrainDump(input: BrainDumpInput, storePath: string = DEFAULT_STORE): BrainDumpResult {
  const text = input.text.trim();
  if (!text) throw new Error('brain dump is empty');
  if (!/^[a-z0-9-]+$/i.test(input.folder)) {
    throw new Error(`invalid folder: ${input.folder} — one top-level brain-store folder, no slashes`);
  }

  const title = input.title?.trim() || text.split(/\s+/).slice(0, 7).join(' ');
  const date = new Date().toISOString().slice(0, 10);
  const base = `${date}-${slugifyTitle(title)}`;

  const dir = path.join(storePath, input.folder);
  fs.mkdirSync(dir, { recursive: true });

  let slug = base;
  for (let n = 2; fs.existsSync(path.join(dir, `${slug}.md`)); n++) slug = `${base}-${n}`;

  const tags = input.tags.map((t) => t.trim()).filter(Boolean);
  const body = [
    '---',
    `created: ${new Date().toISOString()}`,
    'source: founder-os-brain-dump',
    `tags: [${tags.join(', ')}]`,
    '---',
    '',
    `# ${title}`,
    '',
    text,
    '',
  ].join('\n');

  const relPath = `${input.folder}/${slug}.md`;
  fs.writeFileSync(path.join(storePath, relPath), body, 'utf8');
  return { relPath, title };
}

export type BrainDumpDeps = {
  /** local markdown writer — defaults to writeBrainDump */
  writeLocal?: (input: BrainDumpInput, storePath?: string) => BrainDumpResult;
  /** gbrain capture(): embeds immediately. Omit (e.g. under BRAIN_PROVIDER=stub) to write locally only. */
  capture?: (input: CaptureInput) => Promise<CaptureOutcome>;
  storePath?: string;
};

export type IngestResult = BrainDumpResult & {
  embedded: boolean;
  slug?: string;
  captureError?: string;
};

/**
 * Ingest a brain dump: always write the local markdown (source of truth), then
 * — when a capture() is wired — embed it into gbrain immediately so agents can
 * retrieve it. A capture failure never loses the local write; it degrades to
 * `embedded: false` with the honest error (e.g. Supabase idle-paused).
 */
export async function ingestBrainDump(input: BrainDumpInput, deps: BrainDumpDeps = {}): Promise<IngestResult> {
  const writeLocal = deps.writeLocal ?? writeBrainDump;
  const local = writeLocal(input, deps.storePath);

  if (!deps.capture) return { ...local, embedded: false };

  const outcome = await deps.capture({ text: input.text, title: local.title });
  return outcome.ok
    ? { ...local, embedded: true, slug: outcome.slug }
    : { ...local, embedded: false, captureError: outcome.error };
}
