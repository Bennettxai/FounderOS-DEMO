# Clients pillar — spec

**Goal:** A sixth pillar "Clients" exists across G-Brain with the full chain (department, workers, written-out onboarding and servicing SOPs, tools), and focusing it shows the actual client roster.

## Scope
- In:
  - `dept-clients` department seeded (order 6) with life-area color and brain folder scopes.
  - 3 AI agents (`client-roster`, `client-onboarding`, `client-success`) with honest RuntimeAgent `run()`s, plus 1 human (`person-rae`, Account Manager, larp-first name).
  - 4 monogamous SOP tasks: keep the roster live, onboard new clients, service active clients, own the relationships (human).
  - `dept-clients` added to `GRAPH_DEPT_ORDER`; graph renders the sixth pillar with tasks, workers, tools.
  - Client roster visibility: focusing the Clients pillar shows a roster card in the detail slot listing real clients from the funnel repo (name, venture, status, amount) — Attio-ready data path.
- Out: /org restructure (markup frozen), live Attio client sync (status-honest only), client CRUD.

## Acceptance criteria
- [x] Seed: `dept-clients` + client-roster/client-onboarding/client-success agents + Rae Winters (Account Manager) + 4 SOP tasks + life area + brain scopes; monogamy suite green; pillar test updated to six.
- [x] Runtime: three real `run()`s (roster counts real funnel clients + Attio state; onboarding checks Attio/Slack/Notion rails; success checks Fathom key + Slack); 1:1 seed test green.
- [x] Graph: `GRAPH_DEPT_ORDER` = 6 (Clients rides beside Finance); pillar focuses into the tree with tasks, workers, tools (browser-verified).
- [x] Roster card: focusing Clients shows 7 active clients with amounts grouped by venture plus 7 in pipeline, from the funnel repo (browser-verified, screenshot).
- [x] Gates: typecheck 0 errors, full suite 616/616 (70 files).

## Test plan
- Extend `tests/sops.test.ts` implicitly (invariants cover new rows); update `tests/seed.test.ts` pillar list; update `tests/knowledge-graph.test.ts` GRAPH_DEPT_ORDER count; browser pass for the pillar + roster card.

**First slice:** seed + runtime (the invariants force everything else to line up).
