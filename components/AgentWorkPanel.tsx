'use client';

/**
 * Per-agent management drawer: skills, tasks, and cron jobs in one place.
 * Tasks and crons persist to SQLite via /api/agents/work. Cron definitions
 * are stored and scheduled-on-paper; the runner process lands with the
 * Mac mini deploy and the UI says so honestly.
 */
import { useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2, Clock } from 'lucide-react';
import { describeCron } from '@/lib/cron';
import type { AgentCron, AgentTask } from '@/lib/schemas';

const STATUS_NEXT: Record<AgentTask['status'], AgentTask['status']> = {
  open: 'doing',
  doing: 'done',
  done: 'open',
};

const STATUS_STYLE: Record<AgentTask['status'], string> = {
  open: 'border border-os-border-bright text-os-muted',
  doing: 'bg-os-text text-os-bg',
  done: 'border border-os-border text-os-dim line-through',
};

export function AgentWorkPanel({
  agentId,
  initialTasks,
  initialCrons,
}: {
  agentId: string;
  initialTasks: AgentTask[];
  initialCrons: AgentCron[];
}) {
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState(initialTasks);
  const [crons, setCrons] = useState(initialCrons);
  const [taskTitle, setTaskTitle] = useState('');
  const [cronSchedule, setCronSchedule] = useState('');
  const [cronDesc, setCronDesc] = useState('');
  const [error, setError] = useState<string | null>(null);

  const api = async (method: string, body: unknown) => {
    setError(null);
    const res = await fetch('/api/agents/work', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof json.error === 'string' ? json.error : 'request failed');
      return null;
    }
    return json;
  };

  const addTask = async () => {
    if (!taskTitle.trim()) return;
    const res = await api('POST', { kind: 'task', agentId, title: taskTitle.trim() });
    if (res?.task) {
      setTasks((prev) => [res.task, ...prev]);
      setTaskTitle('');
    }
  };

  const cycleTask = async (task: AgentTask) => {
    const status = STATUS_NEXT[task.status];
    if (await api('PATCH', { kind: 'task', id: task.id, status })) {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status } : t)));
    }
  };

  const removeTask = async (id: string) => {
    if (await api('DELETE', { kind: 'task', id })) setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  const addCron = async () => {
    if (!cronSchedule.trim() || !cronDesc.trim()) return;
    const res = await api('POST', { kind: 'cron', agentId, schedule: cronSchedule.trim(), description: cronDesc.trim() });
    if (res?.cron) {
      setCrons((prev) => [res.cron, ...prev]);
      setCronSchedule('');
      setCronDesc('');
    }
  };

  const toggleCron = async (cron: AgentCron) => {
    if (await api('PATCH', { kind: 'cron', id: cron.id, enabled: !cron.enabled })) {
      setCrons((prev) => prev.map((c) => (c.id === cron.id ? { ...c, enabled: !c.enabled } : c)));
    }
  };

  const removeCron = async (id: string) => {
    if (await api('DELETE', { kind: 'cron', id })) setCrons((prev) => prev.filter((c) => c.id !== id));
  };

  const openCount = tasks.filter((t) => t.status !== 'done').length;
  const cronCount = crons.filter((c) => c.enabled).length;

  return (
    <div className="mt-3 border-t border-os-border pt-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 text-[10px] uppercase tracking-widest text-os-dim hover:text-os-text"
      >
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        Manage · {openCount} open {openCount === 1 ? 'task' : 'tasks'} · {cronCount} {cronCount === 1 ? 'cron' : 'crons'}
      </button>

      {open && (
        <div className="mt-2 space-y-3">
          {error && <p className="font-mono text-[10px] text-os-muted">✗ {error}</p>}

          {/* tasks */}
          <div>
            <div className="mb-1 text-[9px] uppercase tracking-[0.2em] text-os-dim">Tasks</div>
            <div className="flex gap-1.5">
              <input
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addTask()}
                placeholder="New task…"
                className="min-w-0 flex-1 rounded border border-os-border bg-os-bg px-2 py-1 text-[11px] text-os-text placeholder:text-os-dim focus:border-os-border-bright focus:outline-none"
              />
              <button onClick={addTask} className="rounded border border-os-border px-1.5 text-os-muted hover:text-os-text">
                <Plus className="h-3 w-3" />
              </button>
            </div>
            <ul className="mt-1.5 space-y-1">
              {tasks.map((task) => (
                <li key={task.id} className="flex items-center gap-1.5 text-[11px]">
                  <button
                    onClick={() => cycleTask(task)}
                    title="Click to advance: open → doing → done"
                    className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] uppercase ${STATUS_STYLE[task.status]}`}
                  >
                    {task.status}
                  </button>
                  <span className={`min-w-0 truncate ${task.status === 'done' ? 'text-os-dim line-through' : 'text-os-muted'}`}>
                    {task.title}
                  </span>
                  <button onClick={() => removeTask(task.id)} className="ml-auto shrink-0 text-os-dim hover:text-os-text">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </li>
              ))}
              {tasks.length === 0 && <li className="text-[10px] text-os-dim">no tasks yet</li>}
            </ul>
          </div>

          {/* crons */}
          <div>
            <div className="mb-1 flex items-center gap-1 text-[9px] uppercase tracking-[0.2em] text-os-dim">
              <Clock className="h-2.5 w-2.5" /> Cron jobs
            </div>
            <div className="flex gap-1.5">
              <input
                value={cronSchedule}
                onChange={(e) => setCronSchedule(e.target.value)}
                placeholder="0 9 * * 1-5"
                className="w-24 shrink-0 rounded border border-os-border bg-os-bg px-2 py-1 font-mono text-[10px] text-os-text placeholder:text-os-dim focus:border-os-border-bright focus:outline-none"
              />
              <input
                value={cronDesc}
                onChange={(e) => setCronDesc(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addCron()}
                placeholder="What it should do…"
                className="min-w-0 flex-1 rounded border border-os-border bg-os-bg px-2 py-1 text-[11px] text-os-text placeholder:text-os-dim focus:border-os-border-bright focus:outline-none"
              />
              <button onClick={addCron} className="rounded border border-os-border px-1.5 text-os-muted hover:text-os-text">
                <Plus className="h-3 w-3" />
              </button>
            </div>
            <ul className="mt-1.5 space-y-1">
              {crons.map((cron) => (
                <li key={cron.id} className="flex items-center gap-1.5 text-[11px]">
                  <button
                    onClick={() => toggleCron(cron)}
                    title={cron.enabled ? 'Disable' : 'Enable'}
                    className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] uppercase ${
                      cron.enabled ? 'bg-os-text text-os-bg' : 'border border-os-border text-os-dim'
                    }`}
                  >
                    {cron.enabled ? 'on' : 'off'}
                  </button>
                  <code className="shrink-0 text-[10px] text-os-dim">{cron.schedule}</code>
                  <span className="min-w-0 truncate text-os-muted" title={cron.description}>
                    {describeCron(cron.schedule) ?? ''} — {cron.description}
                  </span>
                  <button onClick={() => removeCron(cron.id)} className="ml-auto shrink-0 text-os-dim hover:text-os-text">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </li>
              ))}
              {crons.length === 0 && <li className="text-[10px] text-os-dim">no cron jobs yet</li>}
            </ul>
            <p className="mt-1.5 text-[9px] leading-relaxed text-os-dim">
              Schedules are stored and versioned here; the runner process ships with the Mac mini deploy.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
