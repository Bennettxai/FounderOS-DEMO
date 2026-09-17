import { getDb } from '@/lib/data';
import { PageHeader } from '@/components/PageHeader';
import { Rise } from '@/components/motion';
import { TaskBoard } from '@/components/TaskBoard';

export const dynamic = 'force-dynamic';

export default function TasksPage() {
  const db = getDb();
  const tasks = db.agentTasks.all();
  const agentNames = Object.fromEntries(db.agents.all().map((a) => [a.id, a.name]));
  return (
    <div>
      <PageHeader eyebrow="agent work" title="Tasks" />
      <Rise i={1}>
        <TaskBoard initialTasks={tasks} agentNames={agentNames} />
      </Rise>
    </div>
  );
}
