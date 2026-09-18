# STARTUP — AI Investment Company

AI-operated investment and personal portfolio management company.

Current state: Foundation Mode.

The repository is being rebuilt from FounderOS into the operating system of the investment company.

## Commands

```bash
npm run dev
npm test
npm run typecheck
npm run seed
npm run build
npm start

On Windows PowerShell use npm.cmd when required.

Current stack
Next.js 14 App Router
TypeScript
Tailwind CSS
SQLite prototype via better-sqlite3
Zod
Vitest

SQLite is temporary infrastructure. The planned operational source of truth is PostgreSQL.

Canonical company specification

The authoritative company model lives in:

company/company.yaml
company/organization.yaml
company/governance.yaml
policies/memory_policy.yaml

Application code must not silently contradict these files.

Company structure

Three departments:

Research Investments
Risk Analysis
Portfolio Monitoring & Performance

Total planned workforce: 19 AI agents.

The human CEO retains final authority.

No agent may autonomously:

buy or sell assets
deposit or withdraw funds
modify or cancel broker orders
obtain unrestricted brokerage credentials

Agents may research, analyse, propose, review and monitor.

Foundation Mode

The application currently seeds only:

3 departments
19 planned agents

No fabricated operational history, workflows, tasks, skills, market history or company performance data should be seeded.

Empty operational datasets are valid.

Control Plane

The planned Company Control Plane is deterministic infrastructure responsible for:

state transitions
permissions
approvals
scheduling
routing constraints
retries and timeouts
audit history

Core rule:

Agents propose actions. The Control Plane determines whether those actions are technically permitted.

Startup Brain

The future institutional memory system is called Startup Brain.

Cognee is the planned memory engine.

Startup Brain stores institutional experience and knowledge, including:

facts used
interpretations
assumptions
theses
decisions
outcomes
lessons
errors and corrections
process knowledge
source and tool reliability
validated SOP knowledge

Raw historical market price series do not belong in Startup Brain.

Market data should be retrieved from external providers when needed.

No legacy FounderOS G-Brain memory is part of the new company.

Internet and external research

Agents are expected to use external information when required.

Startup Brain is not their only source of information.

Agents may use:

public web research
market data providers
filings
economic data
specialist research
external opinions and analysis

External information must be evaluated rather than accepted automatically.

Data architecture

Current prototype:

SQLite

Planned production architecture:

PostgreSQL — operational source of truth
Cognee — institutional memory
MinIO / S3 — large artifacts
Langfuse + OpenTelemetry — observability
Repository conventions
Pages and routes access operational data through repository abstractions.
Validate structured boundaries with Zod.
Do not fabricate production data to make the UI look populated.
Keep tests and type checking green.
Prefer small coherent changes.
Preserve reusable infrastructure where it fits the new company.
Remove FounderOS-specific business logic rather than adapting tests to preserve it.
Git workflow

Primary development branch:

foundation/company-spec-v1

Before a checkpoint:

npm run typecheck
npm test

Do not push changes without explicit human approval.

Current product surfaces
/
/agents
/tasks
/skills
/org
/brain
/workflows
/integrations
/analytics

Legacy FounderOS product surfaces should not be reintroduced.


Poi salva con:

```text
Ctrl + S