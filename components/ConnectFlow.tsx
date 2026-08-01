'use client';

/**
 * The live footer of a connection tile: Connect opens an inline paste-a-key
 * form (one field per env key), Save posts to /api/connections/connect (which
 * writes .env.local only), and the page refreshes into the connector's real
 * status — connected is never faked, a stored key on a connector-less tile
 * reads "key saved". Guidance-only tools (WhatsApp needs Full Disk Access,
 * IMAP inboxes, CalDAV) show their setup hint instead of a form.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function ConnectFlow({
  slug,
  connected,
  keySaved,
  keys,
  guidance,
}: {
  slug: string;
  connected: boolean;
  keySaved: boolean;
  keys: string[];
  /** Live connector detail for guidance-only tools (keys.length === 0). */
  guidance?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/connections/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, values }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!body.ok) throw new Error(body.error ?? 'save failed');
      setOpen(false);
      setValues({});
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'save failed');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    setError(null);
    try {
      await fetch('/api/connections/connect', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const statusChip = connected ? (
    <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-os-ok">
      <span className="h-1.5 w-1.5 rounded-full bg-os-ok" />
      Connected
    </span>
  ) : keySaved ? (
    <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-os-warn">
      <span className="h-1.5 w-1.5 rounded-full bg-os-warn" />
      Key saved
    </span>
  ) : (
    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-os-dim">Not connected</span>
  );

  if (open) {
    return (
      <div className="mt-3">
        {keys.map((k) => (
          <input
            key={k}
            type="password"
            autoComplete="off"
            placeholder={k}
            value={values[k] ?? ''}
            onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))}
            className="mb-1.5 w-full rounded-md border border-os-border bg-os-surface2 px-2 py-1.5 font-mono text-[10.5px] text-os-text placeholder:text-os-dim focus:border-os-border-strong focus:outline-none"
          />
        ))}
        {error && <div className="mb-1.5 font-mono text-[9.5px] text-os-err">{error}</div>}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setError(null);
            }}
            className="rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-os-dim transition-colors hover:text-os-text"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || keys.some((k) => !(values[k] ?? '').trim())}
            onClick={() => void save()}
            className="rounded-full border border-os-border-strong px-3 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-os-text transition-colors hover:bg-os-text hover:text-os-bg disabled:opacity-40"
          >
            {busy ? 'Saving…' : 'Save & connect'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 flex items-center justify-between">
      {statusChip}
      {connected || keySaved ? (
        keySaved ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void disconnect()}
            className="rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-os-dim transition-colors hover:text-os-text disabled:opacity-40"
          >
            Disconnect
          </button>
        ) : (
          <span
            title="Credentials managed outside Founder OS (canonical machine files)"
            className="cursor-default rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-os-dim/60"
          >
            Managed
          </span>
        )
      ) : keys.length > 0 ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-full border border-os-border-strong px-3 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-os-text transition-colors hover:bg-os-text hover:text-os-bg"
        >
          + Connect
        </button>
      ) : (
        <span
          title={guidance ?? 'Connects through local setup, not a pasted key'}
          className="cursor-help rounded-full border border-os-border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-os-dim"
        >
          Setup
        </span>
      )}
    </div>
  );
}
