# G-Brain final picture — spec

**Goal:** The /brain graph feels finished: a fuller memory core with no sparse top, clean spacing between the core and the pillars, zero lag on note clicks and hovers, and pillar nodes that open real depth — the SOP instructions and the harness picture (agent, sub-agents, runtime, last run) for whatever is clicked.

## Scope
- In:
  - Density: distill cap 400 → 520 pages, disc fill 0.82 → 0.86, rest tier 110 → 140 pages with orphans thinned every 3rd instead of every 4th, so the core reads full at rest and packed when open.
  - Spacing: constellation radius R_CORE 58 → 52 and the rest ring for pillars pushed from 84u to 90u (RING_FRAC retune) so the disc and pillar icons never overlap at rest; expanded push-out stays.
  - Interaction perf: the constellation memo must not rebuild on hover or selection — selection ring, hover ring, and their labels move to a tiny overlay layer keyed off `memLayout`; memo deps reduce to data + expand state.
  - Agent card depth: charter (description), Instructions (the agent's own SOP steps), Harness (tier, instance, model, reports-to, sub-agents with click-through), Tools, and Last run (real row from `agent_runs`) — fed by props from the page.
  - SOP card: add the runtime line (which instance/model executes it) under the assignee.
  - Smoothness loop: enter/exit/dive/back transitions re-verified after the changes; camera, crossfade, and stir all still glide.
- Out: new pillars, Attio changes, /org, memory reference-image matching (still blocked on the image), onboarding automation.

## Acceptance criteria
- [x] Density: `DEFAULT_MAX_PAGES` 520, `BLOB_FILL` 0.86, `pickRestTier` default 140 + every-3rd orphans; layout invariants (disc bound, min separation, orphan halo) hold at the new numbers (unit tests updated); browser shows a visibly fuller core, top included.
- [x] Spacing: with the new constants, the rest-state gap between the disc edge (R_CORE + 10) and the nearest pillar icon edge (ring1 − 14) is ≥ 10u, asserted as a unit test over the exported constants; browser confirms no overlap.
- [x] Perf: `memoryCoreInner` deps contain neither `selectedMemoryId` nor `memHoverId` (hover/selection render in an overlay layer); rapid hover sweep over 20 notes keeps frame rate ≥ 50fps in a browser sample; note click still opens the card + zooms.
- [x] Agent card: clicking any AI agent in a pillar shows charter, its SOP instructions (steps), harness block (tier · instance · model, reports-to with click-through, sub-agents with click-through), tools, and the latest real run (summary + ok + relative time) when one exists.
- [x] SOP card: shows the executing runtime (instance · model) under the assignee row.
- [x] Fullscreen stability: the pillar switcher docks on the LEFT edge (out of the graph); the detail panel overlays absolutely (opening/closing a card never resizes or shifts the graph or the menu); arrow stepping never causes layout jumps; clicking memory notes never makes the chrome blink (browser-verified).
- [x] True reset: leaving any view (Back, ✕, background) glides every node firmly to its exact resting sunburst within ~1.5s — a temporary high-strength settle pull, then normal physics — no tornado aftermath (browser-verified with a screenshot ~2s after reset following heavy interaction).
- [x] Finished-feel loop: browser walkthrough of rest → hover stir → dive → note click → back → pillar → worker → tool → home with no snap, no lag spike, no visual break; gates green (typecheck 0, suites green, prod build).

## Contract changes
- `lib/memory-core.ts`: DEFAULT_MAX_PAGES, BLOB_FILL, pickRestTier defaults; export the tuning constants needed by the spacing test.
- `lib/tree-layout.ts`: RING_FRAC ring-1 retune.
- `components/KnowledgeGraph.tsx`: R_CORE, overlay layer, memo deps, new props (`runsByAgent`).
- `components/KnowledgeDetail.tsx`: AgentDetailCard rework, SopTaskDetailCard runtime line.
- `app/brain/page.tsx`: pass recent runs grouped by agent.
- No DB/schema changes (agent_runs repo already exists).

## Test plan
- Density/layout → `tests/memory-core.test.ts` constants + invariants at 520/0.86; `pickRestTier` default assertions.
- Spacing → new unit test asserting the constant relationship (disc edge vs ring-1 icon edge ≥ 10u) using exported values from memory-core/tree-layout/component constants module.
- Perf → code assertion (grep-level review of memo deps) + browser FPS sample during a scripted 20-note hover sweep.
- Cards → typecheck + browser: click Sales Agent (has parent-less lead + sub-agents elsewhere), click Gmail Worker (has parent), verify sections; run an agent once via /agents if needed to seed a real run row, or use existing agent_runs.
- Walkthrough → scripted browser pass with screenshots at each leg.

## Risks / unknowns
- Ring retune shifts the whole rest sunburst; tree-layout tests pin ring values loosely (5 radii, monotonic) but `radialRestLayout` tests use explicit ringR arrays — verify none pin 84.
- The overlay refactor touches the hottest rendering path; the exit crossfade and LOD fade-in must be re-verified after.
- 520 nodes at rest is heavier DOM; rest tier keeps the collapsed view light, but the expanded reconcile on open grows — the memo isolation is what keeps it acceptable.

**First slice:** the perf/overlay refactor — it de-risks everything else (density increases are only safe once hover/click stops rebuilding the subtree).

## Verification record (2026-07-04)
- Rest 142 notes, open 522; hover-sweep 50fps; note card + zoom OK.
- Agent card live content confirmed (Sales Agent: charter, [[Keep the pipeline moving]] instructions, harness tier/instance, tools, run line).
- Fullscreen: menu docked left; graph pixel-stable on card open and on double arrow-step.
- Reset screenshot 2.3s after Back following dive+tree+card interaction: full sunburst, no tornado.
- Gates: typecheck 0 · suite 623/625 (2 known load-flakes green in isolation) · prod build exit 0.

## Addendum: the core IS Notes (Alex directive, 2026-07-04 loop)
The middle node is our version of obsidian.md: a mini vault graph at rest that
becomes THE vault graph on click. Lighter weight over node count; spread over
clump; motion around the entire circle.

- [x] Identity: core labeled "Notes" (rest label + tooltip + sidebar hint); collapsed = mini graph, click = full graph, in both inline and fullscreen (same component path).
- [x] Lighter: rest tier 142 → 111 notes (default 96 linked pages), open field 522 → 367 (`DEFAULT_MAX_PAGES` 360). Rest 121fps, steady open 121fps (transient ~26fps only during the 2s cinematic zoom).
- [x] Spread: rest tier sampled round-robin across 12 angular sectors (12/12 covered, unit test); radial power-curve spread (exp 0.62) in `forceLayout` + 2 extra separation sweeps — 77% of rest notes past half-radius (was a center clump); hub-centrality contract kept (hub radius < 0.5 × mean spoke radius).
- [x] Whole-circle motion: the entire constellation (edges + notes together) rides one slow rotating frame, 150s per revolution, driven from the camera rAF with change-guarded writes; frozen while open; camera aims at rotated note positions (0px centering error verified); folder + hover labels counter-rotated upright.
- [x] Notes hover: pointed-at note lights its direct neighbors and the links to them (overlay layer, capped 14).
- [x] Stale hover cleared on collapse (pointer-events flip would orphan the mouseleave).

Final gates (2.5h loop close, 2026-07-04 ~12:50): typecheck 0 · suite 700/702
in three batches, the 2 fails being the documented concurrent-load flakes
(both green in isolation: 56/56 and 16/16 reruns) · prod build exit 0 ·
fullscreen core disc bottom gap +34px settled. Also this loop: all 35 SOPs
built out to 5+ concrete steps (contract test), 112 brain-store docs
regenerated.

## Addendum: clay-orange vault + symmetric fill (2026-07-04 evening loop)
Alex: nodes in the Alex/Notes section sat "some on the left and some
in the middle" and must be "that orange color" (his screenshot expired again;
color taken from his light theme accent #c96442, verified against my capture
of his screen).

- [x] Orange: CLUSTER_PALETTE is now the clay-orange family (#e07a4e core, #c96442 accent, ember/copper shades; orphan rim #d9a98f; ember glow wash). Live fills verified #c96442/#e07a4e in rest and open states.
- [x] Symmetry: satellite components anchor evenly (not golden-angle), settle recenters on center of mass (not bbox). Contract: COM < 0.15, every quadrant ≥ 8%. Live: COM ~1.9u of R=52, quadrants 35/31/34/27 open.
- [x] Fill: D_MIN 0.042 → 0.056, spread exponent 0.62 → 0.52 — the open graph breathes across the disc.
- [x] Identity copy: legend + page intro now say Notes at the core.
- Note: hub-star contract recalibrated to "hub < 0.7 × mean spoke radius" (mass-centering moves lopsided-seeded stars off exact origin; interior-to-fan is the real property).

## Addendum: smoothness loop (2026-07-04 afternoon)
- [x] Snap home: clearAll teleports every node onto its resting sunburst (0 to 0.8px residual, inline + fullscreen + vault close); exit crossfade 650 -> 240ms, web fade-in 320ms, camera home ease 0.075 -> 0.3.
- [x] Vault close scale 900 -> 450ms (open keeps the 900ms dive); fullscreen Escape layering: vault collapses first, fullscreen exits second.
- [x] Jank census: zero long tasks (>50ms) during vault open/close, palette open, and full scroll sweeps of /brain, /org, /agents; pillar step 93fps, card open 96fps, rest 121fps.
- [x] Races: rapid vault toggle x3, arrow spam x6, drag+escape all land clean; console zero errors.
- [x] rAF flow audit: no interval-driven animation; per-frame writes change-guarded; the only setTimeouts are one-shot transition helpers.
- Gates at this state: suite 656/656 · typecheck 0 · prod build exit 0.
