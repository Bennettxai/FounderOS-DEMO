# G-Brain Knowledge Graph overhaul — spec

**Goal:** Make both G-Brain graph views (inline `/brain` + fullscreen explorer) feel noticeably better — spaced out, curved/visible connections, smoother physics, and smoother rendering — without changing the data model or redoing the wheel UX the other session just shipped.

## Scope
- **In:** node spacing/responsiveness, edge graphics (curved + visible), physics settle/transition smoothness, render-tick smoothness, fullscreen polish. Files: `lib/tree-layout.ts` (pure), `components/KnowledgeGraph.tsx`, `components/KnowledgeGraphFullscreen.tsx`, `lib/knowledge-graph.ts`.
- **Out:** Agent→Workflow→Tool relabel (separate); DB/schema/seed changes; canvas rewrite (keep SVG, optimize it); re-doing wheel UX; new node kinds. All 4 prior `gbrain-*` specs' behaviors (hover/drag/focus/wiki/fullscreen) must stay green.
- **Conventions:** TDD for pure logic (`tree-layout` math has `tests/tree-layout.test.ts`); visual/physics changes verified by **screenshot on http://localhost:4123** (rebuild deck per slice) + the existing suite staying green; one slice = one commit; reduced-motion guard preserved.
- **Multi-session:** these are the other session's recently-committed files (clean now). Each iteration: re-check `git status` for `KnowledgeGraph*.tsx`/`tree-layout.ts`; if dirty (they resumed), STOP and flag. Commit each slice immediately.

---

## Feature A — Spacing: responsive + density-aware (pure, `lib/tree-layout.ts`)
Today: `radialRestLayout` uses hardcoded `ringR=[0,110,182,245]`, equal 72° pillar sectors, `SECTOR_FILL=0.84` → ring-3 tool crowding (~40 nodes) + label overlap.

### Acceptance criteria
- [x] `radialRestLayout` accepts canvas `{width,height}` and derives ring radii via `responsiveRingR` (fractions of `min(w,h)`; keeps [0,110,182,245] at 880×600; doubles when canvas doubles). Unit-tested.
- [x] Pillar angular sectors are **density-weighted** — span ∝ node count; first pillar pinned to `startAngle` so a balanced graph is unchanged. Unit-tested (denser pillar ⇒ wider agent arc).
- [x] Crowded fixture (one pillar, 14 tools): min pairwise ring-3 distance ≥ 17px. Unit-tested.
- [x] Existing `tree-layout` tests stay green (27/27; symmetry/determinism preserved). Component wired via `responsiveRingR(W,H)`.

---

## Feature B — Connections: curved + visible
Today: unfocused edges are straight `<line>` at opacity 0.09 (`uses`) / 0.24 (others); focused `branchPath` uses fixed control ratios (0.32/0.42/0.1/0.78) → uneven curves, stepped widths (3/1.8/1.3).

### Acceptance criteria
- [x] Unfocused graph edges render as curved `<path>` via `edgeArc` (quadratic, perpendicular bow ∝ length), not straight `<line>` — component line 500; bow unit-tested.
- [x] Resting edge opacity raised: `uses` 0.2, structural 0.38 (was 0.09/0.24); hover/focus contrast preserved (lit 0.92, dimmed 0.04).
- [x] `branchPath` control offsets scale with branch length — proven by test (existing dx/dy-proportional control points; 2× length ⇒ 2× offset).
- [x] Focused branches taper trunk→leaf via `branchWidth` (monotonic 2.8/2.0/1.2), wired at all 3 depths; depth-3 leaves now curved too. Unit-tested.

---

## Feature C — Physics: smoother settle & transitions (`KnowledgeGraph.tsx`)
Today: `velocityDecay 0.62`, `alphaDecay 0.015`, drag-release reheat `alpha(0.3)` → oscillation; focus snaps (link strength→0, collide r+3→+6, targets 0.85/0.9).

### Acceptance criteria
- [x] Drag-release reheat lowered `alpha(0.3)→0.14` so a dropped node settles back without the oscillating bounce (the ambient low-alphaDecay drift is the intended "floaty" feel from the prior spec). ⚠️ *feel = Alex's eye on 4100.*
- [x] Focus transition softened — collide bump `+6→+4`, focus reheat `0.28→0.2` so entering/leaving a tree pops less. A true per-tick tween is a deferred follow-up. ⚠️ *feel = Alex's eye.*
- [x] Physics defaults overridable via optional props `repelDefault`/`linkDistDefault`/`centerDefault` (defaults 150/60/0.32 unchanged; sliders still override). Typecheck green.
- [x] No regression: 427 tests green; hover/drag/self-click/focus/fullscreen paths untouched.

---

## Feature D — Rendering smoothness (`KnowledgeGraph.tsx`)
Today: `sim.on('tick', () => setTick(...))` fires a React state update per force tick → reconciles all `<line>`/`<g>` every tick.

### Acceptance criteria
- [x] Tick→render throttled to ≤1/frame via `lib/raf-throttle.ts` (`rafThrottle`, 2 unit tests); sim's d3 physics tick freely underneath, only the React render is coalesced.
- [x] Static backdrop chrome (orbital rings) memoized via `useMemo([])` so React skips it each frame. (Moving nodes/edges can't be memoized — they animate; the rAF throttle is what bounds their re-render frequency to frame-rate.)
- [x] Suite + typecheck green (429). FPS/jank improvement is the throttle's effect on fast displays — ⚠️ *final feel = Alex's eye on 4100/4123.*

---

## Feature E — Fullscreen polish (`KnowledgeGraphFullscreen.tsx`)
Today: dept dots `2×2px` (hard to hit); detail panel hard-hidden `max-[820px]:hidden`; wheel step is abrupt.

### Acceptance criteria
- [x] Department dots: 24px hit target (was 16px w/ 8px dot); active dot 12px with color glow, inactive dims + scales up on hover.
- [x] Detail panel responsive: ≥820px side panel; below 820px reflows to a bottom-sheet (`max-h-62vh`, full-width, rounded top) instead of `hidden`.
- [x] Department step eased — color-transitioned name + animated dots; the actual department bloom eases via the Feature-C focus ramp, and A–D carry through the same graph `children`.

---

## Contract changes
- `lib/tree-layout.ts`: `radialRestLayout` signature gains canvas size + returns density-weighted sectors; new pure helpers `branchWidth(depth|t)` and length-adaptive `branchPath`. New/updated cases in `tests/tree-layout.test.ts`.
- `components/KnowledgeGraph.tsx`: optional physics-default props; edge render switches `<line>`→`<path>`; rAF tick wrapper; memoized groups.
- `components/KnowledgeGraphFullscreen.tsx`: dot sizing + responsive detail panel.
- No DB/schema/API changes.

## Test plan
- A → `tests/tree-layout.test.ts`: responsive radii scaling, density-weighted sector widths, crowded-fixture min-gap, existing symmetry/determinism.
- B → unit tests for `branchPath` length-adaptivity + `branchWidth` monotonicity; DOM/screenshot for curved visible unfocused edges.
- C → param assertions + before/after screenshots (drag-release settle, focus ramp); full suite for no-regression.
- D → unit test for the rAF/throttle helper; manual/screenshot for smoothness; typecheck + build.
- E → screenshots at wide + narrow widths.
- Every slice: `npm test` + `npm run typecheck` green, rebuild `.next-fast2`, screenshot `/brain` (+ fullscreen) on 4123.

## Risks / unknowns
- **Multi-session collision** — top risk; mitigated by re-checking git status each iteration + per-slice commits.
- Density-weighted sectors could make small pillars feel sparse — tune min/max sector clamp.
- rAF batching must not break d3's internal alpha loop (only the React render is throttled, not the sim).
- Curved unfocused edges add path math per edge — keep cheap; memoize.
- "Smoother" is partly subjective — screenshots + param diffs are the evidence; Alex is the final eye per checkpoint.

**First slice:** Feature A, criterion 1 (responsive ring radii in `radialRestLayout`) — pure, unit-testable, de-risks the spacing changes the rest of A builds on, and it's the safest place to validate the loop on these shared files.
