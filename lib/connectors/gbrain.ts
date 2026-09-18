import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { BrainProvider, BrainSearchResult, BrainStatus } from '@/lib/brain';

export type ExecResult = { stdout: string; stderr: string; code: number };
export type ExecFn = (cmd: string, args: string[], stdin?: string) => Promise<ExecResult>;

const GBRAIN_BIN = process.env.GBRAIN_BIN ?? 'gbrain';
const DEFAULT_STORE = process.env.GBRAIN_STORE ?? path.join(process.cwd(), 'knowledge', 'brain-store');

/** The markdown brain-store root this host reads (GBRAIN_STORE, else the
 *  bundled knowledge/brain-store folder). */
export function gbrainStorePath(): string {
  return process.env.GBRAIN_STORE ?? DEFAULT_STORE;
}
const READ_TIMEOUT_MS = 15_000;
const WRITE_TIMEOUT_MS = 60_000;

/**
 * Reads (doctor/query/stats) must fail fast so a paused Supabase never hangs a
 * page render — 15s → local fallback. Writes (capture/import/embed) embed
 * synchronously through the embedder + Supabase and run 13–24s+, so they get a
 * generous 60s or execFile kills them mid-embed (SIGTERM).
 */
export function execTimeoutFor(args: string[]): number {
  const cmd = args[0];
  return cmd === 'capture' || cmd === 'import' || cmd === 'embed' ? WRITE_TIMEOUT_MS : READ_TIMEOUT_MS;
}

const defaultExec: ExecFn = (cmd, args, stdin) =>
  new Promise((resolve) => {
    const child = execFile(
      cmd,
      args,
      {
        timeout: execTimeoutFor(args),
        maxBuffer: 4 * 1024 * 1024,
        env: { ...process.env, GBRAIN_DISABLE_DIRECT_POOL: process.env.GBRAIN_DISABLE_DIRECT_POOL ?? '1' },
      },
      (err, stdout, stderr) => {
        resolve({
          stdout: stdout?.toString() ?? '',
          // `||` not `??`: on timeout/kill stderr is an empty string, so surface
          // the real error (e.g. "Command failed … SIGTERM") instead of losing it.
          stderr: stderr?.toString() || (err ? err.message : ''),
          code: err ? 1 : 0,
        });
      },
    );
    if (stdin !== undefined) {
      child.stdin?.write(stdin);
      child.stdin?.end();
    }
  });

function walkMarkdown(dir: string, files: string[] = []): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkMarkdown(full, files);
    else if (entry.name.endsWith('.md')) files.push(full);
  }
  return files;
}

function localSearch(storePath: string, query: string, limit = 5): BrainSearchResult[] {
  const needle = query.toLowerCase();
  const results: BrainSearchResult[] = [];
  for (const file of walkMarkdown(storePath)) {
    let content: string;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const line = content.split('\n').find((l) => l.toLowerCase().includes(needle));
    if (line) {
      results.push({
        title: path.relative(storePath, file).replace(/\.md$/, ''),
        snippet: line.trim().slice(0, 240),
        source: 'brain-store',
      });
      if (results.length >= limit) break;
    }
  }
  return results;
}

/** Read every markdown page in the store as { path (posix-relative), content }. */
export function readStoreNotes(storePath: string = DEFAULT_STORE): { path: string; content: string }[] {
  const notes: { path: string; content: string }[] = [];
  for (const file of walkMarkdown(storePath)) {
    try {
      notes.push({
        path: path.relative(storePath, file).split(path.sep).join('/'),
        content: fs.readFileSync(file, 'utf8'),
      });
    } catch {
      // unreadable file — skip it
    }
  }
  return notes.sort((a, b) => a.path.localeCompare(b.path));
}

export type DoctorCheck = { name: string; status: string; message: string };

export type BrainOverview = {
  store: {
    path: string;
    totalFiles: number;
    folders: { name: string; files: number }[];
  };
  doctor: {
    connected: boolean;
    status: string;
    healthScore: number | null;
    checks: DoctorCheck[];
    detail: string;
  };
};

export type GBrainStats = {
  pages: number;
  chunks: number;
  embedded: number;
  /** Ingested wikilink edges. Zero on a store full of links means a dead ingest. */
  links: number;
  /** Dated events the dream phases build. Zero alongside links is the same bug. */
  timeline: number;
  byType: { type: string; count: number }[];
};

export type CaptureInput = { text: string; title?: string; type?: string; slug?: string };
export type CaptureOutcome =
  | { ok: true; slug: string; contentHash: string }
  | { ok: false; error: string };

/** Parse the plain-text output of `gbrain stats` into structured counts. */
export function parseGbrainStats(text: string): GBrainStats {
  const num = (label: string): number => {
    const m = text.match(new RegExp(`${label}:\\s*(\\d+)`, 'i'));
    return m ? Number(m[1]) : 0;
  };
  const byType: { type: string; count: number }[] = [];
  const afterHeader = text.split(/By type:/i)[1] ?? '';
  for (const line of afterHeader.split('\n')) {
    const m = line.match(/^\s+([\w-]+):\s*(\d+)\s*$/);
    if (m) byType.push({ type: m[1], count: Number(m[2]) });
  }
  return {
    pages: num('Pages'),
    chunks: num('Chunks'),
    embedded: num('Embedded'),
    links: num('Links'),
    timeline: num('Timeline'),
    byType,
  };
}

/**
 * Parse `gbrain query` output into results.
 *
 * The CLI prints a multi-LINE record per hit, headed by a score marker:
 *
 * [0.8641] conversations/2026/01/-greeting -- # Greeting
 * <blank>
 * *(no messages)*
 * [0.6839] projects/webinar-examples -- # Webinar Examples
 *
 * Splitting on newlines and calling each line a result — which is what this
 * did until — turns a body line like `hello` into the result
 * `hello — hello` and leaves `[0.8641]` glued to the front of the title. So
 * a record starts at a header line and swallows everything up to the next one.
 *
 * Ordered best-first: the CLI does not sort, and anything reading the top of
 * this list (the /brain query card, a Hermes memory brief) wants the best hit
 * there rather than whichever one came back first.
 */
const QUERY_HEAD = /^(?:\[(\d*\.?\d+)\]\s+)?(\S+)\s+--\s*(.*)$/;

export function parseQueryOutput(stdout: string): BrainSearchResult[] {
  const results: { title: string; parts: string[]; score?: number }[] = [];
  for (const line of stdout.split('\n')) {
    const head = QUERY_HEAD.exec(line);
    if (head) {
      results.push({
        title: head[2],
        score: head[1] === undefined ? undefined : Number(head[1]),
        parts: head[3] ? [head[3]] : [],
      });
    } else if (results.length > 0 && line.trim()) {
      results[results.length - 1].parts.push(line.trim());
    }
    // a body line before any header belongs to nothing — drop it
  }

  return results
    .map((r) => ({
      title: r.title,
      snippet: (r.parts.join(' ').replace(/\s+/g, ' ').trim() || r.title).slice(0, 400),
      source: 'gbrain',
      ...(r.score === undefined ? {} : { score: r.score }),
    }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

export type GBrainProvider = BrainProvider & {
  localStats(): Promise<{ markdownFiles: number; storePath: string }>;
  overview(): Promise<BrainOverview>;
  stats(): Promise<GBrainStats | null>;
  capture(input: CaptureInput): Promise<CaptureOutcome>;
};

function storeFolders(storePath: string): { name: string; files: number }[] {
  const counts = new Map<string, number>();
  for (const file of walkMarkdown(storePath)) {
    const rel = path.relative(storePath, file);
    const top = rel.includes(path.sep) ? rel.split(path.sep)[0] : '(root)';
    counts.set(top, (counts.get(top) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, files]) => ({ name, files }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function createGBrainProvider(opts: { exec?: ExecFn; storePath?: string } = {}): GBrainProvider {
  const exec = opts.exec ?? defaultExec;
  const storePath = opts.storePath ?? DEFAULT_STORE;

  return {
    name: 'gbrain',

    async status(): Promise<BrainStatus> {
      const localFiles = walkMarkdown(storePath).length;
      const result = await exec(GBRAIN_BIN, ['doctor', '--json', '--fast']);
      if (result.code === 0 && result.stdout.trim()) {
        try {
          const doctor = JSON.parse(result.stdout) as { status?: string; health_score?: number };
          return {
            connected: true,
            provider: 'gbrain',
            detail: `gbrain ${doctor.status ?? 'ok'} · health ${doctor.health_score ?? '?'}/100 · ${localFiles} local pages in brain-store`,
          };
        } catch {
          // fall through to the error path below
        }
      }
      const firstError = (result.stderr || result.stdout).split('\n').find(Boolean) ?? 'gbrain CLI unavailable';
      return {
        connected: false,
        provider: 'gbrain',
        detail: `${firstError.trim().slice(0, 200)} · local fallback active (${localFiles} markdown pages)`,
      };
    },

    async search(query: string): Promise<BrainSearchResult[]> {
      const result = await exec(GBRAIN_BIN, ['query', query, '--no-expand']);
      if (result.code === 0 && result.stdout.trim() && !/cannot connect/i.test(result.stdout)) {
        const parsed = parseQueryOutput(result.stdout).slice(0, 8);
        // An empty parse means the CLI answered with something that is not a
        // result set. Fall through rather than reporting a confident nothing.
        if (parsed.length > 0) return parsed;
      }
      return localSearch(storePath, query);
    },

    async localStats() {
      return { markdownFiles: walkMarkdown(storePath).length, storePath };
    },

    async overview(): Promise<BrainOverview> {
      const folders = storeFolders(storePath);
      const store = {
        path: storePath,
        totalFiles: folders.reduce((sum, f) => sum + f.files, 0),
        folders,
      };

      const result = await exec(GBRAIN_BIN, ['doctor', '--json', '--fast']);
      if (result.code === 0 && result.stdout.trim()) {
        try {
          const doctor = JSON.parse(result.stdout) as {
            status?: string;
            health_score?: number;
            checks?: { name?: string; status?: string; message?: string }[];
          };
          return {
            store,
            doctor: {
              connected: true,
              status: doctor.status ?? 'ok',
              healthScore: doctor.health_score ?? null,
              checks: (doctor.checks ?? []).map((c) => ({
                name: c.name ?? 'unknown',
                status: c.status ?? 'unknown',
                message: c.message ?? '',
              })),
              detail: `gbrain ${doctor.status ?? 'ok'} · health ${doctor.health_score ?? '?'}/100`,
            },
          };
        } catch {
          // fall through to the disconnected path below
        }
      }
      const firstError = (result.stderr || result.stdout).split('\n').find(Boolean) ?? 'gbrain CLI unavailable';
      return {
        store,
        doctor: {
          connected: false,
          status: 'unreachable',
          healthScore: null,
          checks: [],
          detail: firstError.trim().slice(0, 200),
        },
      };
    },

    async stats(): Promise<GBrainStats | null> {
      const result = await exec(GBRAIN_BIN, ['stats']);
      if (result.code === 0 && /Pages:/i.test(result.stdout)) {
        return parseGbrainStats(result.stdout);
      }
      return null;
    },

    async capture(input: CaptureInput): Promise<CaptureOutcome> {
      const title = input.title?.trim();
      const body = input.text.trim();
      if (!body) return { ok: false, error: 'nothing to capture (empty content)' };
      const content = title ? `# ${title}\n\n${body}` : body;

      const args = ['capture', '--stdin', '--json'];
      if (input.type) args.push('--type', input.type);
      if (input.slug) args.push('--slug', input.slug);

      const result = await exec(GBRAIN_BIN, args, content);
      if (result.code === 0 && result.stdout.trim()) {
        try {
          const receipt = JSON.parse(result.stdout) as { slug?: string; content_hash?: string };
          if (receipt.slug) {
            return { ok: true, slug: receipt.slug, contentHash: receipt.content_hash ?? '' };
          }
        } catch {
          // malformed JSON — fall through to the honest error path
        }
      }
      const err = (result.stderr || result.stdout).split('\n').find(Boolean) ?? 'gbrain capture failed';
      return { ok: false, error: err.trim().slice(0, 200) };
    },
  };
}
