'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { AlertTriangle, Check, Clock, Plus, Trash2, X } from 'lucide-react';
import { Dot, Label } from '@/components/terminal';
import type { ScheduledJobRow } from '@/lib/scheduled-jobs';

/**
 * Scheduled tasks on /workflows · the FUNCTIONAL half of the page.
 *
 * The workflow section needed the ability to add cronjobs through the UI
 * itself, rather than being a readout the operator could only look at. So
 * this is not a readout: add a task, run it now, pause
 * it, delete it, all in place. The API for every one of those already existed
 * (POST/PATCH/DELETE /api/agents/work); it simply had no controls anywhere in
 * the OS, which is why the page felt like a poster.
 *
 * Row shaping stays in lib/scheduled-jobs.ts so this and the /tasks strip can
 * never disagree about whether a job is late.
 */
const PRESETS: { label: string; expr: string }[] = [
  { label: 'Every morning 9am', expr: '0 9 * * *' },
  { label: 'Weekdays 9am', expr: '0 9 * * 1-5' },
  { label: 'Every morning 7am', expr: '0 7 * * *' },
  { label: 'Every evening 6pm', expr: '0 18 * * *' },
  { label: 'Every hour', expr: '0 * * * *' },
  { label: 'Every 15 min', expr: '*/15 * * * *' },
];

const ago = (iso: string | null): string => {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'now';
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

/** "in 6m" / "in 2h 10m" for a future ISO minute; null once it has passed. */
const untilLabel = (iso: string | null): string | null => {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const m = Math.ceil(ms / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d`;
};

function state(job: ScheduledJobRow): 'err' | 'warn' | 'ok' | 'off' {
  if (!job.enabled) return 'off';
  if (job.unknownAgent) return 'err';
  if (job.overdue) return 'warn';
  return job.lastOk === false ? 'err' : 'ok';
}

export function ScheduledTasks({
  jobs,
  agents,
}: {
  jobs: ScheduledJobRow[];
  agents: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ranMsg, setRanMsg] = useState<string | null>(null);

  const [agentId, setAgentId] = useState(agents[0]?.id ?? '');
  const [schedule, setSchedule] = useState('0 9 * * *');
  const [description, setDescription] = useState('');

  const refresh = () => startTransition(() => router.refresh());

  const call = async (input: RequestInit & { url: string }, label: string) => {
    setBusy(label);
    setError(null);
    try {
      const res = await fetch(input.url, {
        ...input,
        headers: { 'Content-Type': 'application/json', ...(input.headers ?? {}) },
      });
      const body = (await res.json().catch(() => ({}))) as { error?: unknown; summary?: string };
      if (!res.ok) {
        setError(typeof body.error === 'string' ? body.error : `HTTP ${res.status}`);
        return null;
      }
      return body;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setBusy(null);
    }
  };

  const add = async () => {
    if (!agentId || !description.trim()) {
      setError('pick an agent and describe the task');
      return;
    }
    const ok = await call(
      {
        url: '/api/agents/work',
        method: 'POST',
        body: JSON.stringify({ kind: 'cron', agentId, schedule, description: description.trim() }),
      },
      'add',
    );
    if (ok) {
      setDescription('');
      setAdding(false);
      refresh();
    }
  };

  const runNow = async (id: string) => {
    const body = await call({ url: '/api/cron/run', method: 'POST', body: JSON.stringify({ cronId: id }) }, id);
    if (body?.summary) setRanMsg(body.summary.slice(0, 220));
    refresh();
  };

  const toggle = async (id: string, enabled: boolean) => {
    await call({ url: '/api/agents/work', method: 'PATCH', body: JSON.stringify({ kind: 'cron', id, enabled }) }, id);
    refresh();
  };

  const remove = async (id: string) => {
    await call({ url: '/api/agents/work', method: 'DELETE', body: JSON.stringify({ kind: 'cron', id }) }, id);
    refresh();
  };

  const late = jobs.filter((j) => j.overdue).length;
  // The soonest enabled fire drives the header countdown, like the mock's
  // "next fires in 6m". Rows are pre-sorted by band, so scan them all.
  const soonest = jobs
    .filter((j) => j.enabled && j.nextRunAt)
    .map((j) => j.nextRunAt!)
    .sort()[0] ?? null;
  const countdown = untilLabel(soonest);

  return (
    <section className="mb-6">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <Label count={jobs.length} rule>
            Scheduled tasks
          </Label>
        </div>
        {countdown && (
          <span className="flex shrink-0 items-center gap-1.5 font-mono text-[10.5px] text-os-muted">
            <Clock className="h-3 w-3 text-os-dim" /> next fires in {countdown}
          </span>
        )}
        {late > 0 && <span className="shrink-0 font-mono text-[11px] text-os-warn">{late} overdue</span>}
        <button
          onClick={() => setAdding((a) => !a)}
          className="pressable flex shrink-0 items-center gap-1 rounded-sm-t border border-os-border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-os-muted hover:bg-os-surface2 hover:text-os-text"
        >
          {adding ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
          {adding ? 'cancel' : 'new task'}
        </button>
      </div>

      {adding && (
        <div className="mb-3 rounded-lg border border-os-border-strong bg-os-surface p-3">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_11rem]">
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What should run? e.g. Sweep unpaid invoices"
              className="rounded-sm-t border border-os-border bg-os-bg px-2.5 py-1.5 text-[12px] text-os-text outline-none focus:border-os-border-strong"
            />
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="rounded-sm-t border border-os-border bg-os-bg px-2 py-1.5 font-mono text-[11px] text-os-muted outline-none focus:border-os-border-strong"
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.expr}
                onClick={() => setSchedule(p.expr)}
                className={`pressable rounded-sm-t border px-2 py-0.5 font-mono text-[9.5px] ${
 schedule === p.expr
 ? 'border-os-accent text-os-text'
 : 'border-os-border text-os-dim hover:text-os-text'
 }`}
              >
                {p.label}
              </button>
            ))}
            <input
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              spellCheck={false}
              className="ml-auto w-32 rounded-sm-t border border-os-border bg-os-bg px-2 py-1 text-right font-mono text-[10.5px] text-os-muted outline-none focus:border-os-border-strong"
            />
            <button
              onClick={add}
              disabled={busy === 'add' || pending}
              className="pressable flex items-center gap-1 rounded-sm-t border border-os-accent px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-os-text hover:bg-os-surface2 disabled:opacity-40"
            >
              <Check className="h-3 w-3" /> {busy === 'add' ? 'adding' : 'add'}
            </button>
          </div>
          <p className="mt-2 font-mono text-[9.5px] text-os-dim">
            Runs in this machine&apos;s local time. The runner ticks every minute and catches up a missed slot after a
            restart.
          </p>
        </div>
      )}

      {error && (
        <p className="mb-2 flex items-center gap-1.5 font-mono text-[10.5px] text-os-err">
          <AlertTriangle className="h-3 w-3" /> {error}
        </p>
      )}
      {ranMsg && <p className="mb-2 font-mono text-[10.5px] text-os-muted">ran: {ranMsg}</p>}

      <div className="rounded-lg border border-os-border bg-os-surface">
        {jobs.length === 0 ? (
          <p className="px-3 py-4 font-mono text-[11px] text-os-dim">
            No scheduled tasks yet. Hit <span className="text-os-muted">new task</span> to add one.
          </p>
        ) : (
          jobs.map((job) => (
            <div
              key={job.id}
              className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-os-border px-3 py-2.5 last:border-b-0 sm:grid-cols-[auto_minmax(0,1fr)_8.5rem_5rem_7.5rem_5.5rem_auto] ${
                job.enabled ? '' : 'opacity-45'
              }`}
            >
              <Dot state={state(job)} />

              <div className="min-w-0">
                <div className="truncate text-[12px] font-medium text-os-text">{job.description}</div>
                <div className="truncate font-mono text-[10px] text-os-dim">
                  {job.agentName}
                  {job.unknownAgent && <span className="text-os-err"> · no such agent</span>}
                </div>
              </div>

              <div className="font-mono text-[10.5px] text-os-muted">
                {job.scheduleLabel}
                <div className="text-[9.5px] text-os-dim">{job.schedule}</div>
              </div>

              <div className="font-mono text-[10.5px] text-os-muted">
                {untilLabel(job.nextRunAt) ? `in ${untilLabel(job.nextRunAt)}` : job.enabled ? 'due' : 'paused'}
              </div>

              <div className="min-w-0 font-mono text-[10.5px]">
                {job.overdue ? (
                  <span className="text-os-warn">overdue</span>
                ) : job.lastOk === false ? (
                  <span className="block truncate text-os-err" title={job.lastSummary ?? undefined}>
                    failed · {job.lastSummary ? job.lastSummary.slice(0, 32) : ago(job.lastRunAt)}
                  </span>
                ) : (
                  <span className="text-os-muted">{ago(job.lastRunAt)}</span>
                )}
              </div>

              <div className="justify-self-end">
                {job.history.length === 0 ? (
                  <span className="font-mono text-[10.5px] text-os-dim">·</span>
                ) : (
                  <div className="flex items-end gap-[2px]" title={`last ${job.history.length} runs`}>
                    {job.history.map((ok, i) => (
                      <span
                        key={i}
                        className="w-[4px]"
                        style={{
                          height: ok ? 10 : 12,
                          background: ok ? 'color-mix(in oklab, var(--ok) 70%, transparent)' : 'var(--err)',
                        }}
                      />
                    ))}
                  </div>
                )}
                {job.runs - job.ok > 0 && (
                  <div className="text-right font-mono text-[9.5px] text-os-err">{job.runs - job.ok} failed</div>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => runNow(job.id)}
                  disabled={busy === job.id || pending}
                  className="pressable whitespace-nowrap rounded-sm-t border border-os-border px-2 py-0.5 font-mono text-[9.5px] text-os-muted hover:border-os-border-strong hover:text-os-text disabled:opacity-40"
                >
                  ▸ run now
                </button>
                <button
                  onClick={() => toggle(job.id, !job.enabled)}
                  disabled={busy === job.id || pending}
                  title={job.enabled ? 'Pause' : 'Enable'}
                  className={`pressable font-mono text-[9px] uppercase tracking-[0.1em] disabled:opacity-40 ${
 job.enabled ? 'text-os-dim hover:text-os-warn' : 'text-os-warn hover:text-os-ok'
 }`}
                >
                  {job.enabled ? 'on' : 'off'}
                </button>
                <button
                  onClick={() => remove(job.id)}
                  disabled={busy === job.id || pending}
                  title="Delete"
                  className="pressable text-os-dim hover:text-os-err disabled:opacity-40"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
