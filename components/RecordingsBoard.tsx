import { ExternalLink, Mic, Video } from 'lucide-react';
import { Dot } from '@/components/terminal';
import type { ConnectorStatus } from '@/lib/connectors/types';
import { formatDuration, isPlaudSample, type Recording } from '@/lib/recordings-format';

/** The Recordings tab on /comms: Plaud (the recorder in the room) and Fathom
    (the notetaker on calls) in one newest-first list, each recorder's honest
    connector state up top. Server-renderable; no interaction. */
export function RecordingsBoard({ recordings, sources, nowISO }: { recordings: Recording[]; sources: ConnectorStatus[]; nowISO: string }) {
  const now = Date.parse(nowISO);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2.5 sm:grid-cols-2">
        {sources.map((s) => (
          <div key={s.id} className="flex items-start gap-2.5 rounded-md-t border border-os-border bg-os-surface px-3 py-2.5">
            <Dot state={s.state} />
            <div className="min-w-0">
              <div className="font-mono text-[11.5px] font-semibold">
                {s.name}
                <span className="ml-2 text-[9.5px] uppercase tracking-[0.15em] text-os-dim">{s.id === 'plaud' ? 'in the room' : 'on calls'}</span>
              </div>
              <p className="mt-0.5 truncate text-[10px] leading-snug text-os-dim" title={s.detail}>
                {s.detail}
              </p>
            </div>
          </div>
        ))}
      </div>

      {recordings.length === 0 ? (
        <p className="rounded-md-t border border-dashed border-os-border px-3 py-3 font-mono text-[10.5px] text-os-dim">
          No recordings yet — connect Plaud (PLAUD_REFRESH_TOKEN) and Fathom (FATHOM_API_KEY) to list every recorded conversation here.
        </p>
      ) : (
        <ul className="divide-y divide-os-border border border-os-border bg-os-surface">
          {recordings.map((r) => {
            const Icon = r.source === 'plaud' ? Mic : Video;
            const t = Date.parse(r.at);
            const age = Number.isFinite(t) ? relative(now - t) : '';
            return (
              <li key={r.id} data-lens="r" className="pressable is-row flex items-center gap-3 px-3 py-2.5">
                <Icon className="h-3.5 w-3.5 shrink-0 text-os-accent" strokeWidth={1.7} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-[11.5px] font-semibold">{r.title}</div>
                  <div className="mt-0.5 font-mono text-[9.5px] uppercase tracking-[0.15em] text-os-dim">
                    {r.source} · {Number.isFinite(t) ? r.at.slice(0, 10) : 'undated'}
                    {age ? ` · ${age}` : ''}
                  </div>
                </div>
                {r.source === 'plaud' ? (
                  <span
                    className={`shrink-0 rounded-full border px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.15em] ${
                      r.brain ? 'border-os-ok text-os-ok' : 'border-os-border text-os-dim'
                    }`}
                    title={
                      r.brain
                        ? `filed in the knowledge base via ${r.brain}`
                        : isPlaudSample(r.title)
                          ? "one of Plaud's bundled sample recordings; never filed"
                          : 'not in the knowledge base yet (waiting for Plaud to transcribe, or for the next ingest pass)'
                    }
                  >
                    {r.brain ? 'in brain' : isPlaudSample(r.title) ? 'sample' : 'not filed'}
                  </span>
                ) : null}
                <span className="shrink-0 font-mono text-[10.5px] text-os-muted">{formatDuration(r.durationMinutes)}</span>
                {r.url ? (
                  <a href={r.url} target="_blank" rel="noreferrer" className="shrink-0 text-os-dim hover:text-os-accent" aria-label="open recording">
                    <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.7} />
                  </a>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function relative(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '';
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
