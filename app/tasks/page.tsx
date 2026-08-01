import { getDb } from '@/lib/data';
import { PageHeader } from '@/components/PageHeader';
import { TaskBoard } from '@/components/TaskBoard';

export const dynamic = 'force-dynamic';

export default function TasksPage() {
  const db = getDb();
  const tasks = db.agentTasks.all();
  const agentNames = Object.fromEntries(db.agents.all().map((a) => [a.id, a.name]));
  return (
    <div>
      <PageHeader eyebrow="agent work" title="Tasks" />
      <TaskBoard initialTasks={tasks} agentNames={agentNames} />
    </div>
  );
}
