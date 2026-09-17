import { getDb } from '@/lib/data';
import { PageHeader } from '@/components/PageHeader';
import { Rise } from '@/components/motion';
import { PersonasViewer } from '@/components/PersonasViewer';
import { Badge } from '@/components/terminal';

export const dynamic = 'force-dynamic';

export default function PersonasPage() {
  const personas = getDb().personas.all();

  return (
    <div>
      <PageHeader
        eyebrow="platform variants"
        title="Personas"
        right={<Badge tone="accent">{personas.length} templates</Badge>}
      />
      <Rise i={1}>
        <PersonasViewer personas={personas} />
      </Rise>
    </div>
  );
}
