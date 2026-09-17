import { Workflow } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';

export const dynamic = 'force-dynamic';

export default function WorkflowsPage() {
  return (
    <div>
      <PageHeader
        eyebrow="company processes"
        title="Workflows"
      />

      <div className="mb-8 max-w-3xl">
        <p className="text-sm leading-relaxed text-os-muted">
          Company workflows, approval paths and control-plane processes will
          be defined here.
        </p>

        <p className="mt-2 text-sm leading-relaxed text-os-dim">
          No legacy FounderOS workflows are loaded.
        </p>
      </div>

      <section className="rounded-lg-t border border-dashed border-os-border p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md-t border border-os-border bg-os-surface2">
            <Workflow className="h-5 w-5 text-os-muted" />
          </div>

          <div>
            <div className="text-sm font-semibold">
              No operational workflows yet
            </div>

            <p className="mt-2 text-sm leading-relaxed text-os-muted">
              Workflows will be introduced progressively as the company
              operating model is implemented.
            </p>

            <p className="mt-2 text-sm leading-relaxed text-os-dim">
              Future workflows will define responsibilities, permissions,
              approvals, state transitions and audit history.
            </p>
          </div>
        </div>
      </section>

      <section className="mt-4 grid grid-cols-3 gap-3 max-[900px]:grid-cols-1">
        <div className="rounded-lg-t border border-os-border bg-os-surface p-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-os-dim">
            Registered workflows
          </div>

          <div className="mt-2 text-2xl font-semibold">
            0
          </div>
        </div>

        <div className="rounded-lg-t border border-os-border bg-os-surface p-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-os-dim">
            Active workflows
          </div>

          <div className="mt-2 text-2xl font-semibold">
            0
          </div>
        </div>

        <div className="rounded-lg-t border border-os-border bg-os-surface p-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-os-dim">
            Pending approvals
          </div>

          <div className="mt-2 text-2xl font-semibold">
            0
          </div>
        </div>
      </section>
    </div>
  );
}