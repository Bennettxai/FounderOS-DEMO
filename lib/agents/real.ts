/**
 * The NikOS agent roster. Every run() does real work against a local source
 * on this machine — no seeded numbers, no fake green lights. Agents whose
 * source is missing or offline fail honestly with setup instructions.
 *
 * Pillars map 1:1 to seeded departments in lib/seed.ts (enforced by
 * tests/seed.test.ts). Top-level agents are leads; workers sit beneath them
 * in the org chart via parentId (seed-side only).
 *
 * Rule of thumb: a run() must finish in well under a second when the source
 * is present, and must never throw — every source is read defensively.
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { BRAIN_SOURCES, getBrainProvider } from '@/lib/brain';
import { AGENT_BRAIN_SOURCES } from '@/lib/brain-graph';
import { localStackStatus } from '@/lib/connectors/local-stack';
import { brainzBotStatus, brainzBots } from '@/lib/connectors/brainz';
import { readCronJobs } from '@/lib/connectors/hermes-cron';
import { readFleetCoverage, fleetIsStale } from '@/lib/connectors/diagmap';
import { NIKOS_PATHS } from '@/lib/nikos-paths';
import type { LlmToolSpec } from '@/lib/connectors/llm';
import type { AgentRunResult, RuntimeAgent } from '@/lib/agents/runtime';

const label = (r: AgentRunResult) => (r.ok ? 'LIVE' : 'DOWN');

type ExecResult = { code: number; stdout: string; stderr: string };

function exec(cmd: string, args: string[], timeoutMs = 10_000, cwd?: string): Promise<ExecResult> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, cwd, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({
        code: err ? 1 : 0,
        stdout: stdout?.toString() ?? '',
        stderr: stderr?.toString() || (err ? err.message : ''),
      });
    });
  });
}

// ── Diagnostic Maps ─────────────────────────────────────────────────────────

async function mapBuilderRun(): Promise<AgentRunResult> {
  const fleet = readFleetCoverage();
  if (!fleet) {
    return { ok: false, summary: 'Fleet-Coverage.json missing — run scripts/generate-fleet-coverage.cjs' };
  }
  const familyList = Object.entries(fleet.families)
    .map(([f, n]) => `${f}×${n}`)
    .join(' ');
  const stale = fleetIsStale();
  return {
    ok: true,
    summary: `${fleet.total} canonical maps · ${familyList} · dashboard ${stale ? 'STALE' : 'current'}`,
    data: { total: fleet.total, families: fleet.families, stale },
  };
}

async function guidedQaRun(): Promise<AgentRunResult> {
  const script = path.join(NIKOS_PATHS.diagmap, 'scripts', 'guided-walk-audit.cjs');
  if (!fs.existsSync(script)) return { ok: false, summary: 'guided-walk-audit.cjs not found in the repo' };
  const r = await exec('node', [script], 90_000, NIKOS_PATHS.diagmap);
  if (r.code !== 0) return { ok: false, summary: `guided-walk audit failed: ${r.stderr.slice(0, 160)}` };
  const summary = r.stdout
    .split('\n')
    .filter((l) => l.startsWith('SCANNED') || l.startsWith('Files with issues'))
    .join(' · ');
  const clean = /total issue-lines: 0/.test(r.stdout);
  return {
    ok: clean,
    summary: summary || `audit ran (no summary line) — ${clean ? 'clean' : 'issues found'}`,
    data: { clean, output: r.stdout.slice(0, 600) },
  };
}

async function fleetCoverageRun(): Promise<AgentRunResult> {
  const script = path.join(NIKOS_PATHS.diagmap, 'scripts', 'generate-fleet-coverage.cjs');
  if (!fs.existsSync(script)) return { ok: false, summary: 'generate-fleet-coverage.cjs not found in the repo' };
  const r = await exec('node', [script, '--check'], 60_000, NIKOS_PATHS.diagmap);
  return {
    ok: r.code === 0,
    summary:
      r.code === 0
        ? 'Fleet gate clean — dashboard matches the canonical fleet'
        : `Fleet gate FAILED: ${(r.stderr || r.stdout).slice(0, 220)}`,
  };
}

// ── Field Ops (OpenFieldPro) ────────────────────────────────────────────────

async function releaseGateRun(): Promise<AgentRunResult> {
  const file = path.join(NIKOS_PATHS.openfieldpro, 'docs', 'release', 'RELEASE_CHECKLIST.md');
  try {
    const content = fs.readFileSync(file, 'utf8');
    const open = (content.match(/- \[ \]/g) || []).length;
    const done = (content.match(/- \[x\]/gi) || []).length;
    return {
      ok: open === 0,
      summary: `OpenFieldPro release checklist: ${done} done · ${open} open — ${
        open === 0 ? 'release-candidate clear' : 'hardening in progress'
      }`,
      data: { open, done },
    };
  } catch {
    return { ok: false, summary: `No release checklist at ${file} — set NIKOS_OPENFIELDPRO_PATH` };
  }
}

async function opsDataRun(): Promise<AgentRunResult> {
  if (!fs.existsSync(NIKOS_PATHS.openfieldpro)) {
    return { ok: false, summary: 'openfieldpro repo not found — set NIKOS_OPENFIELDPRO_PATH' };
  }
  return {
    ok: false,
    summary:
      'OpenFieldPro repo present; live ops data needs the Postgres/Fastify stack running (docker compose up in openfieldpro/)',
  };
}

// ── Development ─────────────────────────────────────────────────────────────

async function codeWorkerRun(): Promise<AgentRunResult> {
  const [status, branch, last] = await Promise.all([
    exec('git', ['status', '--porcelain'], 10_000, NIKOS_PATHS.home),
    exec('git', ['branch', '--show-current'], 10_000, NIKOS_PATHS.home),
    exec('git', ['log', '-1', '--format=%cs'], 10_000, NIKOS_PATHS.home),
  ]);
  const uncommitted = status.stdout.split('\n').filter(Boolean).length;
  return {
    ok: uncommitted < 20,
    summary: `home repo on ${branch.stdout.trim() || '?'} · ${uncommitted} uncommitted change(s) · last commit ${last.stdout.trim() || '?'}`,
    data: { uncommitted, branch: branch.stdout.trim() },
  };
}

async function testWorkerRun(): Promise<AgentRunResult> {
  const testsDir = path.resolve(__dirname, '..', '..', 'tests');
  let files: string[] = [];
  try {
    files = fs.readdirSync(testsDir).filter((f) => f.endsWith('.test.ts'));
  } catch {
    return { ok: false, summary: 'No tests/ dir in this repo — nothing to verify yet' };
  }
  let tests = 0;
  for (const f of files) {
    try {
      tests += (fs.readFileSync(path.join(testsDir, f), 'utf8').match(/\btest\(|\bit\(/g) || []).length;
    } catch {
      /* skip unreadable */
    }
  }
  return { ok: true, summary: `${files.length} test files · ~${tests} tests — run npm test to verify` };
}

// ── Research ────────────────────────────────────────────────────────────────

async function bountyRadarRun(): Promise<AgentRunResult> {
  const script = path.join(NIKOS_PATHS.bounty, 'bounty_radar.py');
  if (!fs.existsSync(script)) return { ok: false, summary: 'bounty_radar.py not found — set NIKOS_BOUNTY_PATH' };
  const gh = await exec('gh', ['auth', 'status'], 5_000);
  if (gh.code !== 0) {
    return { ok: false, summary: `gh not authenticated: ${gh.stderr.split('\n')[0].slice(0, 140)}` };
  }
  return { ok: true, summary: 'Bounty Radar ready — gh authenticated; run a scan to pull fresh bounties' };
}

async function surfResearchRun(): Promise<AgentRunResult> {
  if (!fs.existsSync(NIKOS_PATHS.surfsense)) {
    return { ok: false, summary: 'SurfSense repo not found — set NIKOS_SURFSENSE_PATH' };
  }
  const probe = await fetch('http://localhost:8000', { signal: AbortSignal.timeout(1500) }).then(
    (r) => r.status > 0,
    () => false,
  );
  return {
    ok: probe,
    summary: probe
      ? 'SurfSense backend responding on :8000'
      : 'SurfSense repo present; backend not running (docker compose up in SurfSense/)',
  };
}

// ── Models ──────────────────────────────────────────────────────────────────

async function evalRunnerRun(): Promise<AgentRunResult> {
  const llamaBuild = fs.existsSync(path.join(NIKOS_PATHS.home, 'llama.cpp', 'build', 'bin'));
  let modelCount = 0;
  try {
    modelCount = fs.readdirSync(NIKOS_PATHS.models).filter((f) => /\.(gguf|safetensors)$/i.test(f)).length;
  } catch {
    /* models/ missing */
  }
  return {
    ok: llamaBuild || modelCount > 0,
    summary: `llama.cpp build ${llamaBuild ? 'present' : 'missing'} · ${modelCount} model file(s) in models/`,
  };
}

async function trainingRunRun(): Promise<AgentRunResult> {
  const ot = path.join(NIKOS_PATHS.home, 'OneTrainer');
  if (!fs.existsSync(ot)) return { ok: false, summary: 'OneTrainer not found under home' };
  let ws = 0;
  try {
    ws = fs.readdirSync(path.join(ot, 'workspace')).length;
  } catch {
    /* no workspace dir */
  }
  return { ok: true, summary: `OneTrainer present · ${ws} workspace entr${ws === 1 ? 'y' : 'ies'}` };
}

// ── Picks (Brainz bots) ─────────────────────────────────────────────────────

async function brainzBotRun(bot: string): Promise<AgentRunResult> {
  const s = brainzBotStatus(bot);
  if (!s) return { ok: false, summary: `No status.json for ${bot} — bot has not run yet` };
  return {
    ok: s.status === 'ok',
    summary: `${bot}: ${s.status} · ${s.summary ?? ''}${s.finished_at ? ` · ${s.finished_at}` : ''}`,
  };
}

async function sysbotRun(): Promise<AgentRunResult> {
  const bots = brainzBots();
  const ok = bots.filter((b) => brainzBotStatus(b.bot)?.status === 'ok').length;
  return {
    ok: bots.length > 0,
    summary: `${bots.length} Brainz bots · ${ok} ok · ${bots.length - ok} other — see the Brainz connector for the full list`,
  };
}

// ── Operations ──────────────────────────────────────────────────────────────

async function cronHealthRun(): Promise<AgentRunResult> {
  const snap = readCronJobs();
  if (!snap) return { ok: false, summary: 'Hermes jobs.json missing or unreadable' };
  const ok = snap.tally.ok ?? 0;
  const degraded = snap.tally.degraded ?? 0;
  const failed = snap.tally.failed ?? 0;
  const skipped = snap.tally.skipped ?? 0;
  const jobs = snap.jobs.length;
  return {
    ok: failed === 0,
    summary: `Hermes cron: ${jobs} jobs · ${ok} ok · ${degraded} degraded · ${skipped} skipped · ${failed} failed · updated ${snap.updatedAt}`,
    data: snap.tally,
  };
}

async function githubAgentRun(): Promise<AgentRunResult> {
  const [gh, remote] = await Promise.all([
    exec('gh', ['auth', 'status'], 5_000),
    exec('git', ['remote', 'get-url', 'origin'], 5_000, NIKOS_PATHS.home),
  ]);
  return {
    ok: gh.code === 0,
    summary:
      gh.code === 0 ? `gh authenticated · origin ${remote.stdout.trim() || 'unknown'}` : 'gh not authenticated — run gh auth login',
  };
}

async function driftSentinelRun(): Promise<AgentRunResult> {
  const r = await exec('git', ['status', '--porcelain'], 10_000, NIKOS_PATHS.home);
  const uncommitted = r.stdout.split('\n').filter(Boolean).length;
  return {
    ok: uncommitted < 25,
    summary:
      uncommitted === 0
        ? 'home repo clean — no drift'
        : `${uncommitted} uncommitted change(s) in home repo — ${uncommitted < 25 ? 'acceptable' : 'DRIFT — snapshot soon'}`,
    data: { uncommitted },
  };
}

// ── Knowledge (the brain) ───────────────────────────────────────────────────

async function knowledgeRun(): Promise<AgentRunResult> {
  const status = await getBrainProvider().status();
  return {
    ok: status.connected,
    summary: `${status.provider} brain · ${status.detail}`,
    data: status,
  };
}

/**
 * Resolve an agent's AGENT_BRAIN_SOURCES scope to the concrete source list
 * that will actually be searched: an explicit list, or the full corpus when
 * the agent has no entry / a '*' scope. The boundary is reported back with
 * every search so chat replies can name the exact sources they drew from.
 */
function brainSourcesFor(agentId: string): { sources: string[]; label: string } {
  const scope = AGENT_BRAIN_SOURCES[agentId];
  if (!scope || scope.includes('*')) return { sources: [...BRAIN_SOURCES], label: 'all sources' };
  return { sources: [...scope], label: scope.join(', ') };
}

async function knowledgeRespond(message: string, agentId: string): Promise<AgentRunResult> {
  const { sources, label } = brainSourcesFor(agentId);
  const results = await getBrainProvider().search(message, { sources });
  if (results.length === 0) {
    return {
      ok: false,
      summary: `Nothing in the knowledge base matches "${message.slice(0, 80)}" (searched ${label})`,
    };
  }
  return {
    ok: true,
    summary: `searched ${label} — ${results.map((r) => `· ${r.title} (${r.source})`).join('\n')}`,
    data: { sources, results },
  };
}

/** Read-only brain search tool scoped to the agent's AGENT_BRAIN_SOURCES. */
function knowledgeTools(agentId: string): LlmToolSpec[] {
  const { sources, label } = brainSourcesFor(agentId);
  return [
    {
      name: 'searchGBrain',
      description: `Search the knowledge base within this agent's brain sources: ${label}. Read-only.`,
      parameters: z.object({
        query: z.string().describe('Natural-language or model-number search query'),
      }),
      execute: async (args) => {
        const query = typeof args.query === 'string' ? args.query : '';
        const results = await getBrainProvider().search(query, { sources });
        // Report the boundary the agent worked within, alongside the hits.
        return { sources, results };
      },
    },
  ];
}

// ── Leads (aggregate their workers) ─────────────────────────────────────────

const lead =
  (id: string, name: string, description: string, departmentId: string, workers: RuntimeAgent[]) =>
  (): RuntimeAgent => ({
    id,
    name,
    description,
    departmentId,
    async run() {
      const results = await Promise.all(workers.map((w) => w.run()));
      const live = results.filter((r) => r.ok).length;
      return {
        ok: live > 0,
        summary: `${live}/${workers.length} workers live — ${results
          .map((r, i) => `${workers[i].id} ${label(r)}`)
          .join(' · ')}`,
        data: results,
      };
    },
  });

const fieldopsWorkers: RuntimeAgent[] = [
  { id: 'release-gate', name: 'Release Gate', description: 'Tracks open items on the OpenFieldPro release checklist.', departmentId: 'dept-fieldops', run: releaseGateRun },
  { id: 'ops-data', name: 'Ops Data', description: 'Live field-ops data from the OpenFieldPro stack.', departmentId: 'dept-fieldops', run: opsDataRun },
];
const devWorkers: RuntimeAgent[] = [
  { id: 'code-worker', name: 'Code Worker', description: 'Repo health: branch, uncommitted changes, last commit date.', departmentId: 'dept-dev', run: codeWorkerRun },
  { id: 'test-worker', name: 'Test Worker', description: 'Test-suite inventory and the npm test entry point.', departmentId: 'dept-dev', run: testWorkerRun },
];
const researchWorkers: RuntimeAgent[] = [
  { id: 'bounty-radar', name: 'Bounty Radar', description: 'GitHub bounty scanner readiness (script + gh auth).', departmentId: 'dept-research', run: bountyRadarRun },
  { id: 'surf-research', name: 'Surf Research', description: 'SurfSense self-hosted research agent (RAG over personal sources).', departmentId: 'dept-research', run: surfResearchRun },
];
const modelsWorkers: RuntimeAgent[] = [
  { id: 'eval-runner', name: 'Eval Runner', description: 'Local inference + eval toolchain (llama.cpp build, model files).', departmentId: 'dept-models', run: evalRunnerRun },
  { id: 'training-run', name: 'Training Run', description: 'OneTrainer training workspace status.', departmentId: 'dept-models', run: trainingRunRun },
];
const picksWorkers: RuntimeAgent[] = [
  { id: 'sportsclaw', name: 'SportsClaw', description: 'Sports pick bot — reads its Brainz run-record.', departmentId: 'dept-picks', run: () => brainzBotRun('sportsclaw'), chatTools: () => knowledgeTools('sportsclaw') },
  { id: 'tradingdesk', name: 'TradingDesk', description: 'Trading pick bot — reads its Brainz run-record.', departmentId: 'dept-picks', run: () => brainzBotRun('tradingdesk'), chatTools: () => knowledgeTools('tradingdesk') },
  { id: 'sysbot', name: 'SysBot', description: 'Brainz ecosystem health: tally of all bot run-records.', departmentId: 'dept-picks', run: sysbotRun, chatTools: () => knowledgeTools('sysbot') },
];
const opsWorkers: RuntimeAgent[] = [
  { id: 'cron-health', name: 'Cron Health', description: 'Hermes scheduled-job health from jobs.json.', departmentId: 'dept-ops', run: cronHealthRun, chatTools: () => knowledgeTools('cron-health') },
  { id: 'github-agent', name: 'GitHub Agent', description: 'GitHub CLI auth and the home repo remote.', departmentId: 'dept-ops', run: githubAgentRun, chatTools: () => knowledgeTools('github-agent') },
  { id: 'drift-sentinel', name: 'Drift Sentinel', description: 'Uncommitted drift on the home repo.', departmentId: 'dept-ops', run: driftSentinelRun, chatTools: () => knowledgeTools('drift-sentinel') },
];

export const realAgents: RuntimeAgent[] = [
  // ── Orchestrator ─────────────────────────────────────────────────────────
  {
    id: 'conductor',
    name: 'Conductor',
    description: 'Orchestrator: fans broadcasts out to every agent and reports which local instance hosts are up.',
    departmentId: 'dept-ops',
    async run() {
      const stack = await localStackStatus();
      return {
        ok: stack.state === 'connected',
        summary: `Instance hosts on this machine: ${stack.detail}`,
        data: stack.meta,
      };
    },
  },

  // ── Diagnostic Maps ──────────────────────────────────────────────────────
  {
    id: 'map-builder',
    name: 'Map Builder',
    description: 'Owns the canonical fleet: counts maps per family and reports fleet-dashboard freshness.',
    departmentId: 'dept-diagmaps',
    run: mapBuilderRun,
    chatTools: () => knowledgeTools('map-builder'),
  },
  {
    id: 'guided-qa',
    name: 'Guided-Walk QA',
    description: 'Runs the guided-walk audit across canonical maps: duplication, no-narrow, loops, dead-ends.',
    departmentId: 'dept-diagmaps',
    run: guidedQaRun,
    chatTools: () => knowledgeTools('guided-qa'),
  },
  {
    id: 'fleet-coverage',
    name: 'Fleet Coverage',
    description: 'Runs the deterministic fleet gate (generate-fleet-coverage --check).',
    departmentId: 'dept-diagmaps',
    run: fleetCoverageRun,
    chatTools: () => knowledgeTools('fleet-coverage'),
  },

  // ── Field Ops ────────────────────────────────────────────────────────────
  lead('fieldops-agent', 'Field Ops Agent', 'Aggregates the OpenFieldPro release gate and ops-data workers.', 'dept-fieldops', fieldopsWorkers)(),
  ...fieldopsWorkers,

  // ── Development ──────────────────────────────────────────────────────────
  lead('dev-agent', 'Dev Agent', 'Aggregates the code and test workers.', 'dept-dev', devWorkers)(),
  ...devWorkers,

  // ── Research ─────────────────────────────────────────────────────────────
  lead('research-agent', 'Research Agent', 'Aggregates bounty radar and SurfSense research workers.', 'dept-research', researchWorkers)(),
  ...researchWorkers,
  {
    id: 'data-agent',
    name: 'Data Agent',
    description:
      'Answers questions from the knowledge base: canonical diagnostic maps, docs, and the knowledge graph.',
    departmentId: 'dept-research',
    run: knowledgeRun,
    respond: (message) => knowledgeRespond(message, 'data-agent'),
    chatTools: () => knowledgeTools('data-agent'),
  },

  // ── Models ───────────────────────────────────────────────────────────────
  lead('models-agent', 'Models Agent', 'Aggregates the eval and training workers for the local model stack.', 'dept-models', modelsWorkers)(),
  ...modelsWorkers,

  // ── Picks (Brainz) ───────────────────────────────────────────────────────
  { ...lead('picks-agent', 'Picks Agent', 'Aggregates the Brainz pick bots (sports, trading, sysbot).', 'dept-picks', picksWorkers)(), chatTools: () => knowledgeTools('picks-agent') },
  ...picksWorkers,

  // ── Operations ───────────────────────────────────────────────────────────
  { ...lead('ops-agent', 'Ops Agent', 'Aggregates cron health, GitHub auth, and drift sentinel.', 'dept-ops', opsWorkers)(), chatTools: () => knowledgeTools('ops-agent') },
  ...opsWorkers,
];
