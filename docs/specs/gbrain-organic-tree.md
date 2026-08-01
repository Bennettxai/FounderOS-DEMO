# G-Brain organic context tree — spec

**Goal:** When a department is selected in the G-Brain knowledge graph, it unfolds into a *natural, organically-grown* vertical tree — department at the bottom (trunk), agents as branches, tools at the top (leaves) — with diagonal ~45° curved branches instead of today's rigid 90° flat-row/straight-spoke layout, plus an immersive animated layer that makes the whole section feel alive.

## Scope
- **In:**
  - A new pure, unit-testable layout module that turns a focused department (self → dept → agents → tools) into upward-growing tree positions with branch angles capped at ~45° from vertical.
  - An organic curved-branch path helper (bezier), replacing straight focus edges.
  - Branch thickness tapering by depth (trunk thick → leaf thin).
  - Immersive animation layer in focus: branches "grow"/pulse, leaves pop in, a soft department-tinted glow behind the tree — all `prefers-reduced-motion` safe.
  - Keep the smooth, non-destructive focus transition (nodes glide; the graph is never destroyed/rebuilt).
- **Out:**
  - Changing the **unfocused** concentric graph's structure (orbital rings, ring radii, node set).
  - Any DB / Zod schema / API / seed change. No data-model change to `buildKnowledgeGraph`.
  - New npm dependencies (no d3-shape; hand-roll SVG paths).
  - Restructuring `/org`, the fullscreen explorer's chrome, or the detail-panel cards.
  - Re-introducing department heads / deterministic-layout experiments that were previously reverted.

## Acceptance criteria
- [x] **AC1 — bottom-to-top bands.** New module `lib/tree-layout.ts` exports `treeLayout(input)` returning `{ id → { x, y, depth } }` covering self, department, each agent, each tool, where depth 0=self … 3=tools and y is strictly ordered bottom-to-top: `y(tool) < y(agent) < y(dept) < y(self)`. Trunk (self + dept) is horizontally centered. Deterministic for identical input. _(tree-layout.test.ts green)_
- [x] **AC2 — diagonal ≤45° branches that actually fan.** For every parent→child branch the layout produces, the angle from vertical is `|Δx| ≤ |Δy| + ε` (never a 90° right-angle joint). A parent with ≥2 children genuinely spreads them (the outermost child of a multi-child parent has `|Δx|/|Δy| ≥ 0.2`, i.e. real diagonal lean, not a vertical stack). Single-child trunk stays vertical. _(tree-layout.test.ts green)_
- [x] **AC3 — organic curved branch path.** `lib/tree-layout.ts` exports `branchPath(a, b)` returning an SVG `d` string that starts at `a`, ends at `b`, and uses a cubic/quadratic curve command (`C`/`Q`, not a straight `L`), bowing like a real branch. Deterministic. _(tree-layout.test.ts green)_
- [x] **AC4 — focus renders the tree.** Selecting a department in `KnowledgeGraph` lays its subtree out via `treeLayout` (dept at bottom → agents → tools at top) and draws branches with `branchPath` curves instead of straight `<line>`s; branch stroke width tapers by depth (trunk thickest → leaf thinnest). Non-focus graph still draws straight edges as before. _(live: focus → 0 `<line>`, 19 curved `kg-grow` paths, tapered; unfocused → 109 `<line>`. Confirmed inline + fullscreen.)_
- [x] **AC5 — immersive layer.** In focus: branches carry an animated flowing energy pulse, leaves (tools) pop in with a scale+fade, and a soft radial glow in the department's color sits behind the tree. Every animation is disabled under `prefers-reduced-motion: reduce`. _(live: 1 glow rect, pulse paths desync'd by index, leaf halos; reduced-motion guard in injected CSS.)_
- [x] **AC7 — draggable nodes.** Any node can be grabbed and dragged with the mouse/pointer: while held it follows the cursor (fixed in the sim), the rest of the graph reacts via physics, and on release it rejoins the simulation. A drag must not be mistaken for a click (no accidental focus/selection when you drag), while a plain click still selects/focuses as before. Works in both the inline graph and the fullscreen explorer. Cursor shows a grab/grabbing affordance. _(live: dragged a node +137/−87px following the pointer, graph stayed unfocused (109 lines, 0 tree), post-drag click suppressed; plain click still focuses (19 branches). Pointer-capture wrapped in try/catch.)_
- [x] **AC8 — gentle focus transition.** Clicking a department eases into the tree instead of snapping — the reheat is softened (`alpha` 0.6→0.35) and motion is damped (`velocityDecay` 0.4→0.55) so nodes glide rather than fly. The tree still fully forms; sliders and reset still work. _(live: department click forms full tree over a soft glide; 40 test files green, build OK.)_
- [x] **AC6 — nothing sacred breaks.** Unfocused concentric graph, hover pillar-tracing (agents + tools), the three physics sliders, agent/tool wiki overlay, the fullscreen explorer with ← / → department nav, the orbital backdrop + drifting grid, and self-click reset all still work. `tests/knowledge-graph.test.ts` stays green and `npm run typecheck` + `npm run build` are clean. _(live: 3 sliders, self-click → focus cleared + 109 lines back, fullscreen rail Sales/Marketing/TECH/Finances/Comms with tree; 34 test files green, typecheck clean, build OK.)_

## Contract changes
- **New:** `lib/tree-layout.ts` — `treeLayout()`, `branchPath()`, and their input/output types. Pure, no React, no DB.
- **New:** `tests/tree-layout.test.ts`.
- **Edit:** `components/KnowledgeGraph.tsx` — replace flat-row `focusLayout` math with `treeLayout`; render focus branches as curved paths; add the immersive animation styles/elements. Props and the unfocused path unchanged.
- **No change:** `lib/knowledge-graph.ts`, `lib/schemas.ts`, `lib/db.ts`, `lib/seed.ts`, any API route, `app/brain/page.tsx`.

## Decisions (inferred, not asked)
- **Shared tools** (a tool used by several agents in one department) get a single node positioned above a deterministic *primary owner* agent; the other agents' use of it is drawn as a fainter secondary branch so the data stays honest without cluttering the trunk.
- Layout feeds the existing force simulation as glide targets (keeps the smooth, non-destructive transition the user values) rather than snapping positions.

## Test plan
- **AC1** → `tree-layout.test.ts`: assert depth assignment + strict y ordering across bands; trunk centered; same input → identical output.
- **AC2** → `tree-layout.test.ts`: for all branches assert `|Δx| ≤ |Δy| + ε`; for a fabricated multi-agent / multi-tool dept assert outermost child lean `|Δx|/|Δy| ≥ 0.2`; single child stays centered.
- **AC3** → `tree-layout.test.ts`: `branchPath` output starts at `a`, ends at `b`, contains `C`/`Q`, is deterministic.
- **AC4** → typecheck + production build green; visual check on `/brain` (and fullscreen) that a selected department shows curved diagonal branches, dept-bottom/tools-top, tapered widths.
- **AC5** → build green; visual check that branches pulse, leaves pop in, glow shows; reduced-motion verified via the media query in the injected CSS.
- **AC6** → `npm test` (existing knowledge-graph suite + full suite) green; visual regression pass on hover, sliders, wiki, fullscreen ← / →, self-click reset.

## Risks / unknowns
- Force-sim interaction: new targets must pull cleanly without jitter or nodes fighting the cone; may need to firm up target strength / damp collision in focus.
- Cone crowding if a department has many agents×tools — clamp to canvas margins; typical depts are small (2–6 agents) so low risk.
- This graph was reverted once for being "ruined" — all work must be **additive and non-destructive**: the unfocused graph and every existing interaction must be byte-for-byte intact in behavior.
- Browser/Playwright drift has been flaky here; fall back to reasoning from code + build output when the browser is unusable.

**First slice:** AC1 — the `treeLayout` bands + ordering. It's pure, fully testable, and every later criterion (angles, curves, rendering) builds on its positions, so it de-risks the rest.
