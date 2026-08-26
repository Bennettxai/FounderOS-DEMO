# NikOS

**A fork of Founder OS running as an operator console for a real local stack.**
Every number on the board is read live from a real source on this machine —
a green tile means a working capability, not seeded demo data.

This is a fork of the open-source [FounderOS-DEMO](https://github.com/Bennettxai/FounderOS-DEMO)
(Bennett Spooner's "Founder OS"), reskinned from the demo's fictional SaaS
company into **NikOS**: an operating surface for the diagnostic-map fleet, the
OpenFieldPro field-service platform, the Hermes/Brainz agent ecosystem, local
models, and research tooling.

The demo's larp-first design is kept in reverse: the seeded data is a thin
shell over the real architecture, and every connector, agent, and brain source
reports **honest status** — `connected` only when the real thing is reachable,
`not_configured`/`error` with setup guidance when it isn't.

---

## Quick start

Requires **Node 18+**.

```bash
npm install
cp .env.example .env.local   # fill in NIKOS_* paths + credentials (optional)
npm run dev                  # http://localhost:4100
```

```bash
npm test                     # vitest suite
npm run typecheck            # tsc --noEmit
```

`.env.local` is gitignored — machine-specific paths and keys never enter the
repo. The `NIKOS_*` overrides are optional: everything falls back to `~/`
defaults via `lib/nikos-paths.ts`.

---

## Architecture

```
                    NikOS (Next.js + SQLite)
                            │
              ┌─────────────┼──────────────┐
              │             │              │
        real agents     connectors     brain (nikos)
       (lib/agents/    (lib/connectors/  (lib/brain.ts)
        real.ts)        index.ts)          │
              │             │              │
              └─────────────┼──────────────┘
                            │
              reads real local sources on this machine
              ┌────────────────────────────────────────┐
              │  The-Diagnostic-Map   (canonical fleet) │
              │  ~/Brainz            (bot runs, schemas)│
              │  ~/.hermes           (skills, cron)     │
              │  OpenFieldPro        (release checklist)│
              │  ollama :11434       (local models)     │
              │  bounty-radar        (gh-authed scans)  │
              └────────────────────────────────────────┘
```

Three layers, one rule: **the UI never fabricates**. Agents run real checks,
connectors report real reachability, and the brain searches real files.

- **Agents** (`lib/agents/real.ts`) — 25 runtime agents, one `run()` each.
  Each maps 1:1 to a seeded row in `lib/seed.ts` (enforced by the "no larp"
  test). A run must finish in under a second when its source is present, and
  must never throw — missing sources fail honestly with setup instructions.
- **Connectors** (`lib/connectors/`) — each returns a `ConnectorStatus`
  (`connected` / `not_configured` / `error` + a human detail line). Registered
  in `lib/connectors/index.ts`; the home board and Connections page are driven
  by them.
- **Brain** (`lib/brain.ts`) — the `nikos` provider does deterministic local
  search over five real sources (below), no network, no CLI.

---

## The org: 7 pillars

NikOS has **seven departments** (the Conductor orchestrator agent lives in
Operations). Leads aggregate workers beneath them in the org chart.

| Pillar | dept id | Leads / workers |
|---|---|---|
| **Diagnostic Maps** | `dept-diagmaps` | Map Builder (lead) · Guided-Walk QA · Fleet Coverage |
| **Field Ops** | `dept-fieldops` | Field Ops Agent (lead) · Release Gate · Ops Data |
| **Development** | `dept-dev` | Dev Agent (lead) · Code Worker · Test Worker |
| **Research** | `dept-research` | Research Agent (lead) · Bounty Radar · Surf Research · **Data Agent** (lead) |
| **Models** | `dept-models` | Models Agent (lead) · Eval Runner · Training Run |
| **Picks** | `dept-picks` | Picks Agent (lead) · SportsClaw · TradingDesk · SysBot |
| **Operations** | `dept-ops` | Ops Agent (lead) · **Conductor** (orchestrator) · Cron Health · Drift Sentinel · GitHub Agent |

9 leads + 16 workers = **25 agents**. Every worker owns exactly one SOP
(seed `sops` block), and every agent belongs to an existing department
(enforced by `tests/seed.test.ts`).

---

## Real connectors

Five NikOS connectors read live local state; the remaining board entries are
upstream demo connectors that honestly report `not_configured` until you give
them credentials (WhatsApp, Attio, Beehiiv, Stripe, …).

| Connector | id | Reads |
|---|---|---|
| **Brainz Bots** | `brainz` | `~/Brainz/data/runs/<bot>/status.json` (run-record.v1) — bot count + health tally |
| **Hermes Cron** | `hermes-cron` | `~/.hermes/cron/jobs.json` — job tally (ok / degraded / skipped / failed) |
| **Diagnostic Maps** | `diagmap` | `The-Diagnostic-Map/Canonical/Fleet-Coverage.json` — 47 maps across 5 families; staleness via the snapshot's `sourceHash` (content-based, so a checkout touching mtimes is not "stale") |
| **Bounty Radar** | `bounty-radar` | `bounty-radar/bounty_radar.py` presence + `gh auth status` |
| **Ollama (Models)** | `ollama` | live `http://localhost:11434/api/tags` + `/api/ps` — model catalog, sizes, loaded state |
| G-Brain | `gbrain` | the brain provider's corpus (nikos, below) |
| LLM (Gateway) | `llm` | Vercel AI Gateway key presence |

The home systems count is derived from these — `6/25` means exactly six real
systems were reachable.

---

## Brain provider

`BRAIN_PROVIDER=nikos` (default in `.env.example`) selects a deterministic,
offline search provider in `lib/brain.ts` over **five sources**:

1. **Canonical fleet index** — `Fleet-Coverage.json` (model-number lookups)
2. **Diagnostic-map markdown** — reference docs under `The-Diagnostic-Map`
3. **Knowledge graph** — `.ua/knowledge-graph.json` (118 nodes)
4. **Hermes skill docs** — entry points in `~/.hermes/skills` (root `*.md` +
   `<skill>/SKILL.md`, frontmatter-aware) — *operating memory*
5. **Brainz contracts** — `~/Brainz/schemas/*.v1.json` (pick.v1,
   research-brief.v1, bot-status.v1, …) — *data contracts*

Search is exposed via `GET /api/brain?q=…`; the Doctor overview
(`/api/brain/overview`) reports corpus health checks for all five sources.
`gbrain` (shells to the installed CLI) and `stub` (for tests) remain selectable.

---

## How to add a live connector

1. **Create `lib/connectors/<name>.ts`** exporting
   `async function <name>Status(): Promise<ConnectorStatus>`. The shape
   (`lib/connectors/types.ts`) is:
   ```ts
   { id: string; name: string; kind: ConnectorKind;
     state: 'connected' | 'not_configured' | 'error';
     detail: string; meta?: Record<string, string | number> }
   ```
2. **Read config through `NIKOS_PATHS`** (`lib/nikos-paths.ts`) or a
   `NIKOS_*` env var; add the var to `.env.example`.
3. **Register it** in `lib/connectors/index.ts`:
   ```ts
   ['<id>', '<kind>', <name>Status],
   ```
   The board, home systems count, and Connections page pick it up
   automatically.
4. **Be honest.** Missing source → `not_configured` with a detail line
   telling the operator what to set up; read failure → `error`. Never return
   `connected` on a guess. Keep the check fast and non-throwing.

---

## How to add a live agent

1. **Write the `run()`** in `lib/agents/real.ts` returning
   `AgentRunResult` (`{ ok, summary, data? }`). Read real state defensively;
   finish in under a second; when the source is missing, return
   `ok: false` with setup instructions instead of throwing.
2. **Add it to the roster** — a top-level object in `realAgents`, or a worker
   inside a `lead(...)`'s workers array (workers get their `parentId` in the
   seed automatically).
3. **Add the matching seed row** in `lib/seed.ts` (agents block) with
   **exactly the same id** — the "no larp" test fails if any seeded agent
   lacks a runtime agent. The department id must exist (7 pillars above).
4. **Give it an SOP** in the seed `sops` block (every agent owns exactly one,
   5+ steps of ≥20 chars, `assigneeId` matching).
5. **Optional:** add a brain scope in `lib/brain-graph.ts`
   (`AGENT_BRAIN_SCOPES`) so the agent's knowledge-graph folders are scoped,
   and wire a tool slug if it needs one.

---

## Key files

| File | Role |
|---|---|
| `lib/nikos-paths.ts` | the single place each pillar maps to a real local path |
| `lib/agents/real.ts` | 25 runtime agents with real `run()` implementations |
| `lib/seed.ts` | departments, agents, people, tools, SOPs (reskinned for NikOS) |
| `lib/connectors/index.ts` | connector registry (`CHECKS`) |
| `lib/connectors/<name>.ts` | one connector per real system |
| `lib/brain.ts` | nikos provider: five-source local search + Doctor overview |
| `lib/brain-graph.ts` | knowledge-graph assembly + per-agent brain scopes |
| `lib/db.ts` | SQLite layer (better-sqlite3; keeps the Node runtime) |
| `tests/seed.test.ts` | the org contract: no-larp roster, pillars, SOPs |

## Conventions

- **Green means real.** Nothing in the UI is seeded to look live.
- **run() never throws** and finishes fast; connectors never fake reachability.
- **Tests pin the contract** (roster, departments, SOPs, brain scopes) — a
  reskin that breaks the org is caught by `npm test`, not at runtime.
