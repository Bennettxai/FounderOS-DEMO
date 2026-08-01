# Knowledge graph — Notes memory core + cinematic camera — spec

**Goal:** The center of the /brain knowledge graph is a mini Notes-style constellation of Alex's real brain-store notes ("Alex" = the memory of everything he is); clicking Alex dives the camera into that constellation and back out to the org layer, and every click anywhere in the graph moves the viewport cinematically to follow the selection.

## Scope

- In:
  - **Memory core data:** a pure `distillMemoryGraph()` that takes the full `BrainGraph` (from `buildBrainGraph(readStoreNotes())` — real markdown, wikilink edges, folder hubs, PCA `vx/vy` coords) and caps it to a readable mini constellation (~40 page nodes picked by link-degree + word count, plus their folder hubs; edges filtered to kept nodes; deterministic).
  - **Core rendering:** the single `self` dot is replaced by the constellation drawn around the self anchor (nodes at `self + (vx,vy)·R_core`, folder-tinted like Notes, wikilink edges as hairlines), still labeled **Alex**. Pillar spokes keep attaching to the core. Server-side wiring: `app/brain/page.tsx` computes the distilled graph and passes a `memory` prop.
  - **Expand/collapse:** clicking Alex toggles `coreExpanded`. Expanded = camera zoomed into the core so the constellation fills the view; memory labels become readable; memory nodes clickable → a note card (title, folder, excerpt, words/chunks) in the existing detail-panel slot. Pillars remain visible at the frame edge; clicking one exits the core straight into that department. Background/Alex click collapses.
  - **Cinematic camera:** an animated SVG `viewBox` driven by a pure `cameraRect()` target function + per-frame easing that *tracks* the live position of whatever is selected — rest → full frame; dept focus → full tree frame; selected task/worker/tool → closer frame centered on (and following) that node; core expanded → tight core frame; memory node selected → closer still. `prefers-reduced-motion` → viewBox snaps instantly.
  - Drag/click/hover keep working under any camera transform (pointer math already goes through `getScreenCTM().inverse()`).
- Out:
  - Live Notes-vault reads (`lib/connectors/obsidian.ts`) — the memory core reads brain-store via the existing gbrain path only.
  - Changing the org-layer chain (dept → task → worker → tool) or its layouts/tests from the previous spec.
  - `/org`, `BrainViz`, fullscreen explorer behavior changes beyond inheriting the camera (fullscreen reuses the same svg).
  - Editing notes, search inside the core, per-note agent drill-downs.

## Acceptance criteria

- [x] `distillMemoryGraph(graph, {maxPages})` (new `lib/memory-core.ts`) returns a capped constellation: ≤ maxPages page nodes ranked by wikilink degree then word count, all folder hubs that still have a kept member, only edges whose both endpoints are kept, coords passed through — pure, deterministic, empty-input-safe. (`tests/memory-core.test.ts`.)
- [x] `cameraRect(view, state)` in `lib/memory-core.ts` maps the camera state → a `{x,y,w,h}` viewBox rect: full frame at rest and on dept focus, 0.55·W centered+clamped on a selected node, 0.34·W on the expanded core, 0.22·W on a selected memory note; rects always stay inside the canvas; `lerpRect` converges monotonically, settles exactly, and `t=1` is the reduced-motion snap. (17 unit tests.)
- [x] The /brain graph center renders the constellation from real brain-store data instead of a plain dot: 32 memory nodes folder-tinted with wikilink hairlines, coords de-clumped by a deterministic relaxation (`spreadCoords`, tested), "Alex" label kept, pillar spokes still attach; empty/unreadable store → `memoryConstellation()` returns undefined and the old dot renders (`memoryOn` fallback). (Unit tests + browser.)
- [x] Clicking Alex expands the core: camera dives to a 299-wide frame, folder labels always on / note titles on hover (Notes-style), clicking a note opens its card (verified live on RESOLVER.md — title, folder chip, 424 words · 5 chunks, excerpt) and zooms closer (193-wide); clicking a pillar from inside exits straight into that department's tree; Alex/background click collapses. (Browser-verified; fixed a real pointer-capture bug that retargeted note clicks to the core.)
- [x] Every selection moves the camera: dept click → tree frame, worker click → glides to a 484-wide frame tracking the node live, close/clear → back to full frame; `prefers-reduced-motion` snaps via the `lerpRect` t=1 branch (unit-tested). (Browser-verified with mid-glide viewBox samples.)
- [x] Gates green: typecheck clean, 558/558 tests across 65 files, production build exit 0. (Smoke render tests got an honest 20s timeout — the / and /brain pages shell out to the gbrain CLI and distill the brain-store, legitimately exceeding vitest's 5s default under parallel load.)

## v2 polish — density, formatting, navigation (Alex feedback 2026-07-02)

- [x] Denser, finer constellation: cap raised to 110 pages AND the memory source now merges the Notes vault (Chat Archive, ~680 conversations — `readVaultNotes` in `lib/connectors/obsidian.ts`, TCC-safe, content-capped) with the brain-store; 111 nodes live in browser; dots shrunk (pages ≈1–2u, hubs 2.6u). (`tests/obsidian-notes.test.ts` + memory-core density tests.)
- [x] Text keeps one on-screen size at every camera depth: camera loop publishes `--kg-cam-k`, every label counter-scales via `fixedLabel()` — verified in browser at rest / core (k=0.34) / note zoom.
- [x] Expanded core declutters: org tasks/workers/tools dim to 0.06/edges 0.02, five pillars hold their segments at the frame edge, and 5 color-tinted `kg-ray` pathways flow from the memory to each department (browser-verified, screenshot).
- [x] `← Back` control shows for dept focus AND expanded core; clicking it glides home (browser-verified: mid-return viewBox 783-wide → settled 0 0 880 600).
- [x] Transitions continuous: CAM_EASE 0.075, mid-flight viewBox sampled on enter (479-wide) and exit (783-wide) — no snap; detail cards animate in (`kg-panel`); reduced-motion disables all of it.
- [x] Gates green: typecheck 0 errors, 577/577 tests (67 files), production build exit 0.

## v3 polish (Alex feedback 2026-07-02, second round)

- [x] Expanded core zooms out to a half-canvas frame (`ZOOM_CORE` 0.5, camera test pinned) and the constellation shrinks to r96 — clear dark space around the dot field in inline AND fullscreen.
- [x] Pillar gateways glide radially outward (×1.6 physics rest-target when `coreExpanded`) so they never overlap the notes; the sim reheats on toggle so the move is a smooth drift, not a snap.
- [x] Notes carry 12 distinct hash-assigned hues (browser-verified: 12 fills) instead of a single purple mass; folder hubs keep their folder tint.
- [x] Every note wanders slowly amongst its neighbours — per-note hash-seeded amplitude (±3.4u), period (7–14s) and phase, ease-in-out alternate; not an orbit. Reduced-motion disables it. (111 drifting nodes verified live.)
- [x] Gates: typecheck 0 errors, 590/590 tests (68 files).

## v4 polish (Alex feedback 2026-07-02, third round)

- [x] Tool canopy is one centralized shelf in the focused tree: every unique tool, evenly spaced, centered on the trunk axis, ordered by owner-x to minimize crossings (≤45° cap now applies to trunk/limb/worker hops only; layout tests updated + seeded ≥48px spacing kept).
- [x] Closing a view crossfades instead of breaking: the exiting tree skeleton is drawn from LIVE node positions (limbs ride the nodes home) while fading over 650ms, the resting web fades back in over 750ms, reheat softened to α0.16 — no detach, no jitter, and the graph settles back to the exact origin sunburst (rest targets unchanged). Reduced-motion skips the exit layer.
- [x] Memory notes are shiny silver orbs: 12 radial-gradient finishes (specular → faint tint → dark rim), neutral silvers plus faint tints of all five department colors; hover/selected gets a white ring. (160 orbs verified live with `url(#kg-shine-*)` fills.)
- [x] Denser + smaller: distill cap 160 pages, min-distance 0.13 (just under the disc-packing bound) with 300 relax iterations + bounding-box centering → the cloud fills the disc uniformly instead of knotting to one side; dots shrunk (pages ≈0.7–1.6u, hubs 2.2u).
- [x] Gates: typecheck 0 errors, 591/591 tests (68 files).

## Contract changes

- New `lib/memory-core.ts`: `distillMemoryGraph`, `MemoryGraph` type (subset of `BrainGraph`), `cameraRect`, `lerpRect`, `CameraState` type.
- `components/KnowledgeGraph.tsx`: new optional `memory?: MemoryGraph` prop; `coreExpanded` + `selectedMemoryId` state; animated `viewBox`.
- `components/KnowledgeDetail.tsx`: `MemoryNoteCard`.
- `app/brain/page.tsx`: builds `distillMemoryGraph(buildBrainGraph(readStoreNotes()))` server-side, passes `memory`.
- No DB/schema/API changes.

## Test plan

- `distillMemoryGraph` → new `tests/memory-core.test.ts`: cap respected, ranking (higher-degree page kept over lower), edge endpoints all kept, folder hubs pruned with their pages, empty input → empty graph, deterministic.
- `cameraRect`/`lerpRect` → same file: rest/dept → full rect; selected node → centered, clamped at canvas edges (corner case: node near margin); expanded core → core-centered sub-rect; lerp converges and is stable at target.
- Core render + fallback → unit test of the component's data mapping helper (memory node → screen position math) + browser pass on :4100.
- Expand/collapse + note card + pillar exit → browser pass (click Alex, click a note, click a pillar, Esc/background out).
- Camera follow → browser pass: click Sales, then a worker, then a tool, watch viewBox glide; verify `prefers-reduced-motion` path by unit-testing the snap branch of the easing helper.
- Gates → fresh typecheck / vitest / `NEXT_DIST_DIR=.next-review npm run build`.

## Risks / unknowns

- brain-store may be large (~900 pages) or unreadable on some machines — distillation caps payload (~40 nodes) and page.tsx must not crash when `readStoreNotes()` returns `[]` (fallback dot).
- Camera viewBox animation runs alongside the d3 force tick — both mutate render state per frame; throttle to one rAF (reuse `rafThrottle`) so they don't fight. Tracking a physics-drifting node means the camera target must be re-read from live sim positions each frame, not memoized.
- Memory constellation inherits the core position in the focused-tree mode (self anchor at trunk base) — must scale down there so the trunk stays readable.
- Node hit-targets while zoomed out are tiny; memory nodes only interactive when `coreExpanded` (a core-sized invisible disc is the "Alex" click target when collapsed).
- Fullscreen explorer shares the svg — camera must behave there too (same code path, verify once in browser).

**First slice:** `distillMemoryGraph` + `cameraRect`/`lerpRect` with their unit tests — every rendering and interaction decision downstream keys off these two pure functions, and they de-risk the payload-size and camera-math questions before any UI work.
