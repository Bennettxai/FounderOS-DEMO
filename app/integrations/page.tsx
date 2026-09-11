import { Globe2, Database, Brain, Plug } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';

export const dynamic = 'force-dynamic';

export default function ConnectionsPage() {
  return (
    <div>
      <PageHeader
        eyebrow="infrastructure"
        title="Connections"
      />

      <div className="mb-8 max-w-3xl">
        <p className="text-sm leading-relaxed text-os-muted">
          External data sources, research services, APIs and company systems
          will be connected here progressively.
        </p>

        <p className="mt-2 text-sm leading-relaxed text-os-dim">
          No legacy FounderOS integrations are considered part of the company.
        </p>
      </div>

      <section className="grid grid-cols-2 gap-3 max-[900px]:grid-cols-1">
        <div className="rounded-lg-t border border-os-border bg-os-surface p-5">
          <Globe2 className="h-5 w-5 text-os-muted" />

          <div className="mt-4 text-sm font-semibold">
            Internet & Research
          </div>

          <p className="mt-2 text-xs leading-relaxed text-os-dim">
            Web search, public information, external research and third-party
            perspectives.
          </p>

          <div className="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-os-dim">
            Not connected
          </div>
        </div>

        <div className="rounded-lg-t border border-os-border bg-os-surface p-5">
          <Database className="h-5 w-5 text-os-muted" />

          <div className="mt-4 text-sm font-semibold">
            Market & Financial Data
          </div>

          <p className="mt-2 text-xs leading-relaxed text-os-dim">
            Market prices, fundamentals, filings, macroeconomic data and other
            financial information.
          </p>

          <div className="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-os-dim">
            Not connected
          </div>
        </div>

        <div className="rounded-lg-t border border-os-border bg-os-surface p-5">
          <Brain className="h-5 w-5 text-os-muted" />

          <div className="mt-4 text-sm font-semibold">
            Startup Brain
          </div>

          <p className="mt-2 text-xs leading-relaxed text-os-dim">
            Institutional memory, experience retrieval and company knowledge.
          </p>

          <div className="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-os-dim">
            Cognee not connected
          </div>
        </div>

        <div className="rounded-lg-t border border-os-border bg-os-surface p-5">
          <Plug className="h-5 w-5 text-os-muted" />

          <div className="mt-4 text-sm font-semibold">
            Operational Systems
          </div>

          <p className="mt-2 text-xs leading-relaxed text-os-dim">
            Brokers, monitoring services, storage, observability and other
            company infrastructure.
          </p>

          <div className="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-os-dim">
            Not connected
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-lg-t border border-dashed border-os-border p-5">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-os-dim">
          Connection state
        </div>

        <p className="mt-2 text-sm text-os-muted">
          Clean setup. No external services are currently registered as
          production company infrastructure.
        </p>
      </section>
    </div>
  );
}