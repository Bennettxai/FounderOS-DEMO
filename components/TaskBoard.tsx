'use client';

/**
 * Agent task board · a card drag-through across To do / In progress / In review / Done.
 * Drag a card to a column and it persists to SQLite via PATCH /api/agents/work;
 * a 6s poll pulls the board back from the server so cards also move on their own
 * as agents commit and finish work. Optimistic on drop, reconciled on poll.
 */
import { useEffect, useRef, useState } from 'react';
import { User } from 'lucide-react';
import type { AgentTask } from '@/lib/schemas';

// click-advance target for each column; done is terminal (drag it back if needed)
const ADVANCE: Partial<Record<AgentTask['status'], AgentTask['status']>> = { open: 'doing', doing: 'review', review: 'done' };

const COLUMNS: { status: AgentTask['status']; label: string; tone: string }[] = [
  { status: 'open', label: 'To do', tone: 'var(--text-3)' },
  { status: 'doing', label: 'In progress', tone: 'var(--warn)' },
  { status: 'review', label: 'In review', tone: 'var(--accent)' },
  { status: 'done', label: 'Done', tone: 'var(--ok)' },
];

export function TaskBoard({
  initialTasks,
  agentNames,
}: {
  initialTasks: AgentTask[];
  agentNames: Record<string, string>;
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<AgentTask['status'] | null>(null);
  // Don't let a poll stomp a drop that's still persisting.
  const pending = useRef(0);

  useEffect(() => {
    const id = setInterval(async () => {
      if (pending.current > 0) return;
      try {
        const res = await fetch('/api/agents/work');
        if (!res.ok) return;
        const body = (await res.json()) as { tasks?: AgentTask[] };
        if (Array.isArray(body.tasks)) setTasks(body.tasks);
      } catch {
        /* keep the last good board */
      }
    }, 6000);
    return () => clearInterval(id);
  }, []);

  const move = async (id: string, status: AgentTask['status']) => {
    const cur = tasks.find((t) => t.id === id);
    if (!cur || cur.status === status) return;
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t))); // optimistic
    pending.current += 1;
    try {
      await fetch('/api/agents/work', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'task', id, status }),
      });
    } catch {
      /* the poll reconciles if this failed */
    } finally {
      pending.current -= 1;
    }
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.26em] text-os-muted">Local kanban</span>
          <span className="font-mono text-[10px] text-os-dim">{tasks.length}</span>
        </div>
        <span className="font-mono text-[10px] text-os-dim">drag between lanes · or click ▸ to advance</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => {
          const colTasks = tasks.filter((t) => t.status === col.status);
          const over = overCol === col.status;
          return (
            <div
              key={col.status}
              onDragOver={(e) => {
                e.preventDefault();
                setOverCol(col.status);
              }}
              onDragLeave={() => setOverCol((c) => (c === col.status ? null : c))}
              onDrop={(e) => {
                e.preventDefault();
                setOverCol(null);
                if (dragId) void move(dragId, col.status);
                setDragId(null);
              }}
              className={`state-fade flex min-h-[260px] flex-col gap-2.5 rounded-panel border p-3 ${
                over ? 'border-os-accent bg-os-surface2' : 'border-os-border bg-os-surface'
              }`}
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: col.tone }} />
                  <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-os-muted">{col.label}</span>
                </span>
                <span className="font-mono text-[11px] text-os-dim">{colTasks.length}</span>
              </div>

              {colTasks.map((task) => {
                const nextStatus = ADVANCE[task.status];
                return (
                <div
                  key={task.id}
                  draggable
                  onDragStart={() => setDragId(task.id)}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverCol(null);
                  }}
                  className={`cursor-grab rounded-lg border border-os-border bg-os-bg p-3 transition-opacity active:cursor-grabbing ${
                    dragId === task.id ? 'opacity-40' : ''
                  }`}
                >
                  <div
                    className={`text-[12.5px] font-medium leading-snug ${
                      task.status === 'done' ? 'text-os-dim line-through' : 'text-os-text'
                    }`}
                  >
                    {task.title}
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 font-mono text-[10px] text-os-dim">
                    <User className="h-3 w-3" />
                    <span className="min-w-0 flex-1 truncate">{agentNames[task.agentId] ?? task.agentId}</span>
                    {nextStatus && (
                      <button
                        onClick={() => void move(task.id, nextStatus)}
                        title={`Advance to ${COLUMNS.find((c) => c.status === nextStatus)?.label ?? nextStatus}`}
                        data-lens="c"
                        className="pressable shrink-0 rounded-ctl border border-os-border px-1.5 py-0.5 text-[10px] text-os-dim hover:text-os-text"
                      >
                        ▸
                      </button>
                    )}
                  </div>
                </div>
                );
              })}

              {colTasks.length === 0 && (
                <div className="rounded-lg border border-dashed border-os-border px-3 py-6 text-center font-mono text-[10px] text-os-dim">
                  drop here
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
