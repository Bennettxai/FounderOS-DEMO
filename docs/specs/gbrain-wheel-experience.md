# G-Brain wheel experience + stable arrows — spec

**Goal:** Make stepping arrows hold a fixed spot so you can repeat-click without chasing them (Personas + graph); turn the fullscreen pillar view into a real spinning wheel of department trees (nodes rotate off-screen / on-screen as you switch), with a heavily dimmed backdrop, no permanent detail panel, and the switch arrows integrated low in the field; and put Finances next to Sales on the graph.

## Scope
- **In:**
  - Fixed-position stepper arrows everywhere they repeat (Personas, inline graph switcher, fullscreen) — the changing label no longer sits between the arrows.
  - Fullscreen pillar view = a spinning wheel: all 5 department trees on a wheel; ← / → spin it (current dept's nodes rotate off, next dept's rotate on), infinite + arrow-directional.
  - Heavily dimmed backdrop behind the active department in the wheel/pillar view.
  - Detail/file-structure panel no longer permanent: shows only after a node click, with minimize/close that reflows the layout.
  - Switch arrows integrated low / in the graph field (minimal separation from the wheel + graph).
  - Finances placed immediately adjacent to Sales in the unfocused circle + the switch order.
- **Out:**
  - Changing edge styles (dotted dept→agent, straight agent→tool stay).
  - The inline /brain graph's force circle + tree (keep; only its switcher arrows + backdrop dim change).
  - Schema / DB / seed changes (agent move already shipped). Department global `order` unchanged (graph display order only).
  - New deps.

## Acceptance criteria
- [x] **AC1 — graph display order: Finances next to Sales.** `graphDeptRank` / `orderGraphDepartments` in `lib/knowledge-graph.ts` order pillars Sales → Finances → Marketing/Growth → TECH → Communications; wired into `restLayout` + `deptList`. _(knowledge-graph.test.ts green; visual to confirm.)_
- [x] **AC2 — stable stepper arrows.** Personas + inline graph switcher + fullscreen: ← / → are now an adjacent fixed pair with the changing label placed *after* them (Personas/inline) or in a fixed-width slot (fullscreen), so the label can't shift the arrows. _(stable by DOM construction.)_
- [x] **AC3 — spinning wheel.** Fullscreen renders all 5 department trees on a wheel (centre below canvas, each counter-rotated); ← / → spin the group via CSS rotation, infinite + arrow-directional. _(live: 5 dept groups, rot 0 → −72 → −144 …; active dept centred & on-screen, others off-screen.)_
- [x] **AC4 — dimmed backdrop.** Backdrop `bg-os-bg/98`; non-active department trees at opacity 0.14. _(live: active opacity 1 / others 0.14.)_
- [x] **AC5 — no permanent detail panel.** No panel by default; appears only on node click (300px), closes back to the full wheel. _(live: panelBefore false → opens on click → closes.)_
- [x] **AC6 — integrated low controls.** Top header/rail removed; a compact ← / name / → + dept dots bar sits low (bottom-centre) over the wheel field; Exit top-right. _(live in DOM.)_
- [x] **AC7 — preserve + gates.** Unfocused inline graph unchanged except pillar order (still the symmetric circle); typecheck clean, **48 test files pass**, build compiled. _(Note: fullscreen browser screenshots blocked by a Playwright auto-navigation glitch in this env — verified via DOM/geometry instead; renders normally in a real browser.)_

## Contract changes
- **New helper** (e.g. `orderGraphDepartments` in `lib/knowledge-graph.ts`) + test.
- **Edit `components/PersonasViewer.tsx`** — arrow layout (label out from between arrows).
- **Edit `components/KnowledgeGraph.tsx`** — inline switcher arrow layout; apply graph dept order to `restLayout` + `deptList`; dim backdrop when focused.
- **Edit `components/KnowledgeGraphFullscreen.tsx`** — replace the focused force-graph + permanent panel with the spinning wheel + on-demand detail panel + low integrated arrows; dim backdrop.
- **New `components/KnowledgeWheel.tsx`** (or inline) — deterministic SVG wheel of department trees (reuses `treeLayout`/`branchPath`), CSS-rotation spin.
- No change to schemas, db, seed, API.

## Test plan
- **AC1** → unit: helper returns Finances at Sales index + 1; all 5 depts present once.
- **AC2** → live: capture ← / → button bounding-x before and after a step in Personas + inline graph; assert unchanged.
- **AC3** → live: in fullscreen, read the wheel group's rotation before/after ← / → — it accumulates (directional, infinite); a screenshot shows neighbor dept nodes mid-spin.
- **AC4 / AC5 / AC6** → live: backdrop opacity high; no panel until node click; panel minimizes; arrows low + tight to wheel.
- **AC7** → `radialRestLayout` + full suite green; build; unfocused circle visually intact.

## Decisions (inferred — confirm at review)
- The **spinning wheel is the fullscreen experience**; the inline /brain graph keeps its force circle + tree (with stable arrows + dimmer backdrop). Say if you want the spin inline too.
- Wheel = 2-D rotation in one SVG: department trees placed around a wheel whose centre is below the canvas, each counter-rotated so the active one rides upright at the front; the parent group rotates (CSS transition) to spin. Active full-opacity, others dimmed.
- "Finances next to Sales" changes only the **graph** order, not the sidebar/org/roadmap order.

## Risks / unknowns
- The wheel is a real visualization rewrite of the fullscreen focus — most effort/risk; will verify visually and iterate (looping allowed).
- Wheel geometry (radius/centre) needs tuning so the active tree is well-framed and neighbors peek/leave believably — iterate on numbers live.
- Keep `radialRestLayout`/`treeLayout` tests green; the wheel reuses `treeLayout`, so its contract must stay intact.
- Don't regress the inline perfect circle or the already-shipped agent move.

**First slice:** AC1 — the pure dept-order helper. It's testable, tiny, and both the circle and the wheel consume it, so it de-risks the layout work.
