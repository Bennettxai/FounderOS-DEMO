import { getDb } from '@/lib/data';
import { phaseProgress } from '@/lib/roadmap';
import { PageHeader } from '@/components/PageHeader';
import { RoadmapBoard } from '@/components/RoadmapBoard';
import { Rise } from '@/components/motion';

export const dynamic = 'force-dynamic';

export default function RoadmapPage() {
  const db = getDb();
  const items = db.roadmap.all();
  const phases = phaseProgress(db.phases.all(), items);
  const departments = Object.fromEntries(db.departments.all().map((d) => [d.id, d.name]));
  const shipped = items.filter((i) => i.status === 'done').length;

  return (
    <div>
      <PageHeader
        eyebrow="build plan"
        title="Roadmap"
        right={
          <span className="font-mono text-[10px] text-os-muted">
            {shipped}/{items.length} shipped
          </span>
        }
      />
      <Rise i={1}>
        <RoadmapBoard phases={phases} items={items} departments={departments} />
      </Rise>
    </div>
  );
}
