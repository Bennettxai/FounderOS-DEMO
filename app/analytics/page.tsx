import { BarChart3 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';

export const dynamic = 'force-dynamic';

export default function AnalyticsPage() {
  return (
    <div>
      <PageHeader
        eyebrow="performance"
        title="Analytics"
      />

      <div className="mb-8 max-w-3xl">
        <p className="text-sm leading-relaxed text-os-muted">
          Company performance, portfolio results, agent KPIs and process
          quality metrics will be displayed here.
        </p>

        <p className="mt-2 text-sm leading-relaxed text-os-dim">
          Analytics starts from a clean state. No legacy business metrics are
          loaded.
        </p>
      </div>

      <section className="grid grid-cols-4 gap-3 max-[1100px]:grid-cols-2 max-[700px]:grid-cols-1">
        <div className="rounded-lg-t border border-os-border bg-os-surface p-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-os-dim">
            Portfolio performance
          </div>

          <div className="mt-2 text-2xl font-semibold">
            —
          </div>

          <div className="mt-2 text-xs text-os-dim">
            No portfolio history
          </div>
        </div>

        <div className="rounded-lg-t border border-os-border bg-os-surface p-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-os-dim">
            Agent KPIs
          </div>

          <div className="mt-2 text-2xl font-semibold">
            0
          </div>

          <div className="mt-2 text-xs text-os-dim">
            No evaluated activity
          </div>
        </div>

        <div className="rounded-lg-t border border-os-border bg-os-surface p-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-os-dim">
            Closed operations
          </div>

          <div className="mt-2 text-2xl font-semibold">
            0
          </div>

          <div className="mt-2 text-xs text-os-dim">
            No operations recorded
          </div>
        </div>

        <div className="rounded-lg-t border border-os-border bg-os-surface p-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-os-dim">
            Validated lessons
          </div>

          <div className="mt-2 text-2xl font-semibold">
            0
          </div>

          <div className="mt-2 text-xs text-os-dim">
            No learning history
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-lg-t border border-dashed border-os-border p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md-t border border-os-border bg-os-surface2">
            <BarChart3 className="h-5 w-5 text-os-muted" />
          </div>

          <div>
            <div className="text-sm font-semibold">
              No company analytics yet
            </div>

            <p className="mt-2 text-sm leading-relaxed text-os-muted">
              Metrics will be created only from activities performed by this
              company.
            </p>

            <p className="mt-2 text-sm leading-relaxed text-os-dim">
              Future analytics will include portfolio performance, risk
              outcomes, employee KPIs, process quality, errors and learning
              effectiveness.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}