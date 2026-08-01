# Knowledge graph — humans + SOP task nodes — spec

**Goal:** The /brain knowledge graph shows the actual work: each department fans into written-out SOP task nodes, each task is done by exactly one worker (a human employee OR an AI agent — never shared, never doubled-up), and that worker's tools still hang off the end of the chain — with the focused (clicked-into) view staying spacious, not claustrophobic.

## Scope

- In:
  - New chain `Alex → department → task (SOP) → worker (human | agent) → tools`, replacing the current `department → agent → tools` chain in `lib/knowledge-graph.ts`.
  - Human employees as first-class graph nodes (new kind `person`), visually distinct from AI agents.
  - SOP task nodes carrying written-out steps; clicking a task shows its SOP (title, steps, assignee, tools) in the detail panel (inline overlay + fullscreen explorer).
  - **Monogamy invariant:** one worker ↔ one task, enforced at the data layer and by tests. Every seeded agent gets exactly one task; every seeded human gets exactly one task.
  - New DB-backed data per the architecture rule (repo + Zod + seed + test): `people` and `sop_tasks` tables.
  - 5-ring rest layout + 5-band focused tree in `lib/tree-layout.ts`, with spacing guarantees (tested minimum sibling distances) so the focused view breathes.
  - Legend, hover-lighting, and click traversal updated for the two new node kinds.
- Out:
  - `/org` board (markup frozen — untouched).
  - Any UI-polish/theme redesign beyond what the new nodes require.
  - Live SOP sync from Command Center (:4000) — future repo-level swap; seeded now.
  - Editing/CRUD for tasks or people from the UI.
  - `lib/personnel.ts` DEPARTMENT_HEADS panel behavior (kept as-is; graph people come from the new table).

## Data model

- `people` (DB table): `{ id, departmentId, name, role, tools: string[] }`. Seed 4 humans: Marco (Sales — head of sales, real), Nadia (Marketing/Growth — real), plus larp-first seeds: an EA for Comms, a bookkeeper for Finances. TECH stays all-AI (that's the story of the department).
- `sop_tasks` (DB table): `{ id, departmentId, title, summary, steps: string[] (≥3 written-out SOP steps), assigneeKind: 'agent' | 'person', assigneeId }`.
  - One task per seeded agent (27) + one per seeded human (4) ≈ 31 tasks.
  - Task title reads as the job ("Triage the four Gmail inboxes", "Close discovery calls"), steps read as an SOP checklist.
- Graph node kinds become: `self | team | task | employee | person | tool` (rings 0–4; task=2, worker=3, tool=4).
- Edge kinds: `pillar` (self→team), `sop` (team→task), `does` (task→worker), `uses` (worker→tool), `reports` (agent→agent, kept).
- Tools for humans come from `people.tools` (slugs from the same tool namespace agents use), so the chain ends in tools for everyone.

## Acceptance criteria

- [x] `people` + `sop_tasks` repos exist (`lib/db.ts`), Zod-validated on the way out (`lib/schemas.ts`), seeded idempotently (`lib/seed.ts`), with tests. (4 people: Marco/Nadia real, Mia/Dana larp-first; 31 tasks — one per worker.)
- [x] Monogamy is enforced by test: no `assigneeId` appears on more than one task, every agent id appears exactly once, every person id appears exactly once, and every task's assignee exists and belongs to the task's department. (`tests/sops.test.ts`, 10 tests.)
- [x] `buildKnowledgeGraph(agents, departments, people, tasks)` emits the new chain: every task node has exactly one incoming `sop` edge and exactly one outgoing `does` edge; workers have no direct `member` edge to their team anymore (member survives only as an unassigned-worker fallback); `uses` edges go worker→tool; person nodes appear with kind `person`. (`tests/knowledge-graph.test.ts`, 15 tests.)
- [x] Focused (clicked) department renders 5 bands — dept trunk → its tasks → each task's single worker directly above it → that worker's tools — and a layout test proves same-band siblings in **every** seeded department keep ≥ 48px separation and stay inside margins (canopy gets a de-overlap sweep). Labels stagger into two rows per band so titles stay readable. (`tests/tree-layout.test.ts`, 38 tests; verified in-browser on Sales.)
- [x] Unfocused sunburst has 5 rings (`responsiveRingR` returns 5 radii); task nodes render small (r 8) and unlabeled at rest; hover lights the full pillar chain (team→tasks→workers→tools). (Verified in-browser.)
- [x] Clicking a task opens an SOP detail card (title, assignee with human/AI badge + 1:1 tag, numbered written-out steps, tool chips) in the inline overlay AND the fullscreen explorer (`extraDetail` pass-through); clicking a person opens a human card (name, role · human, their one task, tools). (Verified in-browser: Marco + "Run discovery & close calls".)
- [x] Legend shows the new kinds (SOP tasks, Humans, AI agents) with counts; humans use `--warn` amber vs AI agents' accent so human-vs-AI reads at a glance (task→worker branch is also tinted by worker kind). (Verified in-browser.)
- [x] `npm test` and `npm run typecheck` green: 527/527 tests across 63 files, tsc clean.

## Contract changes

- `lib/schemas.ts`: `PersonSchema`, `SopTaskSchema` (+ exported types).
- `lib/db.ts`: `people` + `sopTasks` repos (`all()`), table DDL.
- `lib/seed.ts`: `PEOPLE` + `SOP_TASKS` seed arrays.
- `lib/knowledge-graph.ts`: `KGNodeKind` gains `task` | `person`; `KGEdgeKind` gains `sop` | `does` (drops `member`); `buildKnowledgeGraph` signature gains `people`, `tasks`.
- `lib/tree-layout.ts`: `DEPTH_FRAC`/`RING_FRAC` → 5 entries; `treeLayout` input becomes `{ selfId, teamId, taskIds, workerByTask, toolsByWorker, … }`; `radialRestLayout` pillars gain `taskIds`.
- `components/KnowledgeGraph.tsx` + `components/KnowledgeDetail.tsx`: CAT/EDGE_COLOR/legend entries, traversal maps, `TaskDetailCard`, `PersonDetailCard`.
- `app/brain/page.tsx`: pass `db.people.all()` + `db.sopTasks.all()` through.

## Test plan

- Data layer → new `tests/sops.test.ts`: Zod round-trip, seed idempotency, monogamy (unique assignee, full agent coverage, dept match, ≥3 steps per task, humans have ≥1 tool).
- Graph builder → extend `tests/knowledge-graph.test.ts`: chain shape, edge kinds, exactly-one `does` per task, no `member` edges, person nodes present.
- Layout → `tests/tree-layout.test.ts`: 5 bands monotonic in y, min sibling spacing ≥ 48px for the largest dept at 880×600, margin containment; rest layout returns 5 rings.
- UI → typecheck + existing smoke tests; manual visual pass on :4100 `/brain` (click each dept, click a task, click a human).

## Risks / unknowns

- Node count roughly doubles (~105 at rest). Mitigation: tiny unlabeled task nodes at rest, density-weighted sectors (already in place), tuned default physics (higher repel). If rest view still feels dense, fall back to hiding task ring at rest and showing tasks only in focus — decision deferred to visual pass.
- 5 bands in a 600px-tall canvas leaves ~110px/band; the biggest dept (6 tasks + 6 workers + tools) must not force label overlap — the spacing test guards positions, labels checked manually.
- `KnowledgeGraphFullscreen` detail panel needs the task/person cards threaded through its props; low risk but touches shared markup.
- Invented humans (EA, bookkeeper) are larp-first seeds — consistent with project convention, flagged here for Alex to rename later.

**First slice:** the data layer (`PersonSchema`/`SopTaskSchema` + repos + seed + `tests/sops.test.ts` with the monogamy invariant) — everything downstream reads from it, and the monogamy rule is the load-bearing constraint the rest of the feature must respect.
