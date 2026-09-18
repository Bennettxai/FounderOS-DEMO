'use client';

/**
 * The live footer of a connection tile: Connect opens an inline paste-a-key
 * form (one field per env key), Save posts to /api/connections/connect (which
 * writes .env.local only), and the page refreshes into the connector's real
 * status — connected is never faked, a stored key on a connector-less tile
 * reads "key saved". Guidance-only tools (WhatsApp needs Full Disk Access,
 * IMAP inboxes, CalDAV) show their setup hint instead of a form.
 *
 * Mock 3f: connecting is the one action here that reaches a far end, so it is
 * the three-state control — press, "OAuth…" with a spinner, then "✓ connected".
 * The done label reads off the error state rather than assuming success,
 * because a tick over a save that failed is the one lie this screen must not
 * tell. Status is a `.dot`, the same LED every other surface uses.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AsyncButton } from '@/components/AsyncButton';

/** What the board needs to pick an OAuth affordance, from lib/oauth/store. */
export type OAuthReadiness = {
  slug: string;
  name: string;
  redirectKind: 'any' | 'loopback' | 'https-public';
  consoleUrl: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  appConfigured: boolean;
  connected: boolean;
  expired: boolean;
};

export function ConnectFlow({
  slug,
  connected,
  keySaved,
  keys,
  guidance,
  oauth,
}: {
  slug: string;
  connected: boolean;
  keySaved: boolean;
  keys: string[];
  /** Live connector detail for guidance-only tools (keys.length === 0). */
  guidance?: string;
  /** Present only for providers that run a real authorization-code flow. */
  oauth?: OAuthReadiness | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    if (keys.some((k) => !(values[k] ?? '').trim())) {
      setError('every field is required');
      return;
    }
    setBusy(true);
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
      <span className="dot ok" />
      Connected
    </span>
  ) : keySaved ? (
    <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-os-warn">
      <span className="dot warn" />
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
            className="mb-1.5 w-full rounded-ctl border border-os-border bg-os-surface2 px-2 py-1.5 font-mono text-[10.5px] text-os-text placeholder:text-os-dim focus:border-os-border-strong focus:outline-none"
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
            data-lens="c"
            className="pressable rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-os-dim"
          >
            Cancel
          </button>
          <AsyncButton
            run={save}
            tone="primary"
            busyLabel="OAuth…"
            doneLabel={error ? 'failed' : 'connected'}
          >
            Save &amp; connect
          </AsyncButton>
        </div>
      </div>
    );
  }

  // The OAuth strip sits above the key row: it is the preferred path when the
  // provider supports it, and the key form stays as the fallback.
  const oauthStrip = oauth ? (
    <div className="mb-2 border-b border-os-border pb-2">
      {oauth.redirectKind === 'https-public' ? (
        // No button: this provider will not accept the http redirect this box
        // can offer, so offering one would be a button that cannot finish.
        <div className="font-mono text-[9.5px] leading-relaxed text-os-dim">
          OAuth needs a public https redirect — put a domain or tunnel in front of the OS first, then
          register <span className="text-os-muted">/api/oauth/callback</span> at{' '}
          <a href={oauth.consoleUrl} target="_blank" rel="noreferrer" className="linky text-os-muted">
            {oauth.name} console
          </a>
          .
        </div>
      ) : oauth.appConfigured ? (
        <a
          href={`/api/oauth/${slug}/start`}
          data-lens="c"
          className="pressable is-dark inline-flex items-center gap-1.5 rounded-ctl border border-os-border-strong px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-os-text"
        >
          {oauth.connected ? (oauth.expired ? 'Reconnect · expired' : 'Reconnect') : 'Connect with OAuth'}
        </a>
      ) : (
        <div className="font-mono text-[9.5px] leading-relaxed text-os-dim">
          Register an app at{' '}
          <a href={oauth.consoleUrl} target="_blank" rel="noreferrer" className="linky text-os-muted">
            {oauth.name} console
          </a>{' '}
          with redirect <span className="text-os-muted">/api/oauth/callback</span>, then save{' '}
          <span className="text-os-muted">{oauth.clientIdEnv}</span> and{' '}
          <span className="text-os-muted">{oauth.clientSecretEnv}</span> below.
          {oauth.redirectKind === 'loopback' && ' This provider allows http only on localhost, so open the OS on the box itself to finish it.'}
        </div>
      )}
    </div>
  ) : null;

  return (
    <div className="mt-3">
      {oauthStrip}
      <div className="flex items-center justify-between">
      {statusChip}
      {connected || keySaved ? (
        keySaved ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void disconnect()}
            data-lens="c"
            className="pressable rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-os-dim disabled:opacity-40"
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
          data-lens="c" className="pressable rounded-full border border-os-border-strong px-3 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-os-text hover:bg-os-text hover:text-os-bg"
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
    </div>
  );
}
