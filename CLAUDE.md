# FOUNDER OS

Founder OS is a personal operating system for a one-person business: a web
command center that runs a company as a set of AI-assisted departments. This
file is the contributor guide for anyone (human or agent) working in the repo.

Runs on port **4100**.

## Commands

```bash
npm install
npm run dev        # dev server → http://localhost:4100
npm test           # vitest suite (must stay green)
npm run typecheck  # tsc --noEmit
npm run seed       # re-seed data/founder-os.db (idempotent)
npm run build && npm start
```

Node 22 is the supported runtime.

## Stack

Next.js 14 App Router (server components) + TypeScript + Tailwind +
better-sqlite3 (`data/founder-os.db`, WAL, auto-seeded on first touch) +
Zod + Vitest.

## Architecture: demo-first, real-ready

This is the load-bearing design rule. The app looks alive out of the box
because of rich seeded data, but every page and API route reads through the
repository layer. Never query SQLite directly from a page or route:

- `lib/data.ts` — `getDb()` app singleton; seeds on first touch
- `lib/db.ts` — `openDb()` + repos (`departments`, `agents`, `metrics`, `tools`, …)
- `lib/seed.ts` — all seeded content lives here
- `lib/schemas.ts` — Zod schemas validate every row on the way OUT of the DB

Swapping a seeded table for a live source is a repo-level change. Keep it that
way: new data = new repo method + Zod schema + seed entry + test.

## Connectors and agents

- `lib/connectors/` — one module per integration group (email over IMAP, chat,
  payments, CRM, knowledge, social, calendar, local services). Every connector
  returns an honest `ConnectorStatus` and never reports a fake "connected".
  With no credentials configured they degrade to a clearly-labelled
  disconnected state rather than failing the page.
- `lib/creds.ts` — credential resolution. Reads `process.env` first. Never
  commit a secret value or paste a key into the repo.
- `lib/agents/runtime.ts` + `real.ts` — the agent registry. Every seeded agent
  row maps 1:1 to a `RuntimeAgent` with a real `run()` (enforced by the seed
  tests). Runs persist to `agent_runs` via `POST /api/agents/[id]/run`.
- `/integrations` is the live connections board (`GET /api/connections`).
- Credentials go in `.env.local` (gitignored). See `.env.example`.

## Knowledge core (G-Brain)

G-Brain is the knowledge layer behind `/brain`: a markdown store on disk plus
an optional vector backend and a local embedding model. The provider in
`lib/connectors/gbrain.ts` shells out to a CLI when one is configured and falls
back to grepping the local store when the database is unreachable, so the page
degrades instead of erroring. Every brain read goes through
`lib/brain-retrieval.ts` (retrieve a pool, rerank, return the top hits) rather
than calling `provider.search()` directly; the rerank pass is optional and
fails soft. Provider selection is `BRAIN_PROVIDER`, with `stub` available for
tests.

## Views

`/` operator console (pulse row, connections strip, agent list, compact
G-Brain core) · `/comms` unified feed · `/social` growth dashboard ·
`/agents` roster with Run buttons + last-run state · `/org` hierarchy board
(operator → Conductor super agent → 5 pillars: Sales, Marketing/Growth, TECH,
Finances, Communications → worker pills; broadcast composer; markup frozen —
do not restructure) · `/brain` G-Brain knowledge core (signature `BrainViz`
rings + live `gbrain ›` query card + doctor warnings, with the original
capture / life-map / pipeline / graph / query-path sections kept underneath) ·
`/roadmap` phases + quarters · `/analytics` real connector numbers ·
`/funnel` living client-journey flow (Vantage + Launchpad Cohort: stage
columns left→right, one node per client, 4–5 touch markers per path; seeded
dummy, real-ready for organic + paid attribution) ·
`/reference` reference model · `/integrations` live connections board · `/brand-deals` sponsorship slab (Deal Journeys mould: hatched funnel, meters, drawer) · `/trading` brokerage monitor slab (sleeve line, reasoning, positions, orders, trade log, limits + Autopilot switch) · `/chats` agent chat hub · `/adpilot` + `/blueprint` · `/doctor` health checks · `/usage` token-burn board. Every screen runs the interaction layer: page-wide cursor spotlight (`PageSpotlight` in the layout, `--px/--py` on `:root` from `useLens`), `.pressable` hover lens + press sink on every control, `AsyncButton` idle→busy→done, `SlidingTabs`, slab motion (`Rise`, count-ins, drawn lines). Chrome:
fixed `Sidebar` (Operate/System groups) + sticky `Topbar` (breadcrumb + ⌘K) +
`CommandPalette` (⌘K, digit-key view jumps). API routes mirror these under
`app/api/*` — note `GET /api/brain?q=` runs a hybrid search; bare `GET` returns
provider status.

## Cohort invite (demo growth surface)

Copy + URL live once in `lib/cohort.ts` (`COHORT_URL`, `COHORT_CTA`,
`COHORT_STORAGE_KEY`) so the two placements can't drift:

- `CohortBanner` — static footer CTA, rendered in `app/layout.tsx` right after
  `{children}`, so it is the last thing on **every** view. No client JS.
- `CohortModal` — first-run welcome pop-up, home screen only, once per browser
  (`shouldShowCohortModal`; dismissal persists to localStorage). Mounted beside
  `ConductorPanel` in the layout; it gates itself on `usePathname()`.

Contract lives in `tests/cohort.test.ts`.

## Conventions

- TDD: failing test first, then implementation. Tests live in `tests/`,
  one file per module; use the `FOUNDER_OS_DB=:memory:` pattern (see
  `tests/db.test.ts`).
- Zod-validate anything that crosses the DB or API boundary.
- Never commit secrets. Credentials belong in `.env.local`, which is
  gitignored.
- `/org` markup is frozen; do not restructure it.
- THEME: **Monolith Signal (`mono`) is the default** (`DEFAULT_THEME` in
  `lib/theme.ts`; bare `:root` in `app/globals.css` carries the mono tokens).
  "Terminal" (`dark`), the phosphor-green command deck on near-black, stays as
  a pickable colorway. Tokens live in `tailwind.config.ts` (`os.*` colors) AND
  as raw CSS vars in `app/globals.css` (the brain viz SVG + `color-mix`
  effects need `var()` access; keep the two in sync). Terminal tokens: `bg
  #050807`, `surface #0a0f0c`, `border #18211b` / `border-strong #243029`,
  `text #e4efe6` / `muted #8fa295` / `dim #54665b`, `accent #3df08c` (phosphor
  green), honest status colors `ok`/`warn #ffc53d`/`err #ff6259`. G-Brain viz
  uses its own independent violet/cyan/green palette (`--brain-1/2/3`).
  Lettering: JetBrains Mono everywhere; `font-sans` and `font-mono` both
  resolve to `--font-mono`. Page titles 25px/700 uppercase tracking 0.06em
  (`PageHeader`), eyebrows 9.5px/0.32em with a `//` prefix, section labels
  10px/700/0.26em. Hairline borders, no shadows on cards, square LED status
  dots (blink, no pulse ring), 48px grid texture on the canvas (the mono theme
  flattens it). The `mono` theme is **Monolith Signal**: bare black `#0a0a0a`,
  white accent, `--hairline #1c1c1c`, and color means status only (`ok
  #2fd36f`/`warn #ffb000`/`err #ff2d3f`). Shared primitives in
  `components/terminal.tsx` (`Dot`, `Badge`, `Label`, `SectionHead`, `Kbd`,
  `Spark`). `/org` inherits the tokens through Tailwind classes only.
- Env vars: `FOUNDER_OS_DB`, `BRAIN_PROVIDER`, `GBRAIN_BIN`, `GBRAIN_STORE`,
  plus connector credentials in `.env.local`.
- Heavy interaction-driven visualizations load via `next/dynamic`
  (`ssr: false`) behind dimension-matched skeletons (see
  `BrainGraphView`/`AudienceConsistencyLazy`; contract in
  `tests/code-splitting.test.ts`). Use `next/image` for raster images; every
  current visual is SVG or canvas.

## Working alongside other sessions

Several agent or developer sessions may share this checkout:

- Commit small checkpoints often (`git log --oneline` to see where others are).
- Run `npm test && npm run typecheck` before claiming anything done.
- Don't kill a dev server on 4100; another session may be using it.
- Coordinate by surface: avoid editing a file another session has uncommitted
  changes in (`git status` shows them).
