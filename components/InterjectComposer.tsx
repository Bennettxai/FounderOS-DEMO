'use client';

import { useRef, useState } from 'react';
import { AsyncButton } from '@/components/AsyncButton';
import { Chip } from '@/components/Pressable';
import { Label } from '@/components/terminal';

/** `null` is the artboard's "auto": no chip on, the text routes itself. */
type Route = 'task' | 'agent' | 'note';
type Receipt = {
  ok: boolean;
  route: 'task' | 'agent' | 'note';
  ref?: string | null;
  url?: string | null;
  slug?: string;
  error?: string;
};

/**
 * Mock 3a labels these by destination, not by category:
 *   [['note','→ G-Brain'], ['task','→ Board'], ['agent','→ Agent']]
 * and it has no "auto" chip, because auto is what you get when none of them
 * is on. A chip called "auto" competes with the other three for the same
 * slot while meaning "not the other three", which is how you end up with a
 * pinned route nobody meant to pin.
 */
const ROUTES: { id: Route; label: string }[] = [
  { id: 'note', label: '→ G-Brain' },
  { id: 'task', label: '→ Board' },
  { id: 'agent', label: '→ Agent' },
];

const ROUTE_VERB: Record<Receipt['route'], string> = {
  task: 'on the board',
  agent: 'relayed via the board',
  note: 'captured to G-Brain',
};

/**
 * Interject — throw a thought at the OS without picking an app first. Free
 * text routes itself (task words → board, tell/ask → agent relay, else a
 * G-Brain note); a chip pins the route when the guess would be wrong. The
 * receipt is honest: it shows where the thing actually landed, or the error.
 */
export function InterjectComposer() {
  const [text, setText] = useState('');
  const [route, setRoute] = useState<Route | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    let r: Receipt;
    try {
      const res = await fetch('/api/interject', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: body, ...(route ? { route } : {}) }),
      });
      r = (await res.json()) as Receipt;
    } catch {
      r = { ok: false, route: route ?? 'note', error: 'network error' };
    }
    setReceipt(r);
    if (r.ok) setText('');
    if (clearTimer.current) clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => setReceipt(null), 5000);
  };

  return (
    <section className="rounded-panel border border-os-border bg-os-surface">
      <div className="flex items-center gap-3 border-b border-os-border px-4 py-2.5">
        <Label>Interject</Label>
        <span className="font-mono text-[10px] text-os-dim">task · agent · note — routed for you</span>
      </div>
      <div className="flex flex-col gap-2.5 p-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={3}
          placeholder="call the client back re: project scope…  (Enter sends, Shift+Enter breaks)"
          className="w-full resize-none rounded-ctl border border-os-border bg-os-bg px-3 py-2.5 font-mono text-[12.5px] text-os-text outline-none state-fade placeholder:text-os-dim focus:border-os-border-strong"
        />
        <div className="flex items-center gap-1.5">
          {ROUTES.map((r) => (
            // clicking the chip that is already on unpins it, back to auto
            <Chip key={r.id} on={route === r.id} onClick={() => setRoute(route === r.id ? null : r.id)}>
              {r.label}
            </Chip>
          ))}
          <span className="ml-auto font-mono text-[9.5px] text-os-dim">
            {text.trim() ? (route ? 'route pinned' : 'auto-routed · Enter sends') : 'Enter sends · Shift+Enter breaks'}
          </span>
          {/* the artboard's send is a 26px white disc carrying ↑, not a
              labelled button: the label is already in the hint beside it */}
          <AsyncButton
            run={send}
            busyLabel=""
            doneLabel="✓"
            disabled={!text.trim()}
            className={`grid h-[26px] w-[26px] place-items-center rounded-full p-0 font-mono text-[12px] ${
              text.trim() ? '' : 'opacity-40'
            }`}
          >
            ↑
          </AsyncButton>
        </div>
        {receipt && (
          <div
            className={`enter flex items-center gap-2 font-mono text-[11px] ${
              receipt.ok ? 'text-os-muted' : 'text-os-err'
            }`}
          >
            {receipt.ok ? (
              <>
                <span className="font-bold text-os-ok">✓</span>
                <span>
                  {receipt.ref ? `${receipt.ref} · ` : ''}
                  {receipt.slug ? `${receipt.slug} · ` : ''}
                  {ROUTE_VERB[receipt.route]}
                </span>
                {receipt.url && (
                  <a href={receipt.url} target="_blank" rel="noreferrer" className="text-os-accent hover:underline">
                    open →
                  </a>
                )}
              </>
            ) : (
              <span>failed to land: {receipt.error ?? 'unknown error'}</span>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
