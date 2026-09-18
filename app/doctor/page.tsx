import { createGBrainProvider } from '@/lib/connectors/gbrain';
import { foldersToClusters } from '@/lib/brain-viz';
import { getDb } from '@/lib/data';
import { PageHeader } from '@/components/PageHeader';
import { BrainCore } from '@/components/BrainCore';
import { PillarRadar } from '@/components/PillarRadar';
import { pillarRadarAxes } from '@/lib/pillar-radar';
import { Dot, SectionHead } from '@/components/terminal';
import { DoctorRerun } from '@/components/DoctorRerun';
import { DoctorRunProvider } from '@/components/DoctorRun';
import { DoctorChecks } from '@/components/DoctorChecks';
import { Rise } from '@/components/motion';

export const dynamic = 'force-dynamic';

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return iso;
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function Stage({
  step,
  title,
  caption,
  children,
}: {
  step: string;
  title: string;
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex-1 rounded-panel border border-os-border bg-os-surface p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-ctl bg-os-accent font-mono text-xs font-bold text-os-ink">
          {step}
        </span>
        <div>
          <h2 className="text-sm font-bold">{title}</h2>
          <div className="font-mono text-[10.5px] text-os-dim">{caption}</div>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Arrow({ label }: { label: string }) {
  return (
    <div className="flex shrink-0 items-center justify-center self-stretch px-1 py-2 xl:flex-col">
      <div className="flex items-center gap-1 xl:flex-col">
        <span className="hidden h-px w-6 bg-os-border-strong xl:block xl:h-6 xl:w-px" />
        <span className="font-mono text-[10px] uppercase tracking-widest text-os-dim xl:[writing-mode:vertical-rl]">
          {label}
        </span>
        <span className="text-os-muted xl:rotate-90">→</span>
      </div>
    </div>
  );
}

function FlowStep({ title, detail, dashed = false }: { title: string; detail: string; dashed?: boolean }) {
  return (
    <div
      className={`flex-1 rounded-panel border px-3 py-2.5 ${
        dashed ? 'border-dashed border-os-border' : 'border-os-border bg-os-surface2'
      }`}
    >
      <div className="text-xs font-semibold">{title}</div>
      <div className="mt-0.5 text-[11px] leading-relaxed text-os-dim">{detail}</div>
    </div>
  );
}

// The Doctor: everything that reports on G-Brain's health, split off
// the knowledge-graph tab so that view can stay a single, uncluttered screen.
export default async function DoctorPage() {
  const overview = await createGBrainProvider().overview();
  const { store, doctor } = overview;
  const db = getDb();
  const maxFiles = Math.max(1, ...store.folders.map((f) => f.files));
  const clusters = foldersToClusters(store.folders);
  const storeShort = store.path.replace(process.env.HOME ?? '', '~');

  const lastBrainRun = db.agentRuns.byAgent('data-agent')[0];
  // latest run per agent (oldest first so the LAST write per id is the newest)
  const runsByAgent = Object.fromEntries(
    db.agentRuns
      .recent(300)
      .reverse()
      .map((r) => [r.agentId, r]),
  );
  const warnings = doctor.checks.filter((c) => c.status !== 'ok');
  const supabaseCheck = doctor.checks.find((c) => /supabase|database/i.test(c.name));
  const embedCheck = doctor.checks.find((c) => /embed|ollama|zero/i.test(c.name));
  const fallbackActive = supabaseCheck ? supabaseCheck.status !== 'ok' : !doctor.connected;

  const layers: { name: string; sub: string; val: string; state: string }[] = [
    {
      name: 'gbrain CLI',
      sub: 'binary path from env · doctor --fast',
      val: doctor.connected ? 'LIVE' : 'UNREACHABLE',
      state: doctor.connected ? 'connected' : 'error',
    },
    {
      name: 'brain-store/',
      sub: `${storeShort} · markdown knowledge`,
      val: `${store.totalFiles} pages`,
      state: store.totalFiles > 0 ? 'connected' : 'available',
    },
    {
      name: 'Ollama (bge-m3)',
      sub: 'hybrid-search embeddings · local, 1024d',
      val: embedCheck ? (embedCheck.status === 'ok' ? 'LIVE' : embedCheck.status.toUpperCase()) : 'LIVE',
      state: embedCheck && embedCheck.status !== 'ok' ? 'available' : 'connected',
    },
    {
      name: 'Supabase vector store',
      sub: '~900 pages / ~11k chunks · free tier idle-pause',
      val: fallbackActive ? 'PAUSED' : 'LIVE',
      state: fallbackActive ? 'available' : 'connected',
    },
  ];

  return (
    <DoctorRunProvider>
    <div>
      <PageHeader eyebrow="engine health" title="Doctor" caret right={<DoctorRerun />} />

      {/* Pillar spider chart on the LEFT, the radar/health monitor on the RIGHT
          — a 50/50 split of the row. Stacks on narrow screens. */}
      <Rise i={1} className="mt-5 grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2">
        <div data-lens="r" className="flex min-h-[480px] flex-col overflow-hidden rounded-panel border border-os-border bg-os-surface">
          <div className="flex items-start justify-between px-4 pt-3.5 font-mono text-[10px] leading-normal text-os-dim">
            <span>
              <b className="font-medium text-os-muted">pillar health</b> · live roster + runs + SOP coverage
            </span>
          </div>
          <PillarRadar
            axes={pillarRadarAxes(db.departments.all(), db.agents.all(), db.sopTasks.all(), runsByAgent)}
            health={doctor.healthScore}
            warnings={warnings.length}
          />
        </div>

        <div data-lens="r" className="brain-stage relative flex min-h-[480px] flex-col overflow-hidden rounded-panel border border-os-border">
          {/* annotations as a real header row — at half width the old absolute
              corners collided with the radar's ring labels */}
          <div className="flex items-start justify-between px-4 pt-3.5 font-mono text-[10px] leading-normal text-os-dim">
            <div className="flex flex-col gap-1">
              <span>
                <b className="font-medium text-os-muted">doctor</b> ·{' '}
                {doctor.connected ? (warnings.length > 0 ? 'warnings' : 'ok') : 'unreachable'}
              </span>
              <span>
                {lastBrainRun ? `last run ${relativeTime(lastBrainRun.finishedAt)} · data-agent` : 'no agent runs yet'}
              </span>
            </div>
            <div className="flex flex-col gap-1 text-right">
              <span>
                <b className="font-medium text-os-muted">hybrid search</b> {doctor.connected ? 'verified' : 'degraded'}
              </span>
              <span>{fallbackActive ? 'local fallback active' : 'supabase reachable'}</span>
            </div>
          </div>
          <div className="grid flex-1 place-items-center">
            <div className="w-full max-w-[540px]">
              <BrainCore clusters={clusters} health={doctor.healthScore} doctor={doctor} fallbackActive={fallbackActive} />
            </div>
          </div>
        </div>
      </Rise>

      {/* Core status: storage layers + doctor-health footer, full width. */}
      <Rise i={2} className="mt-4 flex flex-col overflow-hidden border border-os-border bg-os-surface">
        <div className="border-b border-os-border px-3.5 py-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-os-dim">
          Storage layers
        </div>
        <div className="flex flex-1 flex-col divide-y divide-os-border">
          {layers.map((layer) => (
            <div key={layer.name} data-lens="r" className="pressable is-row flex flex-1 items-center gap-3 px-3.5 py-3">
              <Dot state={layer.state} pulse={layer.state === 'connected'} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-semibold">{layer.name}</div>
                <div className="truncate font-mono text-[10px] text-os-dim">{layer.sub}</div>
              </div>
              <span
                className={`shrink-0 font-mono text-[10.5px] font-semibold ${
                  layer.state === 'connected' ? 'text-os-ok' : layer.state === 'error' ? 'text-os-err' : 'text-os-warn'
                }`}
              >
                {layer.val}
              </span>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-os-border px-3.5 py-3 font-mono text-[10.5px]">
          <span className="text-os-dim">
            <b className="font-medium text-os-muted">doctor</b> · health {doctor.healthScore ?? '—'}/100
          </span>
          <span className={warnings.length > 0 ? 'text-os-warn' : doctor.connected ? 'text-os-ok' : 'text-os-err'}>
            {doctor.connected ? (warnings.length > 0 ? `${warnings.length} warnings` : 'all green') : 'offline'}
          </span>
        </div>
      </Rise>

      {/* The pipeline: where knowledge lives and how it becomes searchable */}
      <Rise as="section" i={3} className="mt-8">
        <SectionHead label="Pipeline" count={`${store.totalFiles} pages on disk`} />
        <div className="flex flex-col gap-2 xl:flex-row xl:items-stretch">
          <Stage step="1" title="Markdown brain-store" caption={storeShort}>
            <div className="text-xs text-os-muted">
              {store.totalFiles} pages on disk, plain <span className="font-semibold text-os-text">.md</span> files,
              the source of truth. <code className="font-mono text-[11px]">gbrain sync</code> walks the git repo and
              pushes changed pages up.
            </div>
            <ul className="mt-3 space-y-1.5">
              {store.folders.map((folder) => (
                <li key={folder.name} className="flex items-center gap-2">
                  <span className="w-24 shrink-0 truncate font-mono text-[11px] text-os-muted">{folder.name}</span>
                  <span
                    className="h-2 rounded-sm bg-os-accent"
                    style={{
                      width: `${Math.max(6, (folder.files / maxFiles) * 100)}%`,
                      opacity: 0.25 + 0.55 * (folder.files / maxFiles),
                    }}
                  />
                  <span className="font-mono text-[11px] text-os-dim">{folder.files}</span>
                </li>
              ))}
            </ul>
          </Stage>

          <Arrow label="sync · import" />

          <Stage step="2" title="gbrain CLI" caption="chunk · embed · route, the engine between disk and database">
            <DoctorChecks
              checks={doctor.checks}
              healthScore={doctor.healthScore}
              connected={doctor.connected}
              detail={doctor.detail}
            />
            <div className="mt-3 flex flex-wrap gap-1">
              {['put', 'get', 'query', 'search', 'sync', 'import', 'export', 'doctor'].map((cmd) => (
                <span key={cmd} data-lens="c" className="rounded-ctl border border-os-border bg-os-surface2 px-1.5 py-0.5 font-mono text-[10px] text-os-muted">
                  {cmd}
                </span>
              ))}
            </div>
          </Stage>

          <Arrow label="embed · upsert" />

          <Stage step="3" title="Supabase Postgres + pgvector" caption="vector store · Ollama bge-m3 embeddings">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-panel border border-os-border bg-os-surface2 px-3 py-2.5">
                <div className="font-mono text-xl font-bold">~900</div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-os-dim">pages · last known</div>
              </div>
              <div className="rounded-panel border border-os-border bg-os-surface2 px-3 py-2.5">
                <div className="font-mono text-xl font-bold">~11k</div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-os-dim">chunks · last known</div>
              </div>
            </div>
            <div className="mt-3 space-y-1.5 text-[11px] leading-relaxed text-os-muted">
              <p>
                Each page is split into chunks; every chunk gets a local bge-m3 embedding stored in a{' '}
                <code className="font-mono">vector</code> column. Postgres holds both the text (tsvector) and the
                vectors, so one database answers keyword and semantic queries.
              </p>
              <p className="text-os-dim">
                Free tier pauses on idle — when hybrid queries fail, unpause from the Supabase dashboard. The
                brain-store on disk keeps working regardless.
              </p>
            </div>
          </Stage>
        </div>
      </Rise>

      {/* How a query actually resolves */}
      <Rise as="section" i={4} className="mt-8">
        <SectionHead label="Query path" />
        <p className="mb-3 text-xs text-os-dim">
          What happens when an agent calls <code className="font-mono">gbrain query</code>, hybrid retrieval with an
          honest fallback.
        </p>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-stretch">
          <FlowStep title="Question" detail="Natural-language query from you or an agent run." />
          <Arrow label="expand" />
          <FlowStep title="Query expansion" detail="The CLI rewrites the question into search variants (skip with --no-expand)." />
          <Arrow label="fan out" />
          <div className="flex flex-1 flex-col gap-2">
            <FlowStep title="Keyword search" detail="Postgres tsvector full-text match over chunk text." />
            <FlowStep title="Vector search" detail="pgvector nearest-neighbor over Ollama bge-m3 embeddings (1024d)." />
          </div>
          <Arrow label="merge" />
          <FlowStep title="RRF fusion" detail="Reciprocal-rank fusion merges both result lists into one ranking." />
          <Arrow label="answer" />
          <FlowStep title="Ranked snippets" detail="Top pages with snippets, returned to the agent." />
        </div>
        <div className="mt-2 flex flex-col gap-2 lg:flex-row lg:items-stretch">
          <FlowStep
            dashed
            title="Fallback: local grep"
            detail="If Supabase is paused or unreachable, FOUNDER OS greps the markdown brain-store directly — fewer smarts, zero downtime."
          />
        </div>
      </Rise>
    </div>
    </DoctorRunProvider>
  );
}
