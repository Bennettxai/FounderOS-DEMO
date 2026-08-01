'use client';

/**
 * API keys panel for the Connections board. Reads masked slot statuses,
 * writes new values to .env.local via POST /api/keys (live immediately).
 * Raw secrets are never displayed back.
 */
import { useEffect, useMemo, useState } from 'react';
import { KeyRound, Check } from 'lucide-react';
import type { KeyStatus } from '@/lib/keys';

export function ApiKeys() {
  const [keys, setKeys] = useState<KeyStatus[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [savedVar, setSavedVar] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    fetch('/api/keys')
      .then((r) => r.json())
      .then((b) => setKeys(b.keys ?? []))
      .catch(() => setError('could not load key statuses'));

  useEffect(() => {
    load();
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, KeyStatus[]>();
    for (const k of keys) {
      if (!map.has(k.group)) map.set(k.group, []);
      map.get(k.group)!.push(k);
    }
    return [...map.entries()];
  }, [keys]);

  const save = async (envVar: string) => {
    if (!value.trim()) return;
    setError(null);
    const res = await fetch('/api/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ envVar, value: value.trim() }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(typeof body.error === 'string' ? body.error : 'save failed');
      return;
    }
    setValue('');
    setEditing(null);
    setSavedVar(envVar);
    setTimeout(() => setSavedVar(null), 2500);
    load();
  };

  return (
    <section className="mt-10">
      <div className="mb-1 flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-os-muted" />
        <h2 className="text-sm font-bold uppercase tracking-widest text-os-muted">API keys</h2>
      </div>
      <p className="mb-4 text-xs text-os-dim">
        Stored in <code>.env.local</code> (gitignored), applied live. Values shown masked — the OS never
        echoes a secret back.
      </p>
      {error && <p className="mb-3 font-mono text-[11px] text-os-muted">✗ {error}</p>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {groups.map(([group, slots]) => (
          <div key={group} className="hoverable rounded-xl border border-os-border bg-os-surface p-4">
            <h3 className="mb-2 text-xs font-bold">{group}</h3>
            <ul className="space-y-1.5">
              {slots.map((slot) => (
                <li key={slot.envVar} className="text-[11px]">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        slot.present ? 'bg-os-text' : 'border border-os-dim'
                      }`}
                    />
                    <span className="w-40 truncate font-mono text-os-muted" title={slot.envVar}>
                      {slot.envVar}
                    </span>
                    <span className="font-mono text-os-dim">{slot.present ? slot.masked : 'not set'}</span>
                    {savedVar === slot.envVar && <Check className="h-3 w-3 text-os-text" />}
                    <button
                      onClick={() => {
                        setEditing(editing === slot.envVar ? null : slot.envVar);
                        setValue('');
                        setError(null);
                      }}
                      className="ml-auto text-[10px] text-os-dim hover:text-os-text"
                    >
                      {editing === slot.envVar ? 'cancel' : slot.present ? 'rotate' : 'set'}
                    </button>
                  </div>
                  {editing === slot.envVar && (
                    <div className="mt-1.5 flex gap-1.5 pl-3.5">
                      <input
                        type="password"
                        autoFocus
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && save(slot.envVar)}
                        placeholder={slot.hint ?? 'paste value'}
                        className="flex-1 rounded border border-os-border bg-os-bg px-2 py-1 font-mono text-[11px] text-os-text placeholder:text-os-dim focus:border-os-border-bright focus:outline-none"
                      />
                      <button
                        onClick={() => save(slot.envVar)}
                        className="rounded bg-os-text px-2.5 py-1 text-[10px] font-bold text-os-bg"
                      >
                        Save
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
