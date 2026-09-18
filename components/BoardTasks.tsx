'use client';

import { useState } from 'react';
import { ArrowUpRight, Loader2, Plus } from 'lucide-react';
import { Chip } from '@/components/Pressable';
import type { PaperclipIssue } from '@/lib/connectors/paperclip';

/**
 * The board queue on /tasks (mock 5f): live Paperclip issues, the real org's
 * work queue, plus a composer that creates a REAL issue the Conductor routes.
 * The routing chips are a hint carried in the issue description; the board's
 * one-assignee rule means the Conductor still does the actual triage. Sits
 * above the local kanban; the two queues are honestly separate systems.
 */
const STATUS_TONE: Record<string, string> = {
  done: 'var(--ok)',
  in_progress: 'var(--warn)',
  blocked: 'var(--err)',
};

const ROUTES = ['Conductor routes', 'TECH', 'Sales'] as const;
type Route = (typeof ROUTES)[number];

function ago(iso: string | null): string {
  if (!iso) return '';
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return 'now';
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function BoardTasks({ initialIssues, boardUrl }: { initialIssues: PaperclipIssue[]; boardUrl: string | null }) {
  const [issues, setIssues] = useState(initialIssues);
  const [title, setTitle] = useState('');
  const [route, setRoute] = useState<Route>('Conductor routes');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    const t = title.trim();
    if (!t || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/board/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: t,
          ...(route === 'Conductor routes' ? {} : { description: `Route to the ${route} pillar.` }),
        }),
      });
      const body = (await res.json()) as { issue?: PaperclipIssue; error?: string };
      if (!res.ok || !body.issue) throw new Error(body.error ?? `HTTP ${res.status}`);
      setIssues((prev) => [body.issue!, ...prev]);
      setTitle('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="mb-6 rounded-panel border border-os-border bg-os-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 animate-pulse bg-os-ok" />
          <span className="text-[10px] font-bold uppercase tracking-[0.26em] text-os-muted">Board queue</span>
          <span className="font-mono text-[10px] text-os-dim">{issues.length} open issues</span>
        </div>
        {boardUrl && (
          <a
            href={boardUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 font-mono text-[10px] text-os-dim linky"
          >
            open board <ArrowUpRight className="h-3 w-3" />
          </a>
        )}
      </div>

      {/* composer: a real issue for the real org */}
      <div className="mb-2 flex items-center gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && create()}
          placeholder="Hand the company work · one line · the Conductor routes it"
          className="min-w-0 flex-1 rounded-ctl border border-os-border bg-os-bg px-3 py-2 text-xs text-os-text placeholder:text-os-dim focus:border-os-border-strong focus:outline-none"
        />
        <button
          onClick={create}
          disabled={sending || !title.trim()}
          className="pressable flex shrink-0 items-center gap-1.5 rounded-ctl border border-os-text bg-os-text px-3 py-2 text-xs font-semibold text-os-ink hover:bg-white disabled:opacity-40"
        >
          {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Create issue
        </button>
      </div>
      <div className="mb-3 flex items-center gap-1.5">
        {ROUTES.map((r) => (
          <Chip key={r} on={route === r} onClick={() => setRoute(r)}>
            {r}
          </Chip>
        ))}
      </div>
      {error && <div className="mb-2 text-[11px] text-os-err">Board rejected it: {error}</div>}

      {issues.length === 0 ? (
        <div className="text-[11px] text-os-dim">Board unreachable or empty · the live queue shows here.</div>
      ) : (
        <ul className="space-y-1">
          {issues.slice(0, 10).map((issue) => (
            <li
              key={issue.id}
              className="flex items-center gap-2.5 rounded-tile border border-os-border bg-os-bg px-2.5 py-1.5"
            >
              <span className="font-mono text-[10px] text-os-dim">{issue.identifier}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-os-text">{issue.title}</span>
              {issue.assigneeName && <span className="font-mono text-[9.5px] text-os-dim">{issue.assigneeName}</span>}
              <span
                className="rounded-full border border-os-border px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.08em]"
                style={{ color: STATUS_TONE[issue.status] ?? 'var(--text-2)' }}
              >
                {issue.status.replace(/_/g, ' ')}
              </span>
              {issue.updatedAt && <span className="shrink-0 font-mono text-[9.5px] text-os-dim">{ago(issue.updatedAt)}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
