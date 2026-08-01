# Live Attio client roster — spec

**Goal:** The Clients pillar roster shows Alex's real Attio deals when the connector is live, falling back to the seeded funnel clients when it is not, with the source labeled honestly.

## Scope
- In:
  - `attioClients()` in `lib/connectors/attio.ts`: queries `/v2/objects/deals/records/query` with the existing read-scoped key, maps deal records to roster rows (name, stage, amount, venture when derivable), defensive against unknown attribute shapes, 4s timeout, never throws.
  - `RosterClientSchema` in `lib/schemas.ts` (id, name, venture, status, amountUsd, source: 'attio' | 'funnel'); the component's `ClientLite` type unifies on it.
  - `app/brain/page.tsx`: a TTL-cached (60s) roster resolver — Attio when connected and non-empty, funnel journeys otherwise; passes `source` through.
  - `ClientRosterCard`: shows the source line ("live · Attio" vs "seeded · funnel") and renders either shape.
  - `client-roster` agent run(): reports the live Attio count and which source the pillar is currently serving.
- Out: writing to Attio, people/company objects, webhook sync, pagination past 100 deals, /funnel page changes.

## Acceptance criteria
- [x] `mapAttioDeals(records)` maps documented-shape deal JSON to validated roster rows; missing attributes degrade (record id as name, 'open' status, null amount); malformed records skipped. (`tests/attio-roster.test.ts`, 4 tests.)
- [x] `attioClients()` never throws: connected + rows / 403 error / no key / network failure all covered with fetch stubbed (4 tests).
- [x] Brain page serves Attio when live and non-empty else funnel, 60s TTL cache; card shows the source line. Browser-verified LIVE: "1 active · 99 in pipeline · live · Attio" with Alex's real deals (Sam Koerbel Tier 1 $5,000 active; Contacted/Nurture stages in pipeline; Closed Lost bucketed out of pipeline into a lost count).
- [x] `client-roster` run() reports the serving source and live deal count; 1:1 runtime test green.
- [x] Gates: typecheck 0; full suite 622/624 with the 2 known load-flakes (broadcast fan-out, home smoke) passing in isolation; affected suites 44/44.

## Contract changes
- `lib/schemas.ts`: `RosterClientSchema` + `RosterClient` type.
- `lib/connectors/attio.ts`: `mapAttioDeals`, `attioClients`.
- `components/KnowledgeDetail.tsx`: `ClientRosterCard` accepts `source`.
- `app/brain/page.tsx`: roster resolver with TTL cache.

## Test plan
- Mapper → new `tests/attio-roster.test.ts`: documented-shape fixture maps fully; missing values/currency variants degrade; malformed record skipped not thrown; Zod-validates every row.
- `attioClients` → same file, `fetch` stubbed: ok path, 403 path, timeout path, no-key path.
- Page fallback → assert resolver logic via exported helper (pure choose(source) given attio result + funnel rows).
- Live → browser: focus Clients pillar, source line present, rows render.

## Risks / unknowns
- Attio deal attribute slugs (stage/value names) are unverified against Alex's workspace; the mapper must treat every attribute as optional and the live browser check is the real proof. If his deals carry no usable name attribute, fall back to record id short-form.
- The read-scoped token 403s on list endpoints; only record queries are allowed (already the pattern in `attioStatus`).
- Currency: assume `value` holds cents or dollars ambiguously; render without decimals and note the assumption in the mapper.

**First slice:** `mapAttioDeals` + `RosterClientSchema` with the fixture tests — the mapper is the only genuinely uncertain piece, and everything else is plumbing around it.
