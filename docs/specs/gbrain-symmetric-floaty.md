# G-Brain symmetric · floaty · new edge styles — spec

**Goal:** Make the G-Brain knowledge graph rest in a clean **symmetric** shape (a balanced circle when idle, a balanced tree when a department is focused), move in a **floaty, non-snappy** way that gently **self-rights** — drag a node away or nudge a slider and it slowly drifts back to its resting place — and restyle the focused edges so **department→agent** is an animated **dotted** line and **agent→tool** is a **straight solid** line.

## Scope
- **In:**
  - A deterministic, symmetric resting layout for the *unfocused* graph (self centered; pillars evenly spaced; each pillar's agents/tools balanced within its sector).
  - Floaty motion everywhere: nodes ease/drift into place instead of snapping; dragged-and-released nodes drift back; slider nudges perturb then re-settle.
  - Symmetric focused tree (even fan, no random wobble), still department-bottom → tools-top, easing in floaty.
  - New focused edge styles: dept→agent = animated dotted (dashes travel dept→agent); agent→tool = straight solid; self→dept trunk stays solid.
  - Keep the three physics sliders working (they now modulate the floaty settle).
- **Out:**
  - DB / Zod / API / seed changes.
  - New npm deps.
  - Restructuring `/org`, the detail-panel cards, or the fullscreen explorer chrome.
  - The unfocused orbital backdrop + drifting grid (kept as-is).

## Acceptance criteria
- [x] **AC1 — symmetric rest layout (pure).** `lib/tree-layout.ts` exports `radialRestLayout(input)` returning positions for self (at center), every pillar (evenly spaced around ring 1), and each pillar's agents (ring 2) and tools (ring 3) spread evenly within that pillar's angular sector. Pillars are equally spaced (equal angle between consecutive pillars). The whole node set is balanced about the center (centroid within a small ε of center). Deterministic for identical input. _(tree-layout.test.ts: 7 radialRestLayout cases green.)_
- [x] **AC2 — floaty, self-righting unfocused graph.** Nodes settle onto the symmetric rest targets with gentle motion (`alphaDecay` 0.015, `velocityDecay` 0.62, soft 0.28 reheat); dragging + releasing reheats so the node drifts back; slider nudges re-settle. _(live: drag returns; sliders re-settle.)_
- [x] **AC3 — symmetric, floaty focus tree.** Balanced tree, no wobble (agent x-offsets sum ≈ 0, single height band — unit-tested), department-bottom → tools-top, floaty ease-in; agents/tools fanned wider (CONE 1.0, spacing 90) so they're readable. _(tests + live.)_
- [x] **AC4 — new focus edge styles.** department→agent = animated dotted (dashes travel dept→agent), agent→tool = straight solid, self→department = solid trunk; dash reduced-motion-guarded. _(live: 10 dotted, 8 straight, 1 trunk.)_
- [x] **AC5 — nothing regresses.** Hover, drag, wiki, fullscreen, self-click reset, orbital/grid intact; **42 test files green**, typecheck + build clean.
- [x] **AC6 — sliders all do something (follow-up).** Center force = symmetric-hold tightness (loose 203 ↔ tight 182px), Repel = ring spacing (225 ↔ 285px), Link distance = radial spread / edge length (188 ↔ 301px). _(measured live.)_
- [x] **AC7 — main view decluttered (follow-up).** Compressed rings + faint edges (tool-use edges very low opacity) + start already-symmetric (no messy fly-in) → the "huge mess" is gone. _(live: clean symmetric circle.)_
- [x] **AC8 — department wheel (follow-up).** Fullscreen ← / → spins a 2-D dial of departments; rotation follows the arrow and accumulates infinitely (0 → −72 → … → −432, never snaps back). _(live: monotonic across the wrap.)_

## Contract changes
- **Edit `lib/tree-layout.ts`:** add `radialRestLayout()` + its input/output types; set the focus-tree wobble to 0 (symmetric fan). `treeLayout`/`branchPath` signatures unchanged.
- **Edit `components/KnowledgeGraph.tsx`:** in the unfocused branch of `configure()`, pull `forceX/forceY` toward the `radialRestLayout` targets (gentle strength) for symmetry + self-righting; soften the reheat further and lower `alphaDecay` for floaty motion; restyle focused edges (depth-2 dotted-animated, depth-3 straight `<line>` solid, depth-1 solid trunk); add the dotted-flow CSS + reduced-motion guard.
- **Edit `tests/tree-layout.test.ts`:** add `radialRestLayout` (symmetry + determinism) and a focus-tree balance test.
- **No change:** `lib/knowledge-graph.ts`, schemas, db, seed, any API route, `app/brain/page.tsx`.

## Decisions (inferred — flagged for the end review)
- **dept→agent** stays a gentle **curve** but rendered dotted + animated (the "moving dotted line"); **agent→tool** becomes a **straight** solid line as requested.
- **Symmetric** = zero random wobble + even angular/fan spacing (mirror-balanced), not a perfectly rigid grid.
- **Floaty** = slow, eased transitions (low `alpha` reheat + low `alphaDecay` + gentle force strengths) so motion drifts rather than snaps — not literal perpetual motion (idle eventually settles). Confirm at review if you want it to never fully stop.
- Sliders are kept and now tune the floaty settle (center = how firmly it holds the symmetric shape; repel = spacing; link = edge length).

## Test plan
- **AC1** → `tree-layout.test.ts`: assert self at center; pillars equally spaced (equal Δangle); agents/tools fall inside their pillar's sector; centroid ≈ center; identical input → identical output.
- **AC3** → `tree-layout.test.ts`: with wobble 0, the focused agents' x-offsets about the trunk sum to ≈ 0 and tools likewise; ordering still bottom-to-top.
- **AC2 / AC4** → typecheck + build green; live on `/brain`: drag a node → it drifts back; nudge a slider → re-settles symmetric; focus a dept → dotted animated dept→agent + straight solid agent→tool, floaty ease-in.
- **AC5** → `npm test` (full suite) green; live regression on hover, sliders, drag, wiki, fullscreen ←/→, self-click reset.

## Risks / unknowns
- Mixing deterministic symmetric targets with the physics sliders + drag: must stay tunable and not fight itself (jitter). Keep target strength gentle; let charge/link add only slight life.
- This graph was reverted once for being "ruined" — keep the change **additive and reviewable**; the unfocused graph stays recognizable (a cleaner, symmetric version of today), and every existing interaction must survive.
- "Floaty" is subjective — tune low-alpha / low-alphaDecay and present for the user's review (explicitly requested).

**First slice:** AC1 — the pure `radialRestLayout`. It's deterministic, fully unit-testable, and everything else (floaty forces, self-righting, symmetry) is built on its targets.
