import { z } from 'zod';
import { GATED, connected as gatedConnected } from '@/lib/connectors/demo-status';
import type { ConnectorStatus } from '@/lib/connectors/types';
import { isAlertPosted, renderFailoverAlert, type FailoverAlert, type FailoverRun } from '@/lib/agent-failover';
import { COCKPIT_TITLE, cockpitIssueCreateBody, cockpitRepairPatch } from '@/lib/cockpit-issue';

/**
 * Paperclip: the agent harness. The board runs on the private network
 * (a launchd service on the laptop) and owns the REAL company: Conductor
 * (CEO) → department leads → Hermes worker pool on the dedicated host. This
 * connector reads that org live so /org and /agents can render the actual
 * company instead of seeded rows.
 *
 * Creds: PAPERCLIP_API_URL + PAPERCLIP_BOARD_KEY (a board API key) +
 * PAPERCLIP_COMPANY_ID, all in .env.local. Board keys act as the operator's
 * user via `Authorization: Bearer`.
 */

const AGENT_STATUSES = ['running', 'idle', 'paused', 'error'] as const;

export const PaperclipAgentSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  status: z.enum(AGENT_STATUSES),
  adapterType: z.string().nullable(),
  model: z.string().nullable(),
  /** when the board last heartbeat this seat — powers the live cron stat */
  lastHeartbeatAt: z.string().nullable(),
});
export type PaperclipAgent = z.infer<typeof PaperclipAgentSchema>;

export const PaperclipOrgNodeSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  role: z.string(),
  status: z.enum(AGENT_STATUSES),
  depth: z.number().int().min(0),
  parentId: z.string().nullable(),
});
export type PaperclipOrgNode = z.infer<typeof PaperclipOrgNodeSchema>;

function asStatus(value: unknown): (typeof AGENT_STATUSES)[number] {
  return AGENT_STATUSES.includes(value as (typeof AGENT_STATUSES)[number])
    ? (value as (typeof AGENT_STATUSES)[number])
    : 'idle'; // never trust the wire — unknown states collapse to idle
}

/** Map the raw agents list; malformed rows are skipped, never fatal. */
export function mapPaperclipAgents(raw: unknown[]): PaperclipAgent[] {
  const out: PaperclipAgent[] = [];
  for (const rec of raw ?? []) {
    if (!rec || typeof rec !== 'object') continue;
    const r = rec as Record<string, unknown>;
    if (typeof r.id !== 'string' || typeof r.name !== 'string' || r.name.length === 0) continue;
    // the board stores the model inside adapterConfig; top-level wins if present
    const cfg = (r.adapterConfig ?? {}) as Record<string, unknown>;
    const model =
      typeof r.model === 'string' ? r.model : typeof cfg.model === 'string' ? cfg.model : null;
    const parsed = PaperclipAgentSchema.safeParse({
      id: r.id,
      name: r.name,
      status: asStatus(r.status),
      adapterType: typeof r.adapterType === 'string' ? r.adapterType : null,
      model,
      lastHeartbeatAt: typeof r.lastHeartbeatAt === 'string' ? r.lastHeartbeatAt : null,
    });
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/** Flatten the CEO→reports tree into preorder rows with depth + parent. */
export function flattenPaperclipOrg(raw: unknown[]): PaperclipOrgNode[] {
  const out: PaperclipOrgNode[] = [];
  const walk = (nodes: unknown[], depth: number, parentId: string | null) => {
    for (const rec of nodes ?? []) {
      if (!rec || typeof rec !== 'object') continue;
      const r = rec as Record<string, unknown>;
      if (typeof r.id !== 'string' || typeof r.name !== 'string' || r.name.length === 0) continue;
      const parsed = PaperclipOrgNodeSchema.safeParse({
        id: r.id,
        name: r.name,
        role: typeof r.role === 'string' ? r.role : 'general',
        status: asStatus(r.status),
        depth,
        parentId,
      });
      if (parsed.success) {
        out.push(parsed.data);
        if (Array.isArray(r.reports)) walk(r.reports, depth + 1, r.id);
      }
    }
  };
  walk(raw ?? [], 0, null);
  return out;
}

export const PaperclipIssueSchema = z.object({
  id: z.string(),
  identifier: z.string(),
  title: z.string().min(1),
  status: z.string(),
  assigneeName: z.string().nullable(),
  updatedAt: z.string().nullable(),
});
export type PaperclipIssue = z.infer<typeof PaperclipIssueSchema>;

export const PaperclipRunSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  agentName: z.string().nullable(),
  status: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
});
export type PaperclipRun = z.infer<typeof PaperclipRunSchema>;

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

/** Map board issues (the board calls tasks "issues"); malformed rows skipped. */
export function mapPaperclipIssues(raw: unknown[]): PaperclipIssue[] {
  const out: PaperclipIssue[] = [];
  for (const rec of raw ?? []) {
    if (!rec || typeof rec !== 'object') continue;
    const r = rec as Record<string, unknown>;
    const parsed = PaperclipIssueSchema.safeParse({
      id: str(r.id),
      identifier: str(r.identifier) ?? str(r.id),
      title: str(r.title),
      status: str(r.status) ?? 'unknown',
      assigneeName: str(r.assigneeName) ?? str((r.assignee as Record<string, unknown> | undefined)?.name as string),
      updatedAt: str(r.updatedAt),
    });
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/** Map heartbeat runs; agent attribution optional (joins vary per endpoint). */
export function mapPaperclipRuns(raw: unknown[]): PaperclipRun[] {
  const out: PaperclipRun[] = [];
  for (const rec of raw ?? []) {
    if (!rec || typeof rec !== 'object') continue;
    const r = rec as Record<string, unknown>;
    const agent = (r.agent ?? {}) as Record<string, unknown>;
    const parsed = PaperclipRunSchema.safeParse({
      id: str(r.id),
      agentId: str(r.agentId) ?? str(agent.id),
      agentName: str(r.agentName) ?? str(agent.name),
      status: str(r.status) ?? 'unknown',
      startedAt: str(r.startedAt),
      finishedAt: str(r.finishedAt),
    });
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

export const PaperclipCommentSchema = z.object({
  id: z.string(),
  body: z.string().min(1),
  authorType: z.enum(['user', 'agent']),
  authorAgentId: z.string().nullable(),
  createdAt: z.string(),
});
export type PaperclipComment = z.infer<typeof PaperclipCommentSchema>;

/** Map issue-thread comments; deleted + malformed rows are skipped. */
export function mapPaperclipComments(raw: unknown[]): PaperclipComment[] {
  const out: PaperclipComment[] = [];
  for (const rec of raw ?? []) {
    if (!rec || typeof rec !== 'object') continue;
    const r = rec as Record<string, unknown>;
    if (r.deletedAt) continue;
    const parsed = PaperclipCommentSchema.safeParse({
      id: str(r.id),
      body: str(r.body),
      authorType: r.authorType === 'agent' ? 'agent' : 'user',
      authorAgentId: str(r.authorAgentId),
      createdAt: str(r.createdAt) ?? '',
    });
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

function creds() {
  const url = process.env.PAPERCLIP_API_URL;
  const key = process.env.PAPERCLIP_BOARD_KEY;
  const companyId = process.env.PAPERCLIP_COMPANY_ID;
  return url && key && companyId ? { url: url.replace(/\/$/, ''), key, companyId } : null;
}

/**
 * Fail-fast breaker. The board sits in the render path of home, org, brain,
 * agents, funnel and integrations; when it is unreachable every one of those
 * pages used to stall to the fetch timeout on EVERY request (measured 4.0s per
 * page on the host, warm). Now the first network-level failure opens the
 * breaker and every board call inside the window throws immediately; an HTTP
 * error never opens it (the board answered), and any success closes it.
 */
const BREAKER_MS = 30_000;
let boardDownUntil = 0;
let boardDownReason = '';

/** Test hook: forget a tripped breaker between cases. */
export function _resetPaperclipBreaker(): void {
  boardDownUntil = 0;
  boardDownReason = '';
}

async function boardFetch(input: string, init: RequestInit): Promise<Response> {
  const now = Date.now();
  if (now < boardDownUntil) {
    const left = Math.ceil((boardDownUntil - now) / 1000);
    throw new Error(`board unreachable (${boardDownReason}); not re-probed for ${left}s`);
  }
  try {
    // every board read is a live read; the callers' own no-store rides in init
    const res = await fetch(input, { cache: 'no-store', ...init });
    boardDownUntil = 0;
    return res;
  } catch (err) {
    // fetch itself only rejects on network-level trouble (DNS, refused,
    // timeout); HTTP errors resolve and are handled by the callers.
    boardDownReason = err instanceof Error ? err.message : String(err);
    boardDownUntil = Date.now() + BREAKER_MS;
    throw new Error(`board unreachable (${boardDownReason})`);
  }
}

async function boardGet(path: string): Promise<unknown> {
  const c = creds();
  if (!c) throw new Error('paperclip creds missing');
  const res = await boardFetch(`${c.url}/api/companies/${c.companyId}${path}`, {
    headers: { Authorization: `Bearer ${c.key}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(2500),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** The live agents list; throws when the board is unreachable/unconfigured. */
async function fetchAgents(): Promise<PaperclipAgent[]> {
  const body = await boardGet('/agents');
  const list = Array.isArray(body) ? body : ((body as { agents?: unknown[] })?.agents ?? []);
  return mapPaperclipAgents(list);
}

/** The live agents list, or [] when the board is unreachable/unconfigured. */
export async function paperclipAgents(): Promise<PaperclipAgent[]> {
  try {
    return await fetchAgents();
  } catch {
    return [];
  }
}

/** The live org tree flattened to rows, or [] when unreachable. */
export async function paperclipOrg(): Promise<PaperclipOrgNode[]> {
  try {
    const body = await boardGet('/org');
    return flattenPaperclipOrg(Array.isArray(body) ? body : []);
  } catch {
    return [];
  }
}

/** Board tasks (issues), newest first, or [] when unreachable. */
export async function paperclipIssues(limit = 30): Promise<PaperclipIssue[]> {
  try {
    const body = await boardGet(`/issues?limit=${limit}`);
    const list = Array.isArray(body) ? body : ((body as { issues?: unknown[] })?.issues ?? []);
    return mapPaperclipIssues(list);
  } catch {
    return [];
  }
}

/** Recent heartbeat runs across the company, or [] when unreachable. */
export async function paperclipRuns(limit = 30): Promise<PaperclipRun[]> {
  try {
    const body = await boardGet(`/heartbeat-runs?limit=${limit}`);
    const list = Array.isArray(body) ? body : ((body as { runs?: unknown[] })?.runs ?? []);
    return mapPaperclipRuns(list);
  } catch {
    return [];
  }
}

/** Create a task on the board (the Conductor triages it). Throws on failure so
 *  the API route can surface an honest error. */
export async function createPaperclipIssue(input: { title: string; description?: string }): Promise<PaperclipIssue | null> {
  const c = creds();
  if (!c) throw new Error('paperclip creds missing');
  const res = await boardFetch(`${c.url}/api/companies/${c.companyId}/issues`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${c.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: input.title, description: input.description ?? '' }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as Record<string, unknown>;
  const mapped = mapPaperclipIssues([body.issue ?? body]);
  return mapped[0] ?? null;
}

/** Trigger a heartbeat run for a board agent (the OS "Run" button, for real). */
export async function invokePaperclipHeartbeat(agentId: string): Promise<boolean> {
  const c = creds();
  if (!c) throw new Error('paperclip creds missing');
  const res = await boardFetch(`${c.url}/api/agents/${agentId}/heartbeat/invoke`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${c.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
    signal: AbortSignal.timeout(8000),
  });
  return res.ok;
}

const COCKPIT_PINNED_ISSUE_ID = process.env.PAPERCLIP_COCKPIT_ISSUE_ID?.trim() || null;
const COCKPIT_SCAN_PAGE_SIZE = 100;
let cockpitIssueId: string | null = null; // per-process cache

type RawIssueMatch = {
  id: string;
  issueNumber: number | null;
};

async function findCockpitIssueByScan(): Promise<RawIssueMatch | null> {
  let offset = 0;
  const matches: RawIssueMatch[] = [];

  for (;;) {
    const body = await boardGet(`/issues?limit=${COCKPIT_SCAN_PAGE_SIZE}&offset=${offset}`);
    const list = Array.isArray(body) ? body : ((body as { issues?: unknown[] })?.issues ?? []);
    if (list.length === 0) break;

    for (const rec of list) {
      const r = rec as Record<string, unknown>;
      if (r.title !== COCKPIT_TITLE || r.status === 'done' || r.status === 'cancelled' || typeof r.id !== 'string') {
        continue;
      }
      matches.push({
        id: r.id,
        issueNumber: typeof r.issueNumber === 'number' ? r.issueNumber : null,
      });
    }

    if (list.length < COCKPIT_SCAN_PAGE_SIZE) break;
    offset += list.length;
  }

  matches.sort((a, b) => {
    if (a.issueNumber === null && b.issueNumber === null) return a.id.localeCompare(b.id);
    if (a.issueNumber === null) return 1;
    if (b.issueNumber === null) return -1;
    return a.issueNumber - b.issueNumber;
  });

  return matches[0] ?? null;
}

async function patchIssue(issueId: string, patch: Record<string, unknown>): Promise<boolean> {
  const c = creds();
  if (!c) return false;
  const res = await boardFetch(`${c.url}/api/issues/${issueId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${c.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
    signal: AbortSignal.timeout(8000),
  });
  return res.ok;
}

async function findOpenCockpitIssue(): Promise<Record<string, unknown> | null> {
  const c = creds();
  if (!c) return null;
  const id = COCKPIT_PINNED_ISSUE_ID ?? (await findCockpitIssueByScan())?.id ?? null;
  if (!id) return null;
  const res = await boardFetch(`${c.url}/api/issues/${id}`, {
    headers: { Authorization: `Bearer ${c.key}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as Record<string, unknown>;
  const issue = (body.issue ?? body) as Record<string, unknown>;
  return typeof issue.id === 'string' ? issue : null;
}

/**
 * The standing issue that anchors the Conductor chat in the OS panel. Comments
 * on an issue wake its assignee (wakeReason "issue_commented"), so assigning
 * it to the Conductor turns the thread into a real async chat with the CEO.
 * The issue is created and kept in the loop-proof shape from lib/cockpit-issue.
 */
export async function ensureCockpitIssue(): Promise<string> {
  if (cockpitIssueId) return cockpitIssueId;
  if (COCKPIT_PINNED_ISSUE_ID) {
    cockpitIssueId = COCKPIT_PINNED_ISSUE_ID;
    return cockpitIssueId;
  }
  const c = creds();
  if (!c) throw new Error('paperclip creds missing');

  const existing = await findCockpitIssueByScan();
  if (existing) {
    cockpitIssueId = existing.id;
    return existing.id;
  }

  // create it, assigned to the Conductor so every message wakes the CEO
  const conductor = (await paperclipAgents()).find((a) => a.name.toLowerCase() === 'conductor');
  const res = await boardFetch(`${c.url}/api/companies/${c.companyId}/issues`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${c.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cockpitIssueCreateBody({ conductorId: conductor?.id })),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`cockpit issue create failed: HTTP ${res.status}`);
  const created = (await res.json()) as Record<string, unknown>;
  const issue = (created.issue ?? created) as Record<string, unknown>;
  if (typeof issue.id !== 'string') throw new Error('cockpit issue create returned no id');
  console.warn('[paperclip] created fallback Founder OS Cockpit issue', issue.id);
  cockpitIssueId = issue.id;
  return issue.id;
}

/**
 * Put the open cockpit issue back into the loop-proof shape (backlog, the
 * Conductor as its one assignee). Run from the failover tick: a checkout by
 * any agent sets in_progress, which re-arms the handoff loop.
 */
export async function repairCockpitIssue(): Promise<'ok' | 'patched' | 'failed' | 'skipped'> {
  if (!creds()) return 'skipped';
  try {
    const issue = await findOpenCockpitIssue();
    if (!issue) return 'ok';
    const conductor = (await paperclipAgents().catch(() => [] as PaperclipAgent[])).find((a) => a.name.toLowerCase() === 'conductor');
    const patch = cockpitRepairPatch(
      { status: issue.status as string, assigneeAgentId: issue.assigneeAgentId as string | null, assigneeUserId: issue.assigneeUserId as string | null },
      conductor?.id,
    );
    if (!patch) return 'ok';
    return (await patchIssue(issue.id as string, patch)) ? 'patched' : 'failed';
  } catch {
    return 'failed';
  }
}

/** The cockpit thread, oldest→newest, or [] when unreachable. */
export async function paperclipCockpitThread(limit = 50): Promise<PaperclipComment[]> {
  try {
    const issueId = await ensureCockpitIssue();
    const c = creds();
    if (!c) return [];
    const res = await boardFetch(`${c.url}/api/issues/${issueId}/comments?limit=${limit}`, {
      headers: { Authorization: `Bearer ${c.key}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as unknown;
    const list = Array.isArray(body) ? body : ((body as { comments?: unknown[] })?.comments ?? []);
    return mapPaperclipComments(list).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } catch {
    return [];
  }
}

/** Send the operator's message into the cockpit thread (wakes the Conductor). */
export async function postCockpitMessage(message: string): Promise<PaperclipComment | null> {
  const issueId = await ensureCockpitIssue();
  const c = creds();
  if (!c) throw new Error('paperclip creds missing');
  const res = await boardFetch(`${c.url}/api/issues/${issueId}/comments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${c.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: message }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`comment failed: HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as Record<string, unknown>;
  return mapPaperclipComments([body.comment ?? body])[0] ?? null;
}

export async function paperclipStatus(): Promise<ConnectorStatus> {
  if (GATED)
    return gatedConnected('paperclip', 'Paperclip', 'orchestration', 'Agent harness · CEO + 8 agents on the board');
  if (!creds()) {
    return {
      id: 'paperclip',
      name: 'Paperclip (agent harness)',
      kind: 'orchestration',
      state: 'not_configured',
      detail: 'PAPERCLIP_API_URL / PAPERCLIP_BOARD_KEY / PAPERCLIP_COMPANY_ID not set in .env.local.',
    };
  }
  try {
    // fetchAgents, not paperclipAgents: a dead board must read as unreachable,
    // not as "reachable but returned no agents"
    const agents = await fetchAgents();
    if (agents.length === 0) throw new Error('board reachable but returned no agents');
    const running = agents.filter((a) => a.status === 'running').length;
    return {
      id: 'paperclip',
      name: 'Paperclip (agent harness)',
      kind: 'orchestration',
      state: 'connected',
      detail: `Board live · ${agents.length} agents · ${running} running`,
      meta: { agents: agents.length, running },
    };
  } catch (err) {
    return {
      id: 'paperclip',
      name: 'Paperclip (agent harness)',
      kind: 'orchestration',
      state: 'error',
      detail: `Creds set but board call failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Runs shaped for the failover loop (lib/agent-failover.ts).
 *
 * Deliberately separate from mapPaperclipRuns: the board strip wants agent
 * names and durations, the failover loop wants the failure text and the model
 * that billed it. Sharing one schema would force every consumer to carry both.
 */
export async function paperclipFailoverRuns(limit = 40): Promise<FailoverRun[]> {
  try {
    const body = await boardGet(`/heartbeat-runs?limit=${limit}`);
    const list = Array.isArray(body) ? body : ((body as { runs?: unknown[] })?.runs ?? []);
    const out: FailoverRun[] = [];
    for (const rec of list ?? []) {
      if (!rec || typeof rec !== 'object') continue;
      const r = rec as Record<string, unknown>;
      const agentId = str(r.agentId);
      if (!agentId) continue;
      const usage = (r.usageJson ?? {}) as Record<string, unknown>;
      // A Codex CLI failure is filed as error "Internal error"; the CLI's own
      // words (quota window, expired login) live in resultJson.summary.
      const result = (r.resultJson ?? {}) as Record<string, unknown>;
      out.push({
        agentId,
        status: str(r.status) ?? 'unknown',
        error: str(r.error),
        model: str(usage.model),
        finishedAt: str(r.finishedAt),
        summary: str(result.summary),
      });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Repoint one seat at another model. The board MERGES adapterConfig unless
 * replaceAdapterConfig is set, so this cannot clobber instructionsFilePath,
 * maxTurnsPerRun or the permission flags — verified against the live Conductor,
 * which kept all nine of its other keys.
 */
export async function setPaperclipAgentModel(agentId: string, model: string): Promise<boolean> {
  const c = creds();
  if (!c) throw new Error('paperclip creds missing');
  const res = await boardFetch(`${c.url}/api/agents/${agentId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${c.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ adapterConfig: { model } }),
    signal: AbortSignal.timeout(8000),
  });
  return res.ok;
}

/**
 * Put a failover alert on the cockpit thread, once per failing run. Reads the
 * thread first so the five-minute tick cannot nag; the marker line is the key.
 */
export async function postFailoverAlert(alert: FailoverAlert): Promise<'posted' | 'already' | 'failed'> {
  try {
    const thread = await paperclipCockpitThread(50);
    if (isAlertPosted(alert, thread)) return 'already';
    const posted = await postCockpitMessage(renderFailoverAlert(alert));
    return posted ? 'posted' : 'failed';
  } catch {
    return 'failed';
  }
}

/** Take a seat out of `error` so its timer will schedule it again. */
export async function clearPaperclipAgentError(agentId: string): Promise<boolean> {
  const c = creds();
  if (!c) throw new Error('paperclip creds missing');
  const res = await boardFetch(`${c.url}/api/agents/${agentId}/clear-error`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${c.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
    signal: AbortSignal.timeout(8000),
  });
  return res.ok;
}
