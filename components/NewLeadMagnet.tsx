'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X } from 'lucide-react';

/**
 * Create a lead magnet from inside the OS (the operator). Deploy the
 * page wherever, then register it here so the row lives with everything else.
 * The Content Gen skill posts to the same route, so a page it ships lands in
 * this table without anyone typing.
 */
export function NewLeadMagnet() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const empty = {
    name: '',
    url: '',
    offer: '',
    source: '',
    destination: 'Beehiiv · newsletter',
    captures: 'email',
    status: 'live',
    launchedAt: today,
    notes: '',
  };
  const [form, setForm] = useState(empty);

  const set =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/lead-magnets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: unknown };
        setError(typeof body.error === 'string' ? body.error : 'Check the name and the URL.');
        return;
      }
      const body = (await res.json()) as { leadMagnet?: { name?: string } };
      setDone(body.leadMagnet?.name ?? form.name);
      setForm(empty);
      setOpen(false);
      router.refresh(); // the table is a server component; pull the new row
    } catch {
      setError('Network error. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const field = 'w-full rounded-sm-t border border-os-border bg-os-bg px-2.5 py-2 text-[12px] text-os-text outline-none placeholder:text-os-dim focus:border-os-border-strong';
  const label = 'mb-1 block font-mono text-[9.5px] uppercase tracking-[0.16em] text-os-dim';

  if (!open) {
    return (
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={() => {
            setDone(null);
            setOpen(true);
          }}
          className="pressable flex items-center gap-1.5 rounded-sm-t border border-os-border bg-os-surface px-3 py-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-widest text-os-accent hover:border-os-border-strong"
        >
          <Plus className="h-3 w-3" /> New lead magnet
        </button>
        {done && (
          <span className="font-mono text-[10.5px] text-os-ok">
            Added {done} to the register.
          </span>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mb-4 rounded-lg-t border border-os-border bg-os-surface p-4">
      <div className="mb-3 flex items-center">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-os-dim">Register a page</span>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="pressable ml-auto text-os-dim hover:text-os-text">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="lm-name">Name</label>
          <input id="lm-name" className={field} value={form.name} onChange={set('name')} required placeholder="The Claude Trading Setup" />
        </div>
        <div>
          <label className={label} htmlFor="lm-url">Live URL</label>
          <input id="lm-url" className={field} value={form.url} onChange={set('url')} required type="url" placeholder="https://…" />
        </div>
        <div className="sm:col-span-2">
          <label className={label} htmlFor="lm-offer">What they get</label>
          <input id="lm-offer" className={field} value={form.offer} onChange={set('offer')} placeholder="The setup, the prompt, and the guardrails" />
        </div>
        <div>
          <label className={label} htmlFor="lm-source">Campaign it was built for</label>
          <input id="lm-source" className={field} value={form.source} onChange={set('source')} placeholder="IG reel (comment TRADE)" />
        </div>
        <div>
          <label className={label} htmlFor="lm-dest">Where leads land</label>
          <input id="lm-dest" className={field} value={form.destination} onChange={set('destination')} />
        </div>
        <div>
          <label className={label} htmlFor="lm-captures">Captures</label>
          <select id="lm-captures" className={field} value={form.captures} onChange={set('captures')}>
            <option value="email">Email</option>
            <option value="booking">Booking</option>
            <option value="none">Nothing yet</option>
          </select>
        </div>
        <div>
          <label className={label} htmlFor="lm-launched">Went live</label>
          <input id="lm-launched" className={field} type="date" value={form.launchedAt} onChange={set('launchedAt')} />
        </div>
        <div>
          <label className={label} htmlFor="lm-status">Status</label>
          <select id="lm-status" className={field} value={form.status} onChange={set('status')}>
            <option value="live">Live</option>
            <option value="draft">Draft</option>
            <option value="paused">Paused</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={label} htmlFor="lm-notes">Notes</label>
          <textarea
            id="lm-notes"
            rows={2}
            className={`${field} resize-y`}
            value={form.notes}
            onChange={set('notes')}
            placeholder="Anything future-you needs to know: what is gated, what still needs wiring, which automation feeds it"
          />
        </div>
      </div>
      {error && <p className="mt-2 font-mono text-[10.5px] text-os-err">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="pressable mt-3 rounded-sm-t border border-os-border bg-os-surface2 px-3 py-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-widest text-os-accent hover:border-os-border-strong disabled:opacity-40"
      >
        {busy ? 'saving…' : 'add to the register'}
      </button>
    </form>
  );
}
