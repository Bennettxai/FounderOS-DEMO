import { closeSync, openSync, readSync, readdirSync, statSync } from 'node:fs';
import type { Proposal, ProposalBrand } from '@/lib/schemas';
import { homedir } from 'node:os';
import path from 'node:path';
import { briefFrom, titleFromFilename } from '@/lib/deliverable-brief';

/**
 * Agent deliverables (the operator, 2026-08-11: "I don't know how to get the
 * assets created by my agents"). Paperclip agents write real files into
 * their workspace `deliverables/` folders; the OS instance on the board host
 * reads them straight off disk. Pure logic here, unit-tested — the API route
 * stays a thin handler.
 */
export const WORKSPACES_DIR =
  process.env.PAPERCLIP_WORKSPACES_DIR ??
  path.join(homedir(), '.paperclip', 'instances', 'default', 'workspaces');

export const DELIVERABLE_MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.html': 'text/html; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.json': 'application/json',
  '.zip': 'application/zip',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
};

export type Deliverable = {
  /** `<workspaceId>/<filename>` — the download key */
  id: string;
  name: string;
  workspace: string;
  sizeBytes: number;
  modifiedAt: string;
  /** A readable title taken from the file's own first heading or lede. */
  title: string;
  /** One line of what it is. Empty for binaries. */
  summary: string;
  /** Other extensions the same agent wrote the same work as, e.g. ['json']. */
  alsoAs?: string[];
};

/**
 * How much of a file is read to find its title. These documents put their
 * heading and lede in the first few hundred bytes; reading 4KB is generous and
 * keeps a 100-file listing to a handful of milliseconds off local disk.
 */
export const HEAD_BYTES = 4096;

/** Extensions whose bytes are text worth reading a title out of. */
const TEXTUAL = new Set(['.md', '.txt', '.json', '.csv', '.html', '.svg']);

/** Read at most HEAD_BYTES from a file without pulling the whole thing in. */
function readHead(full: string): string {
  let fd: number | null = null;
  try {
    fd = openSync(full, 'r');
    const buf = Buffer.alloc(HEAD_BYTES);
    const read = readSync(fd, buf, 0, HEAD_BYTES, 0);
    return buf.subarray(0, read).toString('utf8');
  } catch {
    return '';
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd);
      } catch {
        /* already gone */
      }
    }
  }
}

/**
 * One piece of work written twice is one row.
 *
 * Agents sometimes emit the same comment as both `.json` (the payload they
 * would post) and `.md` (the readable version). Collapse those, keeping the
 * readable one. ONLY within a single workspace: the same filename in two
 * workspaces is two agents' separate work — one filename routinely appears in
 * several at once, and merging those would hide the other agents' output.
 */
export function collapseSiblings<T extends Deliverable>(rows: T[]): T[] {
  const READABLE = ['.md', '.txt', '.html', '.json', '.csv'];
  const rank = (name: string) => {
    const i = READABLE.indexOf(path.extname(name).toLowerCase());
    return i === -1 ? READABLE.length : i;
  };
  const groups = new Map<string, T[]>();
  for (const r of rows) {
    const key = `${r.workspace}/${r.name.replace(/\.[a-z0-9]+$/i, '')}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const winners = new Map<string, T>();
  for (const [key, group] of groups) {
    const best = [...group].sort((a, b) => rank(a.name) - rank(b.name))[0];
    const others = group
      .filter((r) => r !== best)
      .map((r) => path.extname(r.name).replace('.', '').toLowerCase());
    winners.set(key, others.length ? ({ ...best, alsoAs: others } as T) : best);
  }
  // preserve the caller's ordering
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    const key = `${r.workspace}/${r.name.replace(/\.[a-z0-9]+$/i, '')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const w = winners.get(key);
    if (w) out.push(w);
  }
  return out;
}

export function listDeliverables(base: string = WORKSPACES_DIR): Deliverable[] {
  const out: Deliverable[] = [];
  let workspaces: string[];
  try {
    workspaces = readdirSync(base);
  } catch {
    return out; // no board on this machine — honest empty, not an error
  }
  for (const ws of workspaces) {
    const dir = path.join(base, ws, 'deliverables');
    let files: string[];
    try {
      files = readdirSync(dir);
    } catch {
      continue;
    }
    for (const f of files) {
      try {
        const full = path.join(dir, f);
        const st = statSync(full);
        if (!st.isFile()) continue;
        // the operator, 2026-08-21: the row used to print the FILENAME, which is
        // agent shorthand. The document itself opens in plain English.
        const textual = TEXTUAL.has(path.extname(f).toLowerCase());
        const brief = textual
          ? briefFrom(f, readHead(full))
          : { title: titleFromFilename(f), summary: '' };
        out.push({
          id: `${ws}/${f}`,
          name: f,
          workspace: ws,
          sizeBytes: st.size,
          modifiedAt: st.mtime.toISOString(),
          title: brief.title,
          summary: brief.summary,
        });
      } catch {
        /* unreadable file — skip, never fatal */
      }
    }
  }
  return collapseSiblings(out.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))).slice(0, 200);
}

/** Resolve a `<workspaceId>/<filename>` key to a real path INSIDE a
 *  deliverables folder, or null — rejects traversal and nesting tricks. */
export function resolveDeliverable(id: string, base: string = WORKSPACES_DIR): string | null {
  const parts = id.split('/');
  if (parts.length !== 2 || parts.some((p) => !p || p === '.' || p === '..')) return null;
  const [ws, file] = parts;
  const full = path.resolve(base, ws, 'deliverables', file);
  if (!full.startsWith(path.resolve(base) + path.sep)) return null;
  return full;
}


/**
 * Proposal folders, pinned above the agent files (the operator, 2026-08-17).
 *
 * Order is fixed rather than alphabetical: Vantage is the main business and
 * should sit first regardless of how the brands happen to sort.
 */
export const PROPOSAL_BRANDS: { id: ProposalBrand; folder: string }[] = [
  { id: 'vantage', folder: 'Vantage proposals' },
  { id: 'launchpad-cohort', folder: 'Launchpad Cohort proposals' },
];

/** A row in the Deliverables list: a downloadable agent file, or a proposal
 *  that opens in a new tab. `kind` is what the UI switches on. */
export type DeliverableItem = {
  id: string;
  name: string;
  kind: 'file' | 'link';
  /** Set on links; null on files, which download through the API instead. */
  url: string | null;
  meta: string;
  modifiedAt: string;
  sizeBytes: number | null;
  /** Gate code for a proposal link; '' for agent files, which have no gate. */
  accessCode: string;
  /** Readable title from the document itself; falls back to the filename. */
  title: string;
  /** One line of what it is. Empty for binaries and proposal links. */
  summary: string;
  /** Other extensions the same agent wrote this same work as. */
  alsoAs?: string[];
};

export type DeliverableGroup = { name: string; items: DeliverableItem[] };

/**
 * Fold proposals and agent files into ordered folders. An empty brand folder is
 * omitted rather than rendered hollow, and "Agent files" disappears when the
 * board host has nothing — so this degrades to exactly today's behaviour when
 * there are no proposals at all.
 */
export function groupDeliverables(files: Deliverable[], proposals: Proposal[]): DeliverableGroup[] {
  const groups: DeliverableGroup[] = [];

  for (const brand of PROPOSAL_BRANDS) {
    const items = proposals
      .filter((p) => p.brand === brand.id)
      .map((p) => ({
        id: `proposal:${p.id}`,
        name: p.client,
        kind: 'link' as const,
        url: p.url,
        meta: [p.status, p.amountUsd !== null ? `$${p.amountUsd.toLocaleString('en-US')}` : null]
          .filter(Boolean)
          .join(' · '),
        modifiedAt: p.createdAt,
        sizeBytes: null,
        accessCode: p.accessCode,
        title: p.client,
        summary: '',
      }));
    if (items.length) groups.push({ name: brand.folder, items });
  }

  if (files.length) {
    groups.push({
      name: 'Agent files',
      items: files.map((f) => ({
        id: f.id,
        name: f.name,
        kind: 'file' as const,
        url: null,
        meta: f.workspace.slice(0, 8),
        modifiedAt: f.modifiedAt,
        sizeBytes: f.sizeBytes,
        accessCode: '',
        title: f.title,
        summary: f.summary,
        ...(f.alsoAs ? { alsoAs: f.alsoAs } : {}),
      })),
    });
  }

  return groups;
}
