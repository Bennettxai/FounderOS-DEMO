import { ListChecks } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';

export const dynamic = 'force-dynamic';

export default function TasksPage() {
  return (
    <div>
      <PageHeader
        eyebrow="company work"
        title="Tasks"
      />

      <div className="mb-8 max-w-3xl">
        <p className="text-sm leading-relaxed text-os-muted">
          Company tasks and agent assignments will appear here as workflows
          become operational.
        </p>

        <p className="mt-2 text-sm leading-relaxed text-os-dim">
          No legacy FounderOS tasks are loaded.
        </p>
      </div>

      <section className="rounded-lg-t border border-dashed border-os-border p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md-t border border-os-border bg-os-surface2">
            <ListChecks className="h-5 w-5 text-os-muted" />
          </div>

          <div>
            <div className="text-sm font-semibold">
              No company tasks yet
            </div>

            <p className="mt-2 text-sm leading-relaxed text-os-muted">
              Tasks will be created by the company workflow system and assigned
              to agents when their production runtimes are connected.
            </p>

            <p className="mt-2 text-sm leading-relaxed text-os-dim">
              Future tasks will preserve ownership, status, approvals,
              dependencies and audit history.
            </p>
          </div>
        </div>
      </section>

      <section className="mt-4 grid grid-cols-3 gap-3 max-[900px]:grid-cols-1">
        <div className="rounded-lg-t border border-os-border bg-os-surface p-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-os-dim">
            Open tasks
          </div>

          <div className="mt-2 text-2xl font-semibold">
            0
          </div>
        </div>

        <div className="rounded-lg-t border border-os-border bg-os-surface p-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-os-dim">
            Waiting approval
          </div>

          <div className="mt-2 text-2xl font-semibold">
            0
          </div>
        </div>

        <div className="rounded-lg-t border border-os-border bg-os-surface p-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-os-dim">
            Completed
          </div>

          <div className="mt-2 text-2xl font-semibold">
            0
          </div>
        </div>
      </section>
    </div>
  );
}