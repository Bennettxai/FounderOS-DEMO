/**
 * Brain adapters for NikOS.
 *
 * - `gbrain` (default): shells out to the installed gbrain CLI with a local
 *   markdown fallback — kept for back-compat with the upstream shell.
 * - `nikos`: deterministic local search over The-Diagnostic-Map — the
 *   canonical fleet index (Fleet-Coverage.json), the markdown docs, and the
 *   understand-anything knowledge graph (.ua/knowledge-graph.json). No
 *   network, no CLI dependency; chosen via BRAIN_PROVIDER=nikos.
 * - `stub`: inert provider for tests.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createGBrainProvider } from '@/lib/connectors/gbrain';
import { readFleetCoverage } from '@/lib/connectors/diagmap';
import { NIKOS_PATHS } from '@/lib/nikos-paths';

export type BrainStatus = {
  connected: boolean;
  provider: string;
  detail: string;
};

export type BrainSearchResult = {
  title: string;
  snippet: string;
  source: string;
};

export interface BrainProvider {
  name: string;
  status(): Promise<BrainStatus>;
  search(query: string): Promise<BrainSearchResult[]>;
}

const stubProvider: BrainProvider = {
  name: 'stub',
  async status() {
    return {
      connected: false,
      provider: 'stub',
      detail:
        'G Brain is not wired yet. Implement a BrainProvider in lib/brain.ts and set BRAIN_PROVIDER to activate it.',
    };
  },
  async search() {
    return [];
  },
};

// ── NikOS provider: search the diagnostic-map corpus locally ────────────────

function walkMarkdown(dir: string, files: string[] = []): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkMarkdown(full, files);
    else if (entry.name.endsWith('.md')) files.push(full);
  }
  return files;
}

function kgNodes(): { name: string; summary: string; tags: string[] }[] {
  try {
    const raw: unknown = JSON.parse(
      fs.readFileSync(path.join(NIKOS_PATHS.diagmap, '.ua', 'knowledge-graph.json'), 'utf8'),
    );
    const nodes = (raw as { nodes?: unknown[] }).nodes;
    if (!Array.isArray(nodes)) return [];
    return nodes
      .map((n) => {
        const node = n as { name?: unknown; summary?: unknown; tags?: unknown };
        return {
          name: typeof node.name === 'string' ? node.name : '',
          summary: typeof node.summary === 'string' ? node.summary : '',
          tags: Array.isArray(node.tags) ? node.tags.filter((t): t is string => typeof t === 'string') : [],
        };
      })
      .filter((n) => n.name);
  } catch {
    return [];
  }
}

const nikosProvider: BrainProvider = {
  name: 'nikos',
  async status() {
    const dm = NIKOS_PATHS.diagmap;
    if (!fs.existsSync(dm)) {
      return {
        connected: false,
        provider: 'nikos',
        detail: `The-Diagnostic-Map repo not found at ${dm} — set NIKOS_DIAGMAP_PATH.`,
      };
    }
    const fleet = readFleetCoverage();
    const mdCount = walkMarkdown(dm).length;
    const kg = kgNodes().length;
    return {
      connected: true,
      provider: 'nikos',
      detail: `The-Diagnostic-Map corpus: ${fleet?.total ?? 0} canonical maps · ${mdCount} markdown pages · ${kg} knowledge-graph nodes`,
    };
  },
  async search(query: string) {
    const q = query.toLowerCase();
    const hits: BrainSearchResult[] = [];

    // 1) Canonical fleet index — model-number lookups, the most common ask.
    const fleet = readFleetCoverage();
    if (fleet) {
      for (const m of fleet.maps) {
        const hay = `${m.family} ${m.model} ${m.filename} ${m.version ?? ''}`.toLowerCase();
        if (hay.includes(q)) {
          hits.push({
            title: `${m.family} ${m.model}`,
            snippet: `${m.filename} · ${m.version ?? 'no version'}`,
            source: 'canonical-maps',
          });
        }
      }
    }

    // 2) Markdown docs (Reference theory docs, READMEs, docs/).
    for (const file of walkMarkdown(NIKOS_PATHS.diagmap)) {
      let content: string;
      try {
        content = fs.readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      const line = content.split('\n').find((l) => l.toLowerCase().includes(q));
      if (line) {
        hits.push({
          title: path.relative(NIKOS_PATHS.diagmap, file).replace(/\.md$/, ''),
          snippet: line.trim().slice(0, 240),
          source: 'diagmap-docs',
        });
      }
    }

    // 3) Understand-Anything knowledge graph nodes.
    for (const n of kgNodes()) {
      if ((`${n.name} ${n.summary} ${n.tags.join(' ')}`).toLowerCase().includes(q)) {
        hits.push({
          title: n.name,
          snippet: (n.summary || n.tags.join(', ')).slice(0, 240),
          source: 'knowledge-graph',
        });
      }
    }

    return hits.slice(0, 10);
  },
};

/**
 * NikOS overview for the /brain Doctor view: the diagnostic-map corpus as
 * the store, with doctor checks that are honest and local (fleet index,
 * markdown corpus, knowledge graph).
 */
export async function nikosOverview() {
  const dm = NIKOS_PATHS.diagmap;
  const fleet = readFleetCoverage();
  const mdCount = walkMarkdown(dm).length;
  const kgCount = kgNodes().length;
  const present = fs.existsSync(dm);
  const freshness = fleet ? (() => {
    try {
      const maps = fs
        .readdirSync(path.join(dm, 'Canonical'))
        .filter((f) => f.endsWith('.html'))
        .map((f) => fs.statSync(path.join(dm, 'Canonical', f)).mtimeMs);
      if (!maps.length) return null;
      return fs.statSync(path.join(dm, 'Canonical', 'Fleet-Coverage.html')).mtimeMs - Math.max(...maps);
    } catch {
      return null;
    }
  })() : null;
  const stale = freshness !== null && freshness < 0;

  return {
    store: {
      path: dm,
      totalFiles: mdCount,
      folders: fleet ? Object.entries(fleet.families).map(([name, files]) => ({ name, files })) : [],
    },
    doctor: {
      connected: present && fleet !== null,
      status: present && fleet !== null ? 'ok' : 'unreachable',
      healthScore: present && fleet !== null ? (stale ? 70 : 95) : null,
      checks: [
        {
          name: 'canonical-fleet',
          status: fleet !== null ? 'ok' : 'error',
          message: fleet ? `${fleet.total} canonical maps across ${Object.keys(fleet.families).length} families` : 'Fleet-Coverage.json missing',
        },
        {
          name: 'fleet-dashboard',
          status: fleet !== null && !stale ? 'ok' : 'warn',
          message: stale ? 'Dashboard is stale — re-run the fleet gate' : 'Dashboard current',
        },
        {
          name: 'markdown-corpus',
          status: mdCount > 0 ? 'ok' : 'warn',
          message: `${mdCount} markdown pages on disk`,
        },
        {
          name: 'knowledge-graph',
          status: kgCount > 0 ? 'ok' : 'warn',
          message: `${kgCount} nodes in .ua/knowledge-graph.json`,
        },
      ],
      detail: present
        ? `The-Diagnostic-Map corpus (nikos): ${fleet?.total ?? 0} canonical maps · ${mdCount} markdown pages · ${kgCount} graph nodes`
        : `The-Diagnostic-Map repo not found at ${dm} — set NIKOS_DIAGMAP_PATH`,
    },
  };
}

/** Provider-aware overview: nikos corpus stats, or the gbrain CLI doctor. */
export async function getBrainOverview() {
  return process.env.BRAIN_PROVIDER === 'nikos' ? nikosOverview() : createGBrainProvider().overview();
}

export function getBrainProvider(): BrainProvider {
  const name = process.env.BRAIN_PROVIDER ?? 'gbrain';
  if (name === 'stub') return stubProvider;
  if (name === 'nikos') return nikosProvider;
  return createGBrainProvider();
}
