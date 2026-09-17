import { Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';

export const dynamic = 'force-dynamic';

export default function SkillsPage() {
  return (
    <div>
      <PageHeader
        eyebrow="capabilities"
        title="Skills"
      />

      <div className="mb-8 max-w-3xl">
        <p className="text-sm leading-relaxed text-os-muted">
          Agent capabilities, reusable procedures and specialized tools will
          be registered here.
        </p>

        <p className="mt-2 text-sm leading-relaxed text-os-dim">
          No legacy FounderOS, Claude or plugin skills are currently loaded
          into the company workspace.
        </p>
      </div>

      <section className="rounded-lg-t border border-dashed border-os-border p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md-t border border-os-border bg-os-surface2">
            <Sparkles className="h-5 w-5 text-os-muted" />
          </div>

          <div>
            <div className="text-sm font-semibold">
              No company skills yet
            </div>

            <p className="mt-2 text-sm leading-relaxed text-os-muted">
              Skills will be added progressively as agents receive production
              capabilities.
            </p>

            <p className="mt-2 text-sm leading-relaxed text-os-dim">
              Each future skill will have an explicit purpose, owner,
              permissions and version history.
            </p>
          </div>
        </div>
      </section>

      <section className="mt-4 grid grid-cols-3 gap-3 max-[900px]:grid-cols-1">
        <div className="rounded-lg-t border border-os-border bg-os-surface p-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-os-dim">
            Registered skills
          </div>

          <div className="mt-2 text-2xl font-semibold">
            0
          </div>
        </div>

        <div className="rounded-lg-t border border-os-border bg-os-surface p-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-os-dim">
            Production skills
          </div>

          <div className="mt-2 text-2xl font-semibold">
            0
          </div>
        </div>

        <div className="rounded-lg-t border border-os-border bg-os-surface p-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-os-dim">
            Shared procedures
          </div>

          <div className="mt-2 text-2xl font-semibold">
            0
          </div>
        </div>
      </section>
    </div>
  );
}