import { getDb } from '@/lib/data';
import { paperclipIssues } from '@/lib/connectors/paperclip';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/terminal';
import { BoardTasks } from '@/components/BoardTasks';
import { TaskBoard } from '@/components/TaskBoard';
import { TaskCronStrip } from '@/components/TaskCronStrip';
import { Rise } from '@/components/motion';

export const dynamic = 'force-dynamic';

export default async function TasksPage() {
  const db = getDb();
  const tasks = db.agentTasks.all();
  const agentNames = Object.fromEntries(db.agents.all().map((a) => [a.id, a.name]));
  // The REAL org's queue rides on top: live board issues + a composer that
  // hands the company actual work. Local kanban below stays the OS's own.
  const issues = await paperclipIssues(30);
  // Scheduled work is agent work: the same page that shows the queue shows
  // what fires on a timer, with its real run history.
  const crons = db.agentCrons.all();
  const cronStats = db.cronRuns.statsByCron();
  const boardUrl = process.env.PAPERCLIP_API_URL ?? null;
  return (
    <div>
      <PageHeader
        eyebrow="agent work"
        title="Tasks"
        right={
          <Badge tone={boardUrl ? 'accent' : 'default'}>
            {boardUrl ? 'board live · paperclip' : 'board offline · paperclip'}
          </Badge>
        }
      />
      <Rise i={1}>
        <TaskCronStrip crons={crons} stats={cronStats} agentNames={agentNames} />
      </Rise>
      <Rise i={2}>
        <BoardTasks initialIssues={issues} boardUrl={boardUrl} />
      </Rise>
      <Rise i={3}>
        <TaskBoard initialTasks={tasks} agentNames={agentNames} />
      </Rise>
    </div>
  );
}
