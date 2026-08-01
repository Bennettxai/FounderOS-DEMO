# FOUNDER OS

Personal OS / AI agent command center. Live web recreation of the FounderOS
"Conducting AI" board. Runs on port **4100** (command-center owns 4000).

## Commands

```bash
npm run dev        # dev server → http://localhost:4100
npm test           # vitest suite (must stay green)
npm run typecheck  # tsc --noEmit
npm run seed       # re-seed data/founder-os.db (idempotent)
npm run build && npm start
```

## Stack

Next.js 14 App Router (server components) + TypeScript + Tailwind +
better-sqlite3 (`data/founder-os.db`, WAL, auto-seeded on first touch) +
Zod + Vitest.

## Architecture: larp-first, real-ready

This is the load-bearing design rule. v1 looks alive because of rich seeded
data, but every page and API route reads through the repository layer — never
query SQLite directly from a page or route:

- `lib/data.ts` — `getDb()` app singleton; seeds on first touch
- `lib/db.ts` — `openDb()` + repos (`departments`, `agents`, `metrics`, `tools`, …)
- `lib/seed.ts` — all seeded content lives here
- `lib/schemas.ts` — Zod schemas validate every row on the way OUT of the DB

Swapping seeded tables for live sources (Attio, Zernio, OpenClaw, MCP status)
is a repo-level change. Keep it that way: new data = new repo method + Zod
schema + seed entry + test.

## G-Brain — ANSWERED (2026-06-11)

G-Brain = **GBrain v0.41** (`gbrain` CLI at `~/.bun/bin/gbrain`): markdown
knowledge in `~/knowledge/brain-store/` + Supabase backend ("Second Brain",
free tier — pauses on idle) + ZeroEntropy embeddings (key in
`~/.config/knowledge/config.json`). The real provider in `lib/connectors/gbrain.ts`
shells out to the CLI (`doctor --json --fast`, `query --no-expand`) and falls
back to local brain-store grep when the database is unreachable. Default
`BRAIN_PROVIDER=gbrain`; `stub` exists for tests.

## Real connectors & agents (v2)

Alex's directive: real integrations, not larp. Strict black & white theme
(UI polish deferred — he'll design it himself once everything is wired).

- `lib/connectors/` — 12 connector groups, all returning honest
  `ConnectorStatus` (never fake "connected"): `email.ts` (4 IMAP slots),
  `slack.ts`, `payments.ts` (Stripe + registry), `notion.ts`, `gbrain.ts`,
  `zernio.ts` (key from ~/.config/social/.env — LIVE), `attio.ts` (key reused
  from ~/.config/mcp.json mcpServers — LIVE), `arcads.ts` (~/Projects/
  arcads-agent-skills/.env — LIVE), `miro.ts` (knowledge/.env.agents — LIVE),
  `wispr.ts` (local flow.sqlite readonly — LIVE), `obsidian.ts` (vault fs;
  needs macOS Documents permission), `local-stack.ts` (ports 4000/3789/11434/
  18789 + tmux + brew binaries).
- `lib/creds.ts` — credential resolution: process.env first, then Alex's
  canonical files at runtime. NEVER copy secret values into this repo.
- `lib/agents/runtime.ts` + `real.ts` — agent registry; every seeded agent row
  maps 1:1 to a `RuntimeAgent` with a real `run()` (enforced by seed tests).
  Runs persist to `agent_runs`. `POST /api/agents/[id]/run`.
- `/integrations` is the live Connections board (`GET /api/connections`).
- Credentials go in `.env.local` (gitignored) — see `.env.example`. NEVER
  commit keys; never copy keys from `~/knowledge/.env.agents` into the repo.

## Views

`/` operator console (pulse row, connections strip, agent list, compact
G-Brain core) · `/comms` unified feed · `/social` Zernio growth dashboard ·
`/agents` roster with Run buttons + last-run state · `/org` hierarchy board
(operator → Conductor super agent → 5 pillars: Sales, Marketing/Growth, TECH,
Finances, Communications → worker pills; broadcast composer; markup frozen —
do not restructure) · `/brain` G-Brain knowledge core (signature `BrainViz`
rings + live `gbrain ›` query card + doctor warnings, with the original
capture / life-map / pipeline / graph / query-path sections kept underneath) ·
`/roadmap` phases + quarters · `/analytics` real connector numbers ·
`/funnel` living client-journey flow (Vantage + Launchpad Cohort: stage
columns left→right, one node per client, 4–5 touch markers per path; seeded
dummy, real-ready for Trakyo organic + Meta Ads MCP paid attribution) ·
`/reference` reference model · `/integrations` live connections board. Chrome:
fixed `Sidebar` (Operate/System groups) + sticky `Topbar` (breadcrumb + ⌘K) +
`CommandPalette` (⌘K, digit-key view jumps). API routes mirror these under
`app/api/*` — note `GET /api/brain?q=` runs a hybrid search; bare `GET` returns
provider status.

## Conventions

- TDD: failing test first, then implementation. Tests live in `tests/`,
  one file per module; use `FOUNDER_OS_DB=:memory:` pattern (see `tests/db.test.ts`).
- Zod-validate anything that crosses the DB or API boundary.
- THEME: **Monolith Signal (`mono`) is the default** (2026-07-12,
  `DEFAULT_THEME` in `lib/theme.ts`; bare `:root` in `app/globals.css` carries
  the mono tokens). "Terminal" (`dark`) — the phosphor-green command deck on
  near-black — stays as a pickable colorway. Tokens live in
  `tailwind.config.ts` (`os.*` colors) AND as raw CSS vars in
  `app/globals.css` (the brain viz SVG + `color-mix` effects need `var()`
  access; keep the two in sync). Terminal tokens: `bg #050807`, `surface
  #0a0f0c`, `border #18211b` / `border-strong #243029`, `text #e4efe6` /
  `muted #8fa295` / `dim #54665b`, `accent #3df08c` (phosphor green), honest
  status colors `ok`/`warn #ffc53d`/`err #ff6259`. G-Brain viz uses its own
  independent violet/cyan/green palette (`--brain-1/2/3`). Lettering (Monolith pass,
  2026-07-10): JetBrains Mono everywhere — `font-sans` and `font-mono` both
  resolve to `--font-mono`; Space Grotesk is retired. Page titles 25px/700
  uppercase tracking 0.06em (`PageHeader`), eyebrows 9.5px/0.32em with a `//`
  prefix, section labels 10px/700/0.26em. Square corners (radius tokens are
  0), square LED status dots (blink, no pulse ring), no emblem hover-spin,
  hairline borders, no shadows on cards, 48px grid texture on the canvas
  (mono theme flattens it). The `mono` theme is **Monolith Signal**: bare
  black `#0a0a0a`, white accent, `--hairline #1c1c1c`, and color means
  status only (`ok #2fd36f`/`warn #ffb000`/`err #ff2d3f`). Shared primitives in `components/terminal.tsx`
  (`Dot`, `Badge`, `Label`, `SectionHead`, `Kbd`, `Spark`). `/org` keeps its
  existing markup — it inherits the tokens through Tailwind classes only.
- Env vars: `FOUNDER_OS_DB`, `BRAIN_PROVIDER`, `GBRAIN_BIN`, `GBRAIN_STORE`,
  plus connector creds in `.env.local`.
- Heavy interaction-driven visualizations load via `next/dynamic`
  (`ssr: false`) behind dimension-matched skeletons (see
  `BrainGraphView`/`AudienceConsistencyLazy`; contract in
  `tests/code-splitting.test.ts`). Use `next/image` for any future raster
  images — every current visual is SVG/canvas, so nothing needed a retrofit.
- Future: migrate hosting to Alex's Mac mini (M4 Pro 24GB); Supabase stays managed.

## Multi-agent etiquette

Multiple Claude Code sessions work on this repo concurrently:

- Commit small checkpoints often (`git log --oneline` to see where others are).
- Run `npm test && npm run typecheck` before claiming anything done.
- Don't kill the dev server on 4100 — another session may be using it.
- Leave handoff notes in `docs/` if you stop mid-feature.
