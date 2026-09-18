/**
 * The ambient pack: what an agent should already know before it is asked
 * anything.
 *
 * Two tiers make up an agent's access to memory. This is tier one: a small,
 * always-present brief that costs no round trip. Tier two is the `searchBrain`
 * tool, which the model reaches for when the question actually needs the
 * knowledge base. Injecting deep recall into all thirty agents on every turn
 * would be the expensive mistake, because context is re-read on every call and
 * that is where the token spend actually goes.
 *
 * So this is deliberately cheap and deliberately small:
 *
 *  - sqlite repos ONLY, never a connector. Same rule as lib/memory-provider.
 *  - budgeted in characters, with the agent's own state kept first.
 *  - cached, because a broadcast fans out to every agent at once and thirty
 *    identical reads of the same tables is thirty times nothing useful.
 */
import type { FounderDb } from '@/lib/db';
import type { RuntimeAgent } from '@/lib/agents/runtime';

/** Roughly 200 tokens. Enough to orient an agent, too small to crowd a turn. */
export const AMBIENT_BUDGET_CHARS = 900;

/** Long enough to absorb a broadcast, short enough that a fresh run shows up. */
export const AMBIENT_TTL_MS = 60_000;

type CacheEntry = { at: number; pack: string };
const cache = new Map<string, CacheEntry>();

/** Tests and a forced refresh need a way to drop it. */
export function clearAmbientCache(): void {
  cache.clear();
}

function ago(iso: string, now: number): string {
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

function clip(s: string, n: number): string {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length <= n ? one : `${one.slice(0, n - 1)}…`;
}

/** The department's real name when the OS knows it, else the id, never a guess. */
function departmentName(db: FounderDb, id: string): string {
  try {
    return db.departments.all().find((d) => d.id === id)?.name ?? id;
  } catch {
    return id;
  }
}

function buildPack(db: FounderDb, agent: RuntimeAgent, now: number): string {
  const lines: string[] = [];

  lines.push(`You are ${agent.name} (${agent.id}) in ${departmentName(db, agent.departmentId)}.`);

  // Its own last run first: an agent that failed an hour ago should not open
  // by claiming it is fine.
  const mine = db.agentRuns.byAgent(agent.id)[0];
  if (mine) {
    lines.push(
      `Your last run ${ago(mine.startedAt, now)}: ${mine.ok ? 'OK' : 'FAILED'} — ${clip(mine.summary, 120)}`,
    );
  }

  // Then the OS around it, failures only. A green fleet needs no words.
  const failing = new Map<string, { agentId: string; startedAt: string; summary: string }>();
  for (const r of db.agentRuns.recent(120)) {
    const seen = failing.get(r.agentId);
    if (seen && Date.parse(seen.startedAt) >= Date.parse(r.startedAt)) continue;
    if (r.ok) failing.delete(r.agentId);
    else failing.set(r.agentId, r);
  }
  failing.delete(agent.id);
  const others = [...failing.values()].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)).slice(0, 3);
  if (others.length > 0) {
    lines.push(`Failing elsewhere: ${others.map((r) => `${r.agentId} (${ago(r.startedAt, now)})`).join(', ')}.`);
  }

  const open = db.agentTasks.all().filter((t) => t.status !== 'done');
  if (open.length > 0) lines.push(`${open.length} agent task(s) still open.`);

  lines.push('Use searchBrain before stating any fact about how the operator works, prices, or decided something.');

  // Trim from the end: the first line orients, the last line instructs, and
  // what falls out in between is the least specific to this agent.
  let pack = lines.join('\n');
  while (pack.length > AMBIENT_BUDGET_CHARS && lines.length > 2) {
    lines.splice(lines.length - 2, 1);
    pack = lines.join('\n');
  }
  return pack.length > AMBIENT_BUDGET_CHARS ? pack.slice(0, AMBIENT_BUDGET_CHARS) : pack;
}

export function ambientPack(db: FounderDb, agent: RuntimeAgent, opts: { now?: number } = {}): string {
  const now = opts.now ?? Date.now();
  const hit = cache.get(agent.id);
  if (hit && now - hit.at < AMBIENT_TTL_MS) return hit.pack;

  const pack = buildPack(db, agent, now);
  cache.set(agent.id, { at: now, pack });
  return pack;
}
