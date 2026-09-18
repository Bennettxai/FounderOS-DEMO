'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Bot,
  Cpu,
  Crown,
  FileText,
  Hammer,
  Landmark,
  Loader2,
  Megaphone,
  MessageSquare,
  Sparkles,
  TrendingUp,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { AsyncButton } from '@/components/AsyncButton';
import { BoardTaskCard } from '@/components/BoardTaskCard';
import { CountUp } from '@/components/CountUp';
import { Label } from '@/components/terminal';
import { boardDecisionFor, boardStats, groupIssues, modelSummary, orderRuns, orderSeats, runDuration, runningSince, RUN_OK, type BoardLivePayload } from '@/lib/board-live';
import type { PaperclipAgent } from '@/lib/connectors/paperclip';

/**
 * The live Paperclip board rendered natively in the OS: agents running live
 * on the OS, not a separate tool to check.
 * Polls /api/board/live every 4s while the tab is visible: seat chips with
 * status LEDs and models, the heartbeat run feed, and the task lanes. Every
 * seat has a real Run button. Unreachable board shows an honest dead strip,
 * never fake green.
 */
const POLL_MS = 4000;

/**
 * One glyph per seat instead of an anonymous dot: a small icon per agent,
 * color coded with the department heads.
 * Matched by name so renamed/new seats still land somewhere; Bot is the
 * honest fallback for a seat we do not recognize.
 */
const SEAT_GLYPHS: [RegExp, LucideIcon, string][] = [
  [/conductor/i, Crown, '#e4efe6'], //   ceo · neutral white
  [/tech/i, Cpu, '#8b7cf6'], //          cto · violet
  [/marketing|growth/i, Megaphone, '#ff9f43'], // cmo · orange
  [/finance/i, Landmark, '#38bdf8'], //  cfo · sky
  [/sales/i, TrendingUp, '#ffd166'], //  gold
  [/comm/i, MessageSquare, '#4cc9f0'], // cyan
  [/forge/i, Hammer, '#f472b6'], //      pink
  [/hermes|worker/i, Zap, '#a78bfa'], // the pool · lavender
  [/summar/i, FileText, '#94a3b8'], //   slate
  [/reflect/i, Sparkles, '#facc15'], //  yellow
];

function seatGlyph(name: string): { Icon: LucideIcon; color: string } {
  for (const [re, Icon, color] of SEAT_GLYPHS) if (re.test(name)) return { Icon, color };
  return { Icon: Bot, color: 'var(--muted)' };
}

/** Status overrides the department color: green while on, red when broken. */
function seatIconColor(agent: PaperclipAgent, live: boolean, idleColor: string): string {
  if (agent.status === 'error') return 'var(--err)';
  if (live || agent.status === 'running') return 'var(--ok)';
  if (agent.status === 'paused') return 'var(--warn)';
  return idleColor;
}

/** Ticking elapsed clock under the spinner; parent supplies the real start. */
function Elapsed({ since }: { since: number }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const s = Math.max(0, Math.floor((Date.now() - since) / 1000));
  const text = s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}`;
  return <span className="font-mono text-[8.5px] tabular-nums leading-none text-os-ok">{text}</span>;
}

/**
 * The stats row needs a label that WRAPS.
 *
 * The shared <Label> hard-codes `whitespace-nowrap`, which is correct for a
 * section head and wrong inside a 1/5-width card: on /agents the board gets a
 * `minmax(0,1fr)` column beside the 400px Conductor rail, so each stat card
 * lands around 145px and 'Heartbeats · 24h' ran straight out the right side of
 * its box. Tighter tracking plus two allowed lines keeps every label inside,
 * and the reserved two-line height keeps all five numbers on one baseline
 * whether their label wraps or not.
 */
function StatLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[1.6em] font-mono text-[9.5px] font-bold uppercase leading-[1.3] tracking-[0.16em] text-os-dim">
      {children}
    </div>
  );
}

/** One colour per stage so the lanes read as a pipeline, not a list. */
const LANE_DOT: Record<string, string> = {
  in_progress: 'bg-os-ok',
  in_review: 'bg-os-warn',
  review: 'bg-os-warn',
  blocked: 'bg-os-err',
  todo: 'bg-os-muted',
  backlog: 'bg-os-dim',
  done: 'bg-os-dim',
};

const runColor = (status: string): string =>
  status === 'running' ? 'text-os-ok' : RUN_OK.has(status) ? 'text-os-muted' : 'text-os-err';

const runGlyph = (status: string): string => (status === 'running' ? '▸' : RUN_OK.has(status) ? '✓' : '✕');

const ago = (iso: string | null): string => {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'now';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

function SeatChip({ agent, since }: { agent: PaperclipAgent; since: string | null }) {
  // A click OWNS this control until its ✓ has been seen. Without that hold the
  // 4s board poll would flip the seat to `running` mid-flight and swap the
  // button out for the monitor, eating the done state the click earned.
  const [owned, setOwned] = useState(false);
  const [failed, setFailed] = useState(false);
  const release = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (release.current) clearTimeout(release.current); }, []);
  const run = async () => {
    setOwned(true);
    setFailed(false);
    if (release.current) clearTimeout(release.current);
    try {
      const res = await fetch(`/api/board/agents/${agent.id}/run`, { method: 'POST' });
      if (!res.ok) setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      // 1.6s covers AsyncButton's 1.4s done phase, then the board takes over
      release.current = setTimeout(() => setOwned(false), 1600);
    }
  };
  const running = agent.status === 'running';
  // The click answers instantly and the board confirms behind it, so the chip
  // is never silent between the press and the heartbeat showing up.
  const live = running || owned;
  const startedMs = since ? new Date(since).getTime() : null;
  const { Icon, color } = seatGlyph(agent.name);
  return (
    <div
      data-lens="r"
      className={`pressable is-row flex items-start gap-2 rounded-ctl border bg-os-bg px-2.5 py-2${
        live ? ' agent-live' : ''
      }`}
      style={live ? undefined : { borderColor: agent.status === 'error' ? 'color-mix(in oklab, var(--err) 45%, var(--border))' : 'var(--border)' }}
    >
      <Icon
        className={`mt-0.5 h-3.5 w-3.5 shrink-0${running ? ' animate-pulse' : ''}`}
        style={{ color: seatIconColor(agent, live, color) }}
      />
      {/* Name with the model line always under it: the model/adapter readout
          must NOT disappear while the seat is running.
          Both lines TRUNCATE and the chip stays two lines tall. Wrapping them
          so nothing was cut made every chip up to twice as tall, and the agent
          boxes read as oversized. A compact roster beats
          a complete one here; the title tooltips carry the full strings, and
          the header's model roster already lists every model in play. */}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11.5px] font-semibold leading-tight" title={agent.name}>
          {agent.name}
        </div>
        <div
          className="truncate font-mono text-[9px] text-os-dim"
          title={`${agent.model ?? agent.adapterType ?? 'unconfigured'}${agent.model && agent.adapterType ? ` · ${agent.adapterType}` : ''}`}
        >
          {agent.model ?? agent.adapterType ?? 'unconfigured'}
          {agent.model && agent.adapterType ? ` · ${agent.adapterType}` : ''}
          {failed && <span className="text-os-err"> · run failed</span>}
        </div>
      </div>
      {/* Right column, three exclusive states. A run HE started goes ▸ →
          spinner + elapsed → ✓ in the control itself. A run the board reports
          (started from Paperclip, or a heartbeat cron) cedes the slot to the
          monitor instead: its spinner and clock are board truth, not ours. */}
      <div className="flex w-7 shrink-0 flex-col items-center gap-1 self-center">
        {running && !owned ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin text-os-ok" />
            {startedMs !== null && <Elapsed since={startedMs} />}
          </>
        ) : (
          <span title={`Run ${agent.name} heartbeat on the board`}>
            <AsyncButton run={run} tone="ghost" failed={failed} showElapsed busyLabel="" doneLabel="" failLabel="">
              ▸
            </AsyncButton>
          </span>
        )}
      </div>
    </div>
  );
}

export function BoardLive({ initial, boardUrl }: { initial: BoardLivePayload; boardUrl: string | null }) {
  const [data, setData] = useState<BoardLivePayload>(initial);
  const inflight = useRef(false);

  useEffect(() => {
    const tick = async () => {
      // pause while the tab is hidden and never stack requests
      if (document.hidden || inflight.current) return;
      inflight.current = true;
      try {
        const res = await fetch('/api/board/live', { cache: 'no-store' });
        if (res.ok) setData((await res.json()) as BoardLivePayload);
      } catch {
        /* transient poll failure: keep the last snapshot on screen */
      } finally {
        inflight.current = false;
      }
    };
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, []);

  const running = data.agents.filter((a) => a.status === 'running').length;
  // the board's runs endpoint doesn't always join the agent — resolve names
  // from the seats so the feed never shows a raw uuid
  const nameById = new Map(data.agents.map((a) => [a.id, a.name]));
  // The feed scrolls and now fills the column, so the old 14-row cap just
  // hid runs we had already paid to fetch (the API returns 120).
  const runs = orderRuns(data.runs).slice(0, 120);
  const lanes = groupIssues(data.issues);
  const agentRunning = new Set(data.agents.filter((a) => a.status === 'running').map((a) => a.name));

  return (
    <section className="flex h-full min-h-0 flex-col rounded-panel border border-os-border bg-os-surface">
      <div className="shrink-0 border-b border-os-border px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className={`h-1.5 w-1.5 ${data.connected ? 'bg-os-ok animate-pulse' : 'bg-os-err'}`} />
          <Label>Board live</Label>
          <span className="font-mono text-[10px] text-os-dim">
            {data.connected ? `${data.agents.length} seats · ${running} running` : 'board unreachable'}
          </span>
          {boardUrl && (
            <a
              href={boardUrl}
              target="_blank"
              rel="noreferrer"
              className="ml-auto flex shrink-0 items-center gap-1 font-mono text-[10px] text-os-dim linky"
            >
              open board <ArrowUpRight className="h-3 w-3" />
            </a>
          )}
        </div>
        {/* The model roster gets its own full-width line and WRAPS. Squeezed
            into the header row it had to truncate, so anything past the fifth
            model clipped to an ellipsis and the rest of the seats went unseen.
            A wrapping line keeps every seat visible at every width. */}
        {data.connected && (
          <p className="mt-1 font-mono text-[10px] leading-relaxed text-os-muted" title="models holding seats right now">
            {modelSummary(data.agents)}
          </p>
        )}
      </div>

      {!data.connected ? (
        <p className="px-4 py-3 font-mono text-[10.5px] text-os-dim">
          Paperclip is not answering on the private network. No fake data: this strip lights up the moment the board responds.
        </p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
          {/* the numbers row, all REAL: derived from live board data only */}
          <div className="grid shrink-0 grid-cols-5 gap-2 max-[900px]:grid-cols-2">
            {(() => {
              const s = boardStats(data);
              return (
                [
                  ['Seats', s.seats],
                  ['Running now', s.running],
                  ['Open tasks', s.openTasks],
                  ['Runs · 24h', s.runs24h],
                  ['Heartbeats · 24h', s.heartbeats24h],
                ] as const
              ).map(([label, value]) => (
                <div key={label} data-lens="r" className="pressable is-row flex min-w-0 flex-col gap-1 rounded-ctl border border-os-border bg-os-bg px-2.5 py-2">
                  <StatLabel>{label}</StatLabel>
                  <div className="font-mono text-[22px] font-semibold leading-none tracking-[-0.02em]"><CountUp value={value} /></div>
                </div>
              ));
            })()}
          </div>

          <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
            {orderSeats(data.agents).map((a) => (
              <SeatChip key={a.id} agent={a} since={runningSince(data.runs, a.id)} />
            ))}
          </div>

          {/* the feed + lanes absorb ALL remaining panel height: use up the
              white space, scroll inside the panel only. Move the lanes to
              the right and add the stages.
              The run feed is a fixed-shape list and never needed half the
              panel; the lanes did, so they take everything that is left. */}
          <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
            <div className="flex min-h-0 flex-col">
              <div className="mb-2 shrink-0"><Label>Run feed</Label></div>
              <div className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pr-1">
                {runs.length === 0 && (
                  <p className="font-mono text-[10px] text-os-dim">no heartbeat runs yet, hit a ▸ on a seat</p>
                )}
                {runs.map((r) => (
                  <div key={r.id} data-lens="r" className="pressable is-row animate-enter flex items-baseline gap-1.5 rounded-ctl px-1 py-0.5 font-mono text-[9.5px] leading-snug">
                    <span className={`font-bold ${runColor(r.status)}`}>{runGlyph(r.status)}</span>
                    <span className="min-w-0 flex-1 truncate text-os-text">
                      {r.agentName ?? nameById.get(r.agentId) ?? r.agentId.slice(0, 8)}
                    </span>
                    {/* The glyph already encodes a clean finish, so spelling
                        out 'succeeded' on every row just ate the width the
                        agent name needed and clipped 'Conductor' to 'Cond…'.
                        Anything NOT a clean finish still says so in words. */}
                    {!RUN_OK.has(r.status) && <span className={runColor(r.status)}>{r.status}</span>}
                    {runDuration(r) && <span className="text-os-dim">{runDuration(r)}</span>}
                    <span className="shrink-0 text-os-dim">{ago(r.startedAt)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex min-h-0 flex-col">
              <div className="mb-2 shrink-0"><Label>Task lanes</Label></div>
              {/* The stages always render — an empty lane reads as a stage with
                  nothing in it, whereas a missing lane reads as a broken board.
                  groupIssues guarantees at least in progress / todo / done. */}
              <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-1">
                  {lanes.map((lane) => (
                    // Lanes SHARE the column rather than each taking a fixed
                    // 176px: four fixed lanes needed ~740px and the panel only
                    // has ~430px next to the run feed, so `done` fell off the
                    // right edge behind a scrollbar. min-w keeps them readable
                    // if the board ever opens enough stages to need scrolling.
                    <div key={lane.status} className="flex min-w-[5.5rem] flex-1 basis-0 flex-col">
                      <div
                        className={`mb-1.5 flex shrink-0 items-center gap-1 font-mono text-[9px] uppercase tracking-[0.08em] ${
                          lane.issues.length === 0 ? 'text-os-dim/60' : 'text-os-dim'
                        }`}
                      >
                        <span className={`h-1 w-1 shrink-0 ${LANE_DOT[lane.status] ?? 'bg-os-dim'}`} />
                        <span className="truncate">{lane.status.replace(/_/g, ' ')}</span>
                        <span className="ml-auto shrink-0 tabular-nums">{lane.issues.length}</span>
                      </div>
                      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain pr-1">
                        {lane.issues.length === 0 && (
                          <div className="animate-enter rounded-ctl border border-dashed border-os-border px-2 py-1.5 font-mono text-[9.5px] text-os-dim/70">
                            nothing here
                          </div>
                        )}
                        {lane.issues.map((i) => {
                          // A task is live when the agent holding it is running,
                          // so the line and the roster agree at a glance.
                          const working = !!i.assigneeName && agentRunning.has(i.assigneeName);
                          return (
                            <BoardTaskCard
                              key={i.id}
                              issue={i}
                              working={working}
                              decision={boardDecisionFor(i, data.decisions)}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
