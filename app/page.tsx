import Link from 'next/link';
import { Brain, Network, Users, Workflow } from 'lucide-react';
import { getDb } from '@/lib/data';
import { PageHeader } from '@/components/PageHeader';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  const db = getDb();

  const agents = db.agents.all();
  const departments = db.departments.all();

  const activeAgents = agents.filter((agent) => agent.status === 'active').length;

  return (
    <div>
      <PageHeader
        eyebrow="foundation"
        title="Startup"
      />

      <div className="mb-8 max-w-3xl">
        <p className="text-sm leading-relaxed text-os-muted">
          AI investment company operating system.
        </p>

        <p className="mt-2 text-sm leading-relaxed text-os-dim">
          The company is currently in foundation mode. Infrastructure,
          employees, workflows and institutional memory will be added
          progressively from a clean starting point.
        </p>
      </div>

      <section className="mb-8 grid grid-cols-3 gap-3 max-[1000px]:grid-cols-1">
        <div className="rounded-lg-t border border-os-border bg-os-surface p-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-os-dim">
            Departments
          </div>

          <div className="mt-2 text-2xl font-semibold">
            {departments.length}
          </div>
        </div>

        <div className="rounded-lg-t border border-os-border bg-os-surface p-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-os-dim">
            Registered agents
          </div>

          <div className="mt-2 text-2xl font-semibold">
            {agents.length}
          </div>
        </div>

        <div className="rounded-lg-t border border-os-border bg-os-surface p-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-os-dim">
            Production agents
          </div>

          <div className="mt-2 text-2xl font-semibold">
            {activeAgents}
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-os-dim">
          Company workspace
        </div>

        <div className="grid grid-cols-4 gap-3 max-[1100px]:grid-cols-2 max-[700px]:grid-cols-1">
          <Link
            href="/agents"
            className="hoverable rounded-lg-t border border-os-border bg-os-surface p-4"
          >
            <Users className="h-5 w-5 text-os-muted" />

            <div className="mt-4 text-sm font-semibold">
              Agents
            </div>

            <div className="mt-1 text-xs leading-relaxed text-os-dim">
              Registered AI employees and runtime status.
            </div>
          </Link>

          <Link
            href="/org"
            className="hoverable rounded-lg-t border border-os-border bg-os-surface p-4"
          >
            <Network className="h-5 w-5 text-os-muted" />

            <div className="mt-4 text-sm font-semibold">
              Organization
            </div>

            <div className="mt-1 text-xs leading-relaxed text-os-dim">
              Departments, supervisors and company structure.
            </div>
          </Link>

          <Link
            href="/workflows"
            className="hoverable rounded-lg-t border border-os-border bg-os-surface p-4"
          >
            <Workflow className="h-5 w-5 text-os-muted" />

            <div className="mt-4 text-sm font-semibold">
              Workflows
            </div>

            <div className="mt-1 text-xs leading-relaxed text-os-dim">
              Company processes and approval flows.
            </div>
          </Link>

          <Link
            href="/brain"
            className="hoverable rounded-lg-t border border-os-border bg-os-surface p-4"
          >
            <Brain className="h-5 w-5 text-os-muted" />

            <div className="mt-4 text-sm font-semibold">
              Startup Brain
            </div>

            <div className="mt-1 text-xs leading-relaxed text-os-dim">
              Institutional memory and accumulated company experience.
            </div>
          </Link>
        </div>
      </section>

      <section className="mt-8 rounded-lg-t border border-dashed border-os-border p-5">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-os-dim">
          Current state
        </div>

        <div className="mt-2 text-sm text-os-muted">
          Clean foundation. No portfolio data, market history, company
          experience or production agents have been loaded yet.
        </div>
      </section>
    </div>
  );
}