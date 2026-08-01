# G-Brain graph — let it dominate, inline switch, more Finances agents — spec

**Goal:** Give the knowledge graph far more of the screen by shrinking the side panel + the agent/tool wiki cards, let a focused department be switched and closed **inline** (← / → between departments + an X, no fullscreen needed), and rebalance the org so the payment-processor agents live under **Finances** — all while keeping the unfocused graph the clean geometric **perfect circle** it is now.

## Scope
- **In:**
  - Shrink the graph sidebar (Legend + Physics) — narrower + more compact — and enlarge the graph canvas so it dominates.
  - Make the wiki/detail cards (agent definition + tool/markdown explanations) more compact (font/padding/width).
  - Inline focus controls: when a department is focused (not fullscreen), show ← / → to rotate departments and an X to exit focus.
  - Seed change: move the payment-processor / financing agents from Sales → Finances (reparented to the Finances lead).
  - Keep the unfocused graph a symmetric concentric circle (shape only).
- **Out:**
  - Changing the edge styling / connections (user: "the connections are fine for now").
  - The fullscreen explorer's wheel/chrome (already done — leave it).
  - Schema/API changes, new deps.
  - Re-tuning the focused-tree layout or the floaty physics (only the agent set changes).

## Acceptance criteria
- [x] **AC1 — payment-processor agents move to Finances.** In the seed, `stripe-sales`, `processor-confirmation`, `fanbasis-sales`, and `pava-financing` have `departmentId: 'dept-finance'` and `parentId: 'payments-pulse'`. Finances ends with ≥5 agents; Sales keeps its account/deal lanes. _(seed.test.ts updated + green; full suite 339 tests pass.)_
- [x] **AC2 — graph dominates.** Sidebar narrowed (w-60 → w-44) + compacted (smaller type, tighter); graph canvas taller (580 → 680px). Legend, 3 sliders, fullscreen, help all still present. _(live: graph clearly dominates.)_
- [x] **AC3 — compact wiki cards.** `AgentDetailCard` / `ToolDetailCard` / `DeptOverviewCard` denser (smaller heading/body/section type + tighter padding); inline overlay 300 → 252px. _(live: card width 252.)_
- [x] **AC4 — inline department switch + close.** Focused inline graph shows ← / name / → / ✕; ← / → rotate departments in place (Finances → Communications confirmed), ✕ + self-click clear focus (109 lines back). _(live.)_
- [x] **AC5 — perfect circle preserved.** Unfocused graph still a symmetric concentric circle, 5 pillars evenly spaced, after the agent move. _(`radialRestLayout` tests green; live circle intact.)_
- [x] **AC6 — gates green.** typecheck clean, **44 test files / 339 tests pass**, build compiled; dev DB re-seeded → Finances shows 5 agents live (payments-pulse, stripe-sales, processor-confirmation, fanbasis-sales, pava-financing).

## Contract changes
- **Edit `lib/seed.ts`:** `departmentId` + `parentId` on the 4 moved agents. No schema change.
- **Edit `components/KnowledgeGraph.tsx`:** sidebar width/compaction + canvas height; inline focus control bar (← / → / X) replacing/augmenting the current "back to all" button; narrower inline detail overlay.
- **Edit `components/KnowledgeDetail.tsx`:** denser card typography/padding.
- **Edit/add tests:** `tests/seed.test.ts` or a new assertion for the Finances membership.
- **Re-seed:** `npm run seed` (verify it updates existing rows; if insert-only, delete `data/founder-os.db` and reseed). No change to `lib/schemas.ts`, `lib/db.ts` DDL, API routes.

## Decisions (inferred — confirm at review)
- Moved set = the standalone processors/financing: **Stripe, Processor Confirm, FanBasis, PAVA Financing**. Kept in Sales: `vantage-fanbasis` (a Vantage *account* sub-lane, not a standalone processor) and the deal/CRM lanes. Easy to move more if you want.
- Moved agents are **reparented to `payments-pulse`** (the Finances lead) so the org reads cleanly.
- Inline switch mirrors the fullscreen ← / → (same step logic); kept compact so it doesn't crowd the graph.

## Test plan
- **AC1** → unit test: `buildKnowledgeGraph(seed)` (or seed repo) → the 4 agents resolve to `team:dept-finance`; Finances member count ≥5; Sales no longer contains them.
- **AC2 / AC3 / AC4** → typecheck + build green; live on `/brain`: sidebar smaller + graph bigger; focus a dept → ← / → rotate inline, X exits; open an agent/tool → compact card.
- **AC5** → `radialRestLayout` tests green; live: unfocused graph still a symmetric circle after the move.
- **AC6** → full `npm test` + typecheck + build; re-seed and confirm Finances shows 5 agents live.

## Risks / unknowns
- Re-seed semantics: if `db.agents.insert` is insert-only, the live DB won't reflect the move without a reset — verify and reseed (tests use `:memory:` so they always see fresh seed).
- Moving agents shifts pillar sizes (Finances denser, Sales lighter) — must NOT break the symmetric circle (pillars stay evenly spaced; only sector density changes).
- A seed/runtime test may assert per-department counts or the 1:1 agent→RuntimeAgent map — update expectations, keep the runtime map intact.
- "Dominate the screen" is qualitative — make the sidebar clearly smaller + graph clearly bigger, then confirm at review.

**First slice:** AC1 — the agent move. It's pure data, unit-testable, de-risks the Finances/symmetry checks, and is independent of the UI work.
