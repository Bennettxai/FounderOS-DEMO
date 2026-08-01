import { getDb } from '@/lib/data';
import { groupRoadmapByQuarter } from '@/lib/roadmap';
import { PageHeader } from '@/components/PageHeader';
import { Badge, SectionHead, type BadgeTone } from '@/components/terminal';
import type { RoadmapStatus } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

const STATUS_BADGE: Record<RoadmapStatus, { tone: BadgeTone; ghost: boolean; label: string }> = {
  done: { tone: 'ok', ghost: false, label: 'Done' },
  now: { tone: 'accent', ghost: false, label: 'Now' },
  next: { tone: 'warn', ghost: false, label: 'Next' },
  later: { tone: 'default', ghost: true, label: 'Later' },
};

export default function RoadmapPage() {
  const db = getDb();
  const quarters = groupRoadmapByQuarter(db.roadmap.all());
  const phases = db.phases.all();
  const departments = new Map(db.departments.all().map((d) => [d.id, d]));

  return (
    <div>
      <PageHeader
        eyebrow="build plan"
        title="Roadmap"
      />

      {/* High-level functionality phases */}
      <section className="mb-9">
        <SectionHead label="Phases" count={phases.length} />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 ultra:grid-cols-6">
          {phases.map((phase) => (
            <div key={phase.id} className="rounded-lg-t border border-os-border bg-os-surface px-[17px] py-[15px]">
              <div className="mb-[7px] font-mono text-[10px] tracking-[0.18em] text-os-accent">
                PHASE {String(phase.number).padStart(2, '0')}
              </div>
              <h2 className="text-sm font-bold">{phase.title}</h2>
              <ul className="mt-2.5 flex flex-col gap-1.5">
                {phase.items.map((item) => (
                  <li key={item} className="flex items-baseline gap-2 text-[11.5px] text-os-muted">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-os-dim" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Quarterly columns */}
      <SectionHead label="Quarter by quarter" />
      <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-4 ultra:grid-cols-6">
        {quarters.map(({ quarter, items }) => {
          const doneN = items.filter((r) => r.status === 'done').length;
          return (
            <section key={quarter}>
              <div className="mb-3 flex items-center gap-2.5">
                <span className="font-mono text-xs font-semibold tracking-[0.12em]">
                  {quarter.replace('-', ' · ')}
                </span>
                <span className="font-mono text-[10px] text-os-dim">
                  {doneN}/{items.length} done
                </span>
                <span className="h-px flex-1 bg-os-border" />
              </div>
              <div className="flex flex-col gap-2.5">
                {items.map((item) => {
                  const badge = STATUS_BADGE[item.status];
                  const dept = item.departmentId ? departments.get(item.departmentId) : null;
                  const done = item.status === 'done';
                  return (
                    <div
                      key={item.id}
                      className={`hoverable rounded-lg-t border border-os-border bg-os-surface px-[15px] py-3 ${done ? 'opacity-[0.62]' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-2.5">
                        <div
                          className={`text-[12.5px] font-semibold leading-snug ${done ? 'text-os-muted line-through decoration-os-dim' : ''}`}
                        >
                          {item.title}
                        </div>
                        <Badge tone={badge.tone} ghost={badge.ghost}>
                          {badge.label}
                        </Badge>
                      </div>
                      <p className="mt-1.5 text-[11px] leading-relaxed text-os-dim [text-wrap:pretty]">{item.description}</p>
                      {dept && (
                        <div className="mt-2.5 flex items-center gap-1.5 font-mono text-[9.5px] text-os-muted">
                          <span className="h-[5px] w-[5px] rounded-sm bg-os-accent" />
                          {dept.name}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
