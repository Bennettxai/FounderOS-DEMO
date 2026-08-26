/**
 * Brain adapters for NikOS.
 *
 * - `gbrain` (default): shells out to the installed gbrain CLI with a local
 *   markdown fallback — kept for back-compat with the upstream shell.
 * - `nikos`: deterministic local search over the whole operating memory —
 *   The-Diagnostic-Map (canonical fleet index Fleet-Coverage.json, markdown
 *   docs, the understand-anything knowledge graph .ua/knowledge-graph.json),
 *   plus Hermes skill docs (~/.hermes/skills) and Brainz contracts
 *   (~/Brainz/schemas). No network, no CLI dependency; chosen via
 *   BRAIN_PROVIDER=nikos.
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

// ── Hermes skill docs + Brainz contracts ───────────────────────────────────

/** Tolerant YAML-ish frontmatter: single-line values and `>|` block scalars. */
function parseFrontmatter(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!content.startsWith('---')) return out;
  const end = content.indexOf('\n---', 3);
  if (end === -1) return out;
  const lines = content.slice(3, end).split('\n');
  let key = '';
  let values: string[] = [];
  const flush = () => {
    if (key) out[key] = values.join(' ').replace(/^['"]|['"]$/g, '').trim();
  };
  for (const line of lines) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (m) {
      flush();
      key = m[1];
      values = [];
      const v = m[2].trim();
      if (v && v[0] !== '>' && v[0] !== '|') values.push(v); // block scalar marker carries no text
    } else if (key && /^\s+/.test(line)) {
      values.push(line.trim());
    } else if (key) {
      flush();
      key = '';
      values = [];
    }
  }
  flush();
  return out;
}

/** Hermes skill entry points: root *.md files + <skill>/SKILL.md. */
function hermesSkillDocs(): { name: string; description: string; body: string; file: string }[] {
  const skillsDir = path.join(NIKOS_PATHS.hermes, 'skills');
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const docs: { name: string; description: string; body: string; file: string }[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    let file: string;
    if (entry.isDirectory()) file = path.join(skillsDir, entry.name, 'SKILL.md');
    else if (entry.name.endsWith('.md')) file = path.join(skillsDir, entry.name);
    else continue;
    let content: string;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const fm = parseFrontmatter(content);
    const bodyStart = content.indexOf('\n---', 3);
    docs.push({
      name: fm.name || entry.name.replace(/\.md$/, ''),
      description: fm.description || '',
      body: (bodyStart === -1 ? content : content.slice(content.indexOf('\n', bodyStart + 1) + 1)).slice(0, 20000),
      file,
    });
  }
  docs.sort((a, b) => a.name.localeCompare(b.name));
  return docs;
}

/** Brainz versioned contracts (schemas/*.v1.json): title + description + field docs. */
function brainzContracts(): { name: string; title: string; description: string; fields: string }[] {
  const dir = path.join(NIKOS_PATHS.brainz, 'schemas');
  let files: string[];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  } catch {
    return [];
  }
  const out: { name: string; title: string; description: string; fields: string }[] = [];
  for (const f of files) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as {
        title?: unknown;
        description?: unknown;
        properties?: Record<string, { description?: unknown }>;
      };
      const props = raw.properties ?? {};
      const fields = Object.entries(props)
        .map(([k, v]) => (v?.description ? `${k} — ${String(v.description)}` : k))
        .join(' · ');
      out.push({
        name: f,
        title: typeof raw.title === 'string' ? raw.title : f,
        description: typeof raw.description === 'string' ? raw.description : '',
        fields,
      });
    } catch {
      /* skip unreadable schema */
    }
  }
  return out;
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
    const skills = hermesSkillDocs().length;
    const contracts = brainzContracts().length;
    return {
      connected: true,
      provider: 'nikos',
      detail: `The-Diagnostic-Map corpus: ${fleet?.total ?? 0} canonical maps · ${mdCount} markdown pages · ${kg} knowledge-graph nodes · ${skills} hermes skills · ${contracts} brainz contracts`,
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

    // 4) Hermes skill docs — how to operate the local tooling.
    for (const skill of hermesSkillDocs()) {
      if (!`${skill.name}\n${skill.description}\n${skill.body}`.toLowerCase().includes(q)) continue;
      const line = skill.body.split('\n').find((l) => l.toLowerCase().includes(q));
      hits.push({
        title: skill.name,
        snippet: (line ?? skill.description ?? path.relative(NIKOS_PATHS.hermes, skill.file)).trim().slice(0, 240),
        source: 'hermes-skills',
      });
    }

    // 5) Brainz contracts — the versioned data schemas (pick.v1, …).
    for (const c of brainzContracts()) {
      if (!`${c.name} ${c.title} ${c.description} ${c.fields}`.toLowerCase().includes(q)) continue;
      hits.push({
        title: c.name,
        snippet: (c.description || c.fields).slice(0, 240),
        source: 'brainz-contracts',
      });
    }

    return hits.slice(0, 10);
  },
};

/**
 * NikOS overview for the /brain Doctor view: the diagnostic-map corpus as
 * the store plus Hermes skills and Brainz contracts, with doctor checks that
 * are honest and local (fleet index, markdown corpus, knowledge graph,
 * skill docs, contracts).
 */
export async function nikosOverview() {
  const dm = NIKOS_PATHS.diagmap;
  const fleet = readFleetCoverage();
  const mdCount = walkMarkdown(dm).length;
  const kgCount = kgNodes().length;
  const skillsCount = hermesSkillDocs().length;
  const contractsCount = brainzContracts().length;
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
      totalFiles: mdCount + skillsCount + contractsCount,
      folders: [
        ...(fleet ? Object.entries(fleet.families).map(([name, files]) => ({ name, files })) : []),
        ...(skillsCount > 0 ? [{ name: 'hermes-skills', files: skillsCount }] : []),
        ...(contractsCount > 0 ? [{ name: 'brainz-contracts', files: contractsCount }] : []),
      ],
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
        {
          name: 'hermes-skills',
          status: skillsCount > 0 ? 'ok' : 'warn',
          message: `${skillsCount} Hermes skill docs in ~/.hermes/skills`,
        },
        {
          name: 'brainz-contracts',
          status: contractsCount > 0 ? 'ok' : 'warn',
          message: `${contractsCount} versioned schemas in Brainz/schemas`,
        },
      ],
      detail: present
        ? `The-Diagnostic-Map corpus (nikos): ${fleet?.total ?? 0} canonical maps · ${mdCount} markdown pages · ${kgCount} graph nodes · ${skillsCount} hermes skills · ${contractsCount} brainz contracts`
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
