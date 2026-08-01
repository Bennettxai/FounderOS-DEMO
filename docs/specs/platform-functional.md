# Whole-Platform Functional Pass — spec

**Goal:** Every Founder OS page renders without error, every GET API route returns valid data, every interactive control does real work or *honestly* degrades when a credential is missing — and nothing seeded is dressed up as live. Verified by tests + a per-page matrix, not by eyeballing.

## Scope
- **In:**
  - A **route smoke test** covering all 14 pages + all GET API routes (renders / 200, no throw) — the regression net.
  - Fix the one real control bug: **⌘K digit-key mapping** (`DIGIT_VIEWS` stale vs sidebar).
  - Remove/oprhan-clean **`RunAgentButton`** (rendered nowhere since chat replaced it) and any other dead component.
  - **Honesty pass**: every surface showing seeded (non-live) numbers carries a visible "sample/seeded" marker — specifically the social **DM + email-list series**. Preserve the existing honest-degradation everywhere (no fake "connected").
  - **Per-page functional matrix**: a documented confirmation that each of the 14 pages does something real (live data and/or a working control), with the gaps named.
  - Gates stay green: `typecheck && test && build`.
- **Out:**
  - Building *new* live integrations for credential-gated controls (real Zernio publish, WhatsApp send, live DM/email source). Those stay honestly-degraded; wiring them is a later per-connector spec.
  - Visual/design polish (Alex designs the theme himself).
  - Full browser/DOM interaction tests (Playwright) — manual spot-check only; server-render smoke is the automated bar.
  - Fixing the concurrent session's in-flight pages beyond *reporting* if they throw (e.g. `/content`, knowledge-graph WIP) — coordination, not this spec.

## Acceptance criteria
- [x] **C1 — Page render smoke (first slice).** A test (`tests/smoke.test.ts`) imports every `app/**/page.tsx` default export, invokes it against a `:memory:`/seeded DB, and asserts it resolves without throwing. Dynamic routes (`social/[platform]`) invoked with a real seeded param. Lists which pages it covered so new pages can't silently escape. _(Done: 15/15 green — all 14 pages render incl. the new `/content`; coverage guard asserts PAGES == discovered page.tsx set. Fixed `vitest.config.ts` to use the automatic JSX runtime — the repo had never imported a `.tsx` under test, so JSX threw "React is not defined". Full suite 449 green, typecheck + build clean.)_
- [x] **C2 — GET API smoke.** Same test (or a sibling) calls every GET handler under `app/api/**` and asserts HTTP 200 + a JSON body of the expected top-level shape. Credential-less connectors must return honest states, not 500s. _(Done: `tests/smoke-api.test.ts` 24/24 — all 23 GET routes return 200+JSON incl. live `connections`/`social/sync`; coverage guard asserts tested == discovered GET routes. Full suite 473 green.)_
- [x] **C3 — ⌘K digit keys match the sidebar.** `DIGIT_VIEWS` is derived from (or kept in lockstep with) the `Sidebar` nav order so digits 1–N map to the first N primary views in visible order. A unit test asserts every digit target is a real route and the order matches the sidebar's primary group. (Default: digits = first 9 sidebar primary items; Roadmap/Analytics/Reference/Personas reachable via ⌘K search — call out in spec review if a different mapping is wanted.) _(Done: new `lib/nav.ts` single source; Sidebar + CommandPalette both consume it; digits now 1→/ 2→/comms 3→/social 4→/content 5→/agents 6→/org 7→/brain 8→/finances 9→/integrations. `tests/nav.test.ts` 5/5; full suite 478; build ✓.)_
- [x] **C4 — No orphaned controls.** `RunAgentButton` is deleted (or re-wired into a page); a test/grep proves no component file exists that is imported nowhere. `app/api/agents/[id]/run` route is kept (cron/future) but documented as not surfaced by a button. _(Done: deleted `components/RunAgentButton.tsx`; `tests/orphans.test.ts` guards against new orphans. **Found 3 more dead components owned by the G-Brain workstream — `AgentCard`, `BrainGraph`, `LifeMap` (superseded by KnowledgeGraph / a local AgentCard) — allowlisted + flagged, NOT deleted (another session's committed code).** `/api/agents/[id]/run` kept for cron. 480 tests; build ✓.)_
- [ ] **C5 — Seeded data is labeled seeded.** Any UI showing seeded-not-live numbers shows a visible marker (badge/footnote) in the same honest spirit as connector states. Concretely: social DM total + email-list series + any metric whose source isn't live. A test asserts the marker renders when the source is seeded.
- [ ] **C6 — Credential-gated controls degrade honestly.** Comms email reply (SMTP→`mailto` fallback), WhatsApp reply (copy/handoff), social "Queue post" (queues, doesn't publish) each clearly state their mode in the UI. Verified by reading the rendered copy + any branch-logic unit test; no behavior change, just confirmed + tightened labels if vague.
- [ ] **C7 — Per-page functional matrix.** `docs/specs/platform-functional.md` (this file) gains a table: each of the 14 pages → "renders live data? has a working control? known gap?" — every row resolved to WORKS or a named, tracked gap. No page left "unknown".

## Contract changes
- **New test:** `tests/smoke.test.ts` (pages + GET routes). Possibly `tests/command-palette.test.ts` for C3.
- **Edit:** `components/CommandPalette.tsx` (`DIGIT_VIEWS` source-of-truth), likely export the nav list from `components/Sidebar.tsx` (or a shared `lib/nav.ts`) so both consume one array.
- **Delete:** `components/RunAgentButton.tsx` (if orphan-confirmed).
- **Edit:** the seeded-data components (e.g. `SocialStatStrip`/StatPopout, home DM/email tiles) to surface a "sample" marker driven by a real `source`/`seeded` flag already present in the data layer where possible.
- **No DB/schema changes expected.** If a "seeded vs live" flag is missing on a metric, add it via the repo+Zod+seed+test pattern (small).

## Test plan
- C1 → import each page module, `await Page()`, expect no throw; assert the covered-page list equals the discovered `page.tsx` set (fails when a new page is added untested).
- C2 → call each GET handler, expect `res.status === 200` and `await res.json()` has the documented key(s); assert no connector returns 500 without creds.
- C3 → unit: `DIGIT_VIEWS` equals the sidebar primary nav hrefs (first 9), every entry resolves to an existing `app/**/page.tsx`.
- C4 → grep/AST: `RunAgentButton` import count === 0 ⇒ file removed; CI-style assertion that no `components/*.tsx` is imported zero times (allowlist for intentional exports).
- C5 → render the seeded component with a seeded-source fixture ⇒ marker present; with a live-source fixture ⇒ marker absent.
- C6 → unit on the reply/publish branch logic (configured vs not) + manual copy read.
- C7 → the matrix table is filled, every row WORKS or links a tracked gap; reviewer confirms against the app.

## Risks / unknowns
- **Server-component render in vitest:** invoking an `async function Page()` catches data/throw errors but not full React reconciliation or client-component effects. Acceptable bar; note it so C1 isn't oversold. If a page needs request context (`headers()`), stub it.
- **Concurrent session WIP** in the working tree (`/content`, knowledge-graph, `tree-layout`): the smoke test may flag their half-built pages. Scope = *report*, don't fix theirs; coordinate before touching.
- **`/content` page** is new and unaudited — C1 will tell us if it even renders.
- **Seeded-vs-live flag** may not exist on every metric; adding it is small but crosses the DB boundary (repo+Zod+seed+test).
- **Heavy connector routes** (`/api/connections`) make ~14 live calls; C2 must tolerate slow/honest-error responses (generous timeout, assert honest state not success).

**First slice:** **C1 (page render smoke).** It's the smallest high-leverage step — one test that proves the *entire* platform renders (or pinpoints exactly which page throws), becomes the regression net for every later criterion, and immediately surfaces unknowns like `/content`. Everything else is safer once we know every page mounts.

---

## Review — C1–C4 PASS (2026-06-26)

Gates green: `tsc` clean · `vitest` 480/480 · `next build` ✓. Each checked criterion verified against reality:
- **C1 verified live** — injected a `throw` into `reference/page.tsx`; the smoke failed on exactly that page, then went green on revert. Real net, not a no-op. Catches sync + async page-body throws; covers all 14 pages with a discovery guard.
- **C2 verified** — all 23 GET routes return 200+JSON incl. live `connections`/`social/sync`; coverage guard real.
- **C3 verified** — `lib/nav.ts` is the single source; Sidebar + CommandPalette both consume it; digits include `/social` `/content` `/finances`; targets are real routes.
- **C4 verified** — `RunAgentButton` gone; orphan guard demonstrated RED→GREEN; allowlist sanity-checked.

Minor (non-blocking, not unchecking anything):
- **C2** — `social/sync` is an action-as-GET that does a live Zernio call + DB write; the read-smoke inherits a network dependency (writes go to the temp DB; degrades to `config-fallback` offline so still 200). Consider excluding mutating GETs from the pure-read smoke later.
- **C1** — home/integrations/analytics smokes make real connector calls (~4s, honest-degrading). Acceptable.
- No scope creep: `vitest.config` JSX-automatic and `lib/nav.ts` are necessary infra for C1/C3.

**C4 follow-up (resolved):** per Alex, the 3 dead components (`AgentCard`, `BrainGraph`, `LifeMap`) were **deleted** — confirmed imported nowhere (incl. the working tree), so zero visible/functional change. `KNOWN_ORPHANS` is now empty; the guard enforces zero dead components. (Unrelated: a foreign red appeared in the shared tree — the finances workstream's untracked `tests/bank-statements.test.ts` imports a not-yet-created `@/lib/bank-statements`. Not mine; left for that session.)

---

## Per-page functional matrix (C7 — filled during build)
| Page | Renders live data? | Working control? | Status / gap |
|---|---|---|---|
| `/` (home) | TBD | TBD | pending C1/C7 |
| `/comms` | TBD | reply (Slack live; email/WA degraded) | pending |
| `/social` | TBD | queue post (queues only) | pending |
| `/content` | TBD | TBD | **new — unaudited** |
| `/agents` | yes (runs/chat) | chat, conductor, tasks/crons | WORKS |
| `/org` | yes | broadcast composer | WORKS |
| `/brain` | yes | query/dump/graph | WORKS |
| `/finances` | TBD | CSV statement upload | pending |
| `/integrations` | yes (live connectors) | API-key set/rotate | WORKS |
| `/roadmap` | TBD | display | pending |
| `/analytics` | TBD | display | pending |
| `/reference` | yes (tools) | display | pending |
| `/personas` | seeded | stepper | pending (seeded?) |
| `/social/[platform]` | TBD | display | pending |
