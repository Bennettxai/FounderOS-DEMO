'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Send, Clock, Paperclip } from 'lucide-react';
import { Badge } from '@/components/terminal';
import type { SocialPost } from '@/lib/schemas';

// Kept in sync with SocialPlatformSchema; defined here so this client
// component never imports server-only lib code.
const PLATFORMS: { id: SocialPost['platforms'][number]; label: string }[] = [
  { id: 'instagram', label: 'Instagram' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'twitter', label: 'Twitter / X' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'linkedin', label: 'LinkedIn' },
];

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function PostComposer({ initialPosts }: { initialPosts: SocialPost[] }) {
  const router = useRouter();
  const [posts, setPosts] = useState<SocialPost[]>(initialPosts);
  const [caption, setCaption] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set(['instagram', 'tiktok']));
  const [mediaUrl, setMediaUrl] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function submit() {
    setError(null);
    if (!caption.trim()) return setError('Add a caption first.');
    if (selected.size === 0) return setError('Pick at least one platform.');
    setBusy(true);
    try {
      const res = await fetch('/api/social/posts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          caption: caption.trim(),
          platforms: [...selected],
          mediaUrl: mediaUrl.trim() || null,
          scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : null,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { post: SocialPost };
      setPosts((prev) => [body.post, ...prev]);
      setCaption('');
      setMediaUrl('');
      setScheduledFor('');
      router.refresh(); // refresh the Social agent's queue count elsewhere
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const queued = posts.filter((p) => p.status === 'queued');

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.7fr)]">
      {/* Composer */}
      <div className="rounded-lg-t border border-os-border bg-os-surface p-4">
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Write a caption — this queues for the Zernio publishing agent…"
          rows={4}
          className="w-full resize-none rounded-sm-t border border-os-border bg-os-surface2 px-3 py-2.5 text-[13px] leading-relaxed text-os-text outline-none placeholder:text-os-dim focus:border-os-border-strong"
        />
        <div className="mt-3 flex flex-wrap gap-1.5">
          {PLATFORMS.map((p) => {
            const on = selected.has(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p.id)}
                className={`rounded-sm-t border px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.08em] transition-colors ${
                  on
                    ? 'border-[var(--accent-line)] bg-[var(--accent-soft)] text-os-accent'
                    : 'border-os-border text-os-dim hover:border-os-border-strong hover:text-os-muted'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="flex flex-1 items-center gap-2 rounded-sm-t border border-os-border bg-os-surface2 px-2.5 py-1.5">
            <Paperclip className="h-3.5 w-3.5 shrink-0 text-os-dim" />
            <input
              value={mediaUrl}
              onChange={(e) => setMediaUrl(e.target.value)}
              placeholder="media URL (optional)"
              className="w-full bg-transparent font-mono text-[11px] text-os-text outline-none placeholder:text-os-dim"
            />
          </label>
          <label className="flex items-center gap-2 rounded-sm-t border border-os-border bg-os-surface2 px-2.5 py-1.5">
            <Clock className="h-3.5 w-3.5 shrink-0 text-os-dim" />
            <input
              type="datetime-local"
              value={scheduledFor}
              onChange={(e) => setScheduledFor(e.target.value)}
              className="bg-transparent font-mono text-[11px] text-os-text outline-none [color-scheme:dark]"
            />
          </label>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="font-mono text-[10px] text-os-dim">
            Queues only — the Social agent publishes on its next run.
          </span>
          <button
            onClick={submit}
            disabled={busy}
            className="flex items-center gap-2 whitespace-nowrap rounded-sm-t border border-os-accent bg-os-accent px-3.5 py-[7px] text-[12.5px] font-semibold text-os-ink transition-all hover:shadow-[var(--glow)] disabled:opacity-45"
          >
            {busy ? <span className="font-mono text-[11px]">queuing…</span> : <><Send className="h-[13px] w-[13px]" /> Queue post</>}
          </button>
        </div>
        {error && <p className="mt-2 font-mono text-[11px] text-os-err">{error}</p>}
      </div>

      {/* Queue */}
      <div className="rounded-lg-t border border-os-border bg-os-surface p-1">
        <div className="flex items-center justify-between px-3 py-2.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-os-dim">Queue</span>
          <span className="font-mono text-[10px] text-os-muted">{queued.length} pending</span>
        </div>
        <div className="flex max-h-[280px] flex-col gap-1 overflow-y-auto px-1 pb-1">
          {queued.length === 0 && (
            <p className="px-3 py-6 text-center font-mono text-[10.5px] text-os-dim">nothing queued yet</p>
          )}
          {queued.map((post) => (
            <div key={post.id} className="rounded-sm-t border border-os-border bg-os-surface2 px-3 py-2.5">
              <p className="line-clamp-2 text-[12px] leading-snug text-os-text">{post.caption}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {post.platforms.map((p) => (
                  <span key={p} className="font-mono text-[9px] uppercase tracking-wider text-os-dim">
                    {p}
                  </span>
                ))}
                <span className="ml-auto">
                  <Badge tone={post.scheduledFor ? 'warn' : 'accent'}>
                    {post.scheduledFor ? fmtWhen(post.scheduledFor) : 'queued'}
                  </Badge>
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
