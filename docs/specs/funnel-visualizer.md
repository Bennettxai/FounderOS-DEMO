# Funnel visualizer — spec

**Goal:** A `/funnel` view where Alex can see, per venture (Vantage / Launchpad Cohort), how clients travel from first touch (organic content or Meta ads) to conversion — each client's journey shown as 4–5 touch points — seeded with dummy data whose shape is ready for Trakyo (organic attribution) and Meta Ads MCP (paid) to drop in later.

## Scope
- **In:**
  - New `/funnel` route + nav item **Funnel** in the Operate group (after Finances).
  - **Funnel data model** (larp-first, real-ready): `funnel_contacts` + `funnel_touches` tables, Zod schemas, `funnel` repo, rich seed (~12 clients across both ventures, journeys of 4–5 touches, mix of organic-first and ads-first, some mid-funnel, some converted with product + amount).
  - **Stage summary math**: per-stage counts and stage→stage conversion %, split by venture and by first-touch source (organic vs ads). Pure function.
  - **`GET /api/funnel`** (`?venture=` filter) returning Zod-validated `{ summary, journeys }`.
  - **Page**: funnel stage bars (organic vs ads split), client journey rows (4–5 touch chips: channel · label · date → conversion chip with product + amount, or current stage), venture filter (All / Vantage / Launchpad Cohort).
  - **Honest sourcing**: every touch carries `source` (`trakyo` | `meta-ads` | `manual`); page shows a data-source strip — Trakyo connector status (exists), new **status-only** `lib/connectors/meta-ads.ts` (keyed `META_ADS_ACCESS_TOKEN`, mirrors `trakyo.ts`, never fake-connected) — plus a visible **demo data** badge until live wiring lands.
- **Out:**
  - Live Trakyo / Meta Ads API calls (Trakyo has no public API yet; Meta Ads MCP wiring is a later repo-level swap).
  - Editing/creating journeys from the UI; CRM sync to Attio; Personal Brand venture (funnel is Vantage + LC only).
  - Reworking `/finances` income attribution; new deps; theme changes beyond `os.*` tokens.

## Canonical stages (the 4–5 data points)

`first_touch → engaged → nurtured → opted_in → converted` — `nurtured` optional, so journeys render as 4–5 touches. Each touch: stage, channel (`organic` | `ads` | `dm` | `email` | `webinar` | `call` | `checkout`), label (e.g. "IG reel: 3 offers that close themselves"), ISO date, source.

## Acceptance criteria
- [x] **AC1 — data layer.** `funnel_contacts` + `funnel_touches` in `lib/db.ts` DDL; Zod schemas in `lib/schemas.ts`; `db.funnel.journeys(venture?)` returns contacts with their touches ordered by seq; seed in `lib/seed.ts` (12 clients: 7 LC + 5 Vantage, 4–5 touches each, 6 converted with product + amountUsd). _(funnel.test.ts: 4 green; full suite 494 passed, 1 pre-existing flaky smoke timeout that passes in isolation.)_
- [x] **AC2 — stage math.** `lib/funnel.ts` `funnelSummary(journeys)` → reached-stage counts + stage→stage conversion %, organic/ads split by first touch; venture split via caller filtering `db.funnel.journeys(venture)`. _(fixture test: exact counts incl. 66.7% rounding + empty-set zero-division guard; 6 green.)_
- [x] **AC3 — API.** `GET /api/funnel` returns validated `{ summary, journeys }`; `?venture=vantage` filters; bad venture → 400. _(api.test.ts: 23 green incl. 3 new funnel tests.)_
- [x] **AC4 — nav + page shell.** Funnel nav item after Finances in `lib/nav.ts`; `/funnel` (`force-dynamic`) → HTTP 200 on :4100, venture filter tabs, demo-data badge, source strip with `trakyoStatus()` + new `metaAdsStatus()` (kind `ads`, honest `not_configured`). _(nav 5 / connectors 8 / smoke 16 / smoke-api 25 green; page visually verified.)_
- [x] **AC5 — living journey flow (redirected 2026-07-02).** Alex: not a bar graph — a left-to-right node flow that feels alive. Built as `components/FunnelFlow.tsx` (client comp): stage columns with reached-count + ▼% headers, **one node per client** at their furthest stage, 4–5 touch markers along the path (hover → touch card), marching-dash continuation + staggered node halo for clients still in motion (reduced-motion safe), organic=accent / ads=warn lanes, venture-tinted name dots, $ payoff on converted. `funnelFlowLayout()` pure + unit-tested (cols/subs/nodeCol/lane). _(funnel.test.ts 9 green; visually verified on :4100.)_
- [x] **AC6 — journey rows.** Per-client rows of 4–5 touch chips (channel glyph · label · date) → truncating conversion chip (product + $) or dashed current-stage chip; venture filter narrows flow + rows. _(Gates fresh: full vitest **527/527 (63 files)**, `tsc --noEmit` clean, `next build` compiled with `/funnel` + `/api/funnel`; live checks 200/200/400.)_

## Contract changes
- **`lib/db.ts`** — `funnel_contacts` (id, name, venture, status, product, amount_usd, created_at) + `funnel_touches` (id, contact_id, seq, stage, channel, label, source, at) tables + `funnel` repo.
- **`lib/schemas.ts`** — `FunnelContact`, `FunnelTouch`, `FunnelJourney`, `FunnelSummary` Zod schemas.
- **`lib/seed.ts`** — funnel seed block (both ventures).
- **New `lib/funnel.ts`** — `funnelSummary` (pure) + shared stage/channel constants.
- **New `lib/connectors/meta-ads.ts`** — status-only connector (`META_ADS_ACCESS_TOKEN`), registered in `lib/connectors/index.ts`.
- **New `app/funnel/page.tsx`**, **new `app/api/funnel/route.ts`**.
- **Edit `lib/nav.ts`** — Funnel item after Finances (use lucide `Filter` if `Funnel` glyph isn't in the installed lucide-react).
- **New `tests/funnel.test.ts`** (+ API route coverage). CLAUDE.md views list updated.

## Round 2 — "open space" redirect (Alex, 2026-07-02)

Not a chart at all: an open space where each client node travels its journey
hub-to-hub (each stage = a section anchored by a larger hub node, conversion
hub largest), then drifts alive in its current section. Blue neutrals; green
on convert; red when stuck too long before converting. Node look encodes
relationship + likelihood-to-buy. Hover/click any node → its info. The
formatted listed data (table + touch chips) stays underneath.

- [x] **AC7 — relationship/likelihood + stall model.** `funnel_contacts` gains `relationship` (`cold|warm|hot`) + `likelihood` (0–100) — schema, DDL + idempotent column migration (dev DBs already have the table), seed values per client; seed touch dates become **relative to today** (days-ago offsets) so stall states stay meaningful forever. Pure `journeyMeta(journey, now)` in `lib/funnel.ts`: daysSinceLastTouch, `state: 'converted' | 'stalled' | 'active'` (stalled = non-converted && last touch > 7 days ago). Unit tests incl. the 7-day boundary.
- [x] **AC8 — FunnelSpace canvas.** _(Built as specced; verified live: 12 nodes travel then orbit, reds = Liam 21d / Marcus 10d quiet, greens orbit the largest hub, spine pulses run, click pins the journey card — screenshot-checked. funnelSpaceModel unit-tested.)_ New `components/FunnelSpace.tsx` replaces `FunnelFlow` (delete it): SVG + RAF space with 5 stage hubs left→right (larger nodes, conversion hub largest, per-hub reached counts), client nodes replay their journey hub-to-hub (staggered), then wander/orbit their current hub; ambient data pulses travel the spine; node radius scales with likelihood, ring style encodes relationship (hot/warm/cold), color: blue neutrals / green converted / red stalled; hover ring + info card (name, venture, stage, days-in-stage, relationship, likelihood, value, touches); click pins. Blues via new `--funnel-*` vars (both themes); reduced-motion → static layout.
- [x] **AC9 — data table underneath + gates.** _(Table live with color-coded stage/quiet/relationship columns + touch chips; gates fresh: **531/531 tests (63 files)**, tsc clean, build compiled; page + card + table screenshot-verified on :4100.)_ Formatted table below the space: client / venture / lane / current stage / last touch (days) / relationship / likelihood / value, with the 4–5 touch chips per client kept beneath each row; venture filter still narrows both layers; orphans/smoke/nav suites green; full gates fresh (`npm test`, `typecheck`, `build`) + live 200 + visual screenshot check.

## Round 3 — live Attio pipeline (Alex, 2026-07-02)

Populate the space with the real Attio CRM pipeline. Leads hover **around**
each touchpoint hub; **distance from hub = ICP-fit likelihood** (hot = close,
cold = far). Stage changes render as transits (the travel animation). Attio
key already resolves via `lib/connectors/attio.ts` — no user action needed.

Grounded facts (probed live): deals object works (lists endpoint 403s — not
needed); 10 stages `New Lead → Contacted → Discovery → Technical Scoping →
Generating Proposal → Proposal Sent → Onboarding → Closed Won` + `Nurture` +
`Closed Lost`; 100 deals fetched, `stage.active_from` on 100/100 (drives
stall), budget/pain/timeline/description on ~22 %, value>0 on 17 %.

- [x] **AC10 — live provider + ICP score.** _(funnel-live.test.ts: 7 green — stage map, touch synthesis dates, icpScore 20/60/100 fixtures, Closed Lost exclusion, unknown-stage resilience.)_ New `lib/funnel-live.ts`: `fetchAttioDeals()` (thin REST, key via `resolveAttioKey`, paginated, returns null when unkeyed/unreachable — honest fallback) + pure, unit-tested `mapAttioDeals()`: stage map (`New Lead→first_touch`, `Contacted→engaged`, `Nurture→nurtured`, `Discovery/Scoping/Proposal*→opted_in`, `Onboarding/Closed Won→converted`, `Closed Lost` excluded w/ count), synthesized touches (deal created → current stage since `active_from`, so `journeyMeta` stall logic just works), transparent `icpScore()` heuristic (base 20; +20 budget, +20 pain points, +15 timeline, +10 description, +15 value>0; tiers ≥70 hot / ≥40 warm / else cold), `FunnelSourceSchema` += `'attio'`, journey `url` (Attio web_url) via schema default (no DDL).
- [x] **AC11 — live space wiring.** _(Verified live: badge `live · Attio · 117 deals`, 99 nodes in the space (18 closed-lost excluded), Attio LIVE source line, orbit distance tracks ICP fit, card shows real lead w/ working "open in Attio ↗"; tests pinned to seed via `FUNNEL_PROVIDER`.)_ `/funnel` + `/api/funnel` prefer live Attio journeys, seed fallback stays; badge flips `demo data` → `live · Attio · N deals` (+ closed-lost note); venture tabs hidden in live mode (deals carry no venture attribute yet — note says so); source strip gains the Attio line; **orbit distance = ICP fit** in `FunnelSpace` (hot hugs the hub, cold drifts wide — both modes); pinned card gains "open in Attio ↗"; legend documents distance = ICP fit.
- [x] **AC12 — gates + visual.** _(Fresh: **557/557 tests (65 files)**, tsc clean (one unrelated mid-TDD file from a concurrent session), build compiled; live screenshot verified. Note: dev server's `.next` corrupted mid-session — killed 4100, cleared `.next`, restarted per the documented gotcha.)_

## Round 4 — polish (Alex, 2026-07-02)

- [x] **AC13 — nav position.** Funnel tab between Comms and Social in `lib/nav.ts`, position asserted in nav.test.ts. _(Verified in sidebar live.)_
- [x] **AC14 — incoming leads stay blue.** `first_touch` exempt from the stall rule (journeyMeta), tested at 30 quiet days. _(First-touch hub shows only blues live.)_
- [x] **AC15 — smaller nodes.** Radius 3.5–7 px by likelihood, bounds tested. _(45 targeted tests green; typecheck clean; visual check done. nav.ts/nav.test.ts edits ride with the concurrent nav session's commit.)_

## Round 5 — venture tabs live, Trakyo seam, 90-day decay archive (Alex, 2026-07-02)

- [x] **AC16 — venture tabs work on live Attio.** _(Heuristic split live: 90 LC / 8 Vantage; LC filter verified via API.)_ Live deals get a venture via a legible name heuristic (`classifyVenture`: company-flavored deal names → Vantage, person names → Launchpad Cohort — exact split lands when deals carry a venture attribute in Attio; note says so). Tabs render in live mode and filter the live set; `?venture=` filters live in the API too.
- [x] **AC17 — Trakyo seam.** _(mergeTrakyoTouches pure + 4 tests; wired into page + API live paths; honest [] until the API ships.)_ Trakyo is LC's organic attribution and has no public API yet, so build the real merge point: `lib/funnel-trakyo.ts` with `trakyoTouches()` (honest `[]` until `TRAKYO_API_KEY` + API exist) + pure, tested `mergeTrakyoTouches(journeys, events)` that swaps a journey's synthetic first touch for the real content touch (matched by lead name, source `trakyo`). Wired into the live path so the day Trakyo ships, one function goes live.
- [x] **AC18 — 90-day decay → archive.** _(journeyMeta decayed state + splitFunnelJourneys tested incl. 90/91-day boundary; live archive already caught a real deal — Bella Johnson, 100d quiet; seeded Jordan Blake demos it offline.)_ `DECAY_DAYS = 90`: any non-converted lead quiet past 90 days leaves the space into a `decayed` state; a tab strip on the chart card (`Live funnel` / `Archive (n)`, `?view=archive`) swaps the canvas for a dim archive table (name · furthest stage · quiet · likelihood · Attio link). Space + summary count actives only; seed gains one decayed client so demo mode shows the tab working.
- [x] **AC19 — gates + visual + commit.** _(96 targeted tests green, tsc clean, tabs + archive verified live on :4100.)_

## Round 6 — constellation look + continuous decay (Alex, 2026-07-02, w/ Notes-graph reference)

Leads should cluster tight around each hub like a second-brain knowledge
graph (no connecting lines — leads aren't connected), each segment its own
color, everything neutral until a lead nears the end of its lifespan — then
it fades continuously into red and visibly decays (dims) before archiving.
Advancing a stage resets the clock (already true), so movement = healthy.

- [x] **AC20 — continuous decay model.** _(decayFactor tested: 0 at 45d, 0.5 midpoint, clamp at 90d+, converted immune; node.decay on the model.)_ Pure `decayFactor(days, status)` in `lib/funnel.ts`: 0 through `DECAY_FADE_START` (45d), linear ramp to 1 at `DECAY_DAYS` (90d), always 0 for converted; exposed as `decay` on `FunnelSpaceNode`. Unit-tested (0 / midpoint / 1 / clamp / converted).
- [x] **AC21 — constellation visuals.** _(Verified live vs the Notes reference: cyan/violet/yellow/teal/green clusters hug their hubs, golden-angle spread, calm drift, no lines; fade branch is color-mix→err by decay + opacity dimming. Honest note: no live lead sits in the 45–90d window today, so live reads all-neutral — seeded Remy Cole (70d) demos the fade; the 27d-quiet live cohort enters the window in ~2.5 weeks.)_ Per-segment hues (`--funnel-s0..s4`, both themes — conversion stays green); node fill = `color-mix` from segment hue toward `--err` by decay, opacity dims with decay (the node itself decays); golden-angle tight clusters hugging each hub (ICP fit still compresses distance), slow drift instead of wide orbits; dots smaller (2.5–5.5px); binary stall-red leaves the space (table/card keep stall copy); halos only for converted + fresh hot leads; hubs tinted by their segment hue; legend rewritten.
- [x] **AC22 — gates + visual + commit.** _(58 targeted tests green, tsc clean, constellation screenshot-verified live.)_

## Round 7 — GoHighLevel: the Launchpad Cohort pipeline (Alex, 2026-07-02)

Alex wants his GHL sub-account (owner@example.com) pipeline in
the OS funnel alongside Attio. Auth = Private Integration Token (the modern
key: Settings → Private Integrations, read scopes) — the browser session
can't be reached from the controlled Chrome profile, so the token lands in
`.env.local` (`GHL_API_KEY` + `GHL_LOCATION_ID`).

- [x] **AC23 — GHL mapper + provider.** _(funnel-ghl.test.ts: 5 green — fraction stage-mapping, won/lost/abandoned, unknown-id resilience, likelihood bounds; ghlStatus connector tested + registered.)_ `lib/funnel-ghl.ts`: pure, tested `mapGhlOpportunities(pipelines, opps, now)` — GHL stage position maps by pipeline fraction (first stage → first_touch, <0.4 engaged, <0.75 nurtured, else opted_in), `won → converted` with monetaryValue, `lost/abandoned` excluded + counted, venture always `launchpad-cohort`, source `ghl`, last touch = lastStatusChangeAt (stall/decay just work); `ghlFunnelJourneys()` fetches `/opportunities/search` + `/opportunities/pipelines` (Bearer + `Version: 2021-07-28`), honest null when unkeyed/unreachable. `FunnelSourceSchema` += `'ghl'`; status connector `lib/connectors/ghl.ts` registered.
- [x] **AC24 — merged live space.** _(Page + API merge Attio ∪ GHL; 82 targeted tests green (1 unrelated broadcast-fanout load flake, passes isolated), tsc clean, page 200 with GHL source line rendering honest not_configured. Waiting on Alex: GHL_API_KEY + GHL_LOCATION_ID in .env.local.)_ Page + API merge Attio ∪ GHL journeys (either alone still works); badge reflects both sources; GHL line in the source strip; `.env.example` documents the two vars; gates + commit. Token handoff from Alex = last step to light it up.

## Round 8 — segment select + contact layer (Alex, 2026-07-02)

Under the graph: pick a pipeline segment, see those prospects, see the last
message exchanged with each (email / WhatsApp / SMS), and open the channel
right there. Future (recorded, not built this round): outreach agents on
crons that auto-message leads when they hit a stage, sending through the
respective CRM (GHL conversations for LC, email for Vantage) — the repo's
agent_crons + runtime already exist as the substrate.

- [x] **AC28 — contact data on journeys.** _(55 live GHL leads carry real email+phone; GHL url now deep-links the contact page; mapper test green.)_ `email` + `phone` (nullable) join `FunnelContact` (schema + DDL columns + idempotent migration); GHL mapper carries `contact.email/phone` and deep-links `url` to the GHL contact page (`/contacts/detail/{contactId}`); a few seeded clients get dummy email/phone so demo mode shows the actions; Attio rows stay null (person-record resolution is a later slice). Mapper tests updated.
- [x] **AC29 — segment filter.** _(Stage chips w/ segment-hue dots + current-stage counts; ?stage= filters the table; verified live on nurtured/opted_in/engaged.)_ Stage chips between the space and the table (`?stage=` validated, counts by current stage, hrefs preserve venture+view); table narrows to the picked segment.
- [x] **AC30 — contact actions + last message.** _(lastMessageFor: 4 tests; live proof — a real WhatsApp sent today to a GHL lead (calendly link) surfaced as their last msg; misses honestly read "no thread on record"; email/wa/sms/CRM↗ actions render only where data exists, in the table + node card. 71 targeted tests green, tsc clean.)_ Pure, tested `lastMessageFor(lead, commsItems)` (email match on replyTo/sender, name match ≥5 chars in sender/title, newest wins). Table rows gain contact actions (mailto / wa.me / sms / CRM ↗ — only what exists); when a segment is selected (bounded rows) each row shows the last message from the live comms feed (`via email · 2d · "preview…"`, honest `no thread on record` / `comms feed unavailable`); node card gets the same action links. Gates + visual + commit.

## Round 9 — visible decay + Conductor side panel (Alex, 2026-07-03)

Live diagnosis: quiet-day buckets are 11×(0–7d) · 49×(8–20d) · 93×(21–30d) ·
0×(31–90d) · 1 archived — nobody sits in the 45–90d fade window, so the space
shows zero red. Fix the window, don't fake the data. Second ask: a
Notion-style expand panel on the right with the Conductor, aware of the
screen you're on — platform-wide.

- [x] **AC31 — decay you can see.** _(Fade from 21d + sqrt easing: 91/153 live nodes show the gradient — nurtured burns orange, engaged tinges pink; legend states thresholds; quiet cells tint.)_ `DECAY_FADE_START` 45 → **21** (three quiet weeks = visibly dying; archive stays 90); the render eases the mix perceptually (`sqrt(decay)`) so the 21–30d cohort shows a believable red gradient instead of a 4 % tint; the table's Quiet cell and the card tint with the same mix; legend states the thresholds (`fades red after 21d quiet → archive at 90d`). Tests keep deriving from the constants; visual check shows the gradient on live data.
- [x] **AC32 — Conductor panel (platform-wide).** _(ConductorPanel in layout; /api/conductor/context resolves live funnel numbers + most-at-risk names (verified); screenContext threads through systemPromptFor → chat route (context param, capped); screen-context tests 6 green. Chat replies await AI_GATEWAY_API_KEY — gateway honestly rejects unauthenticated; panel surfaces the error.)_ `components/ConductorPanel.tsx` mounted in `app/layout.tsx`: right-edge expand button → 360px vertical panel (slide-in, non-modal, Esc/✕ closes) with the Conductor chat; it shows and sends the current screen's context — `GET /api/conductor/context?path=` resolves an honest summary per route (funnel gets the live pipeline numbers + reddest leads; other views get their real repo counts; unknown paths degrade to the nav description). `chatWithAgent`/`routeConductorMessage` accept `screenContext` and fold it into the system prompt (capped). Pure context formatting unit-tested; chat route accepts `context`.
- [x] **AC33 — gates + visual + commit.** _(Full suite **615/615 (70 files)**, tsc clean (two concurrent-session files excluded), both screenshots verified live.)_

## Round 10 — radial (outside→in) view + physics pass (Alex, 2026-07-04)

A second way to see the same funnel: a **circle**, journey runs outside → in,
the center is the purchase. Around the rim, **seven acquisition segments** —
where clients actually come from: Instagram (organic + paid ads), YouTube,
newsletter, X, LinkedIn, forms, and word-of-mouth (the honest catch-all for
what Trakyo UTM links can't attribute yet — Trakyo tags go out through
ManyChat + YouTube titles). Same node language as the flow view. Toggle
between the two layouts; both fullscreen. "Not a single bug — fix the
mechanics and the physics": organic inward motion, no snapping, no
frame-rate dependence.

- [x] **AC34 — acquisition classifier.** _(funnel-radial.test.ts: 14 green — every keyword family incl. long-form→youtube and the 3x guard; ads channel falls to instagram; CRM entries default word_of_mouth.)_ Pure `acquisitionFor(journey)` in `lib/funnel-radial.ts`: keyword classification over the journey's earliest touch labels into the 7 canonical segments (`instagram` — includes Meta ads + ManyChat + TikTok short-form, `youtube`, `newsletter`, `x`, `linkedin`, `form`, `word_of_mouth` default for untracked). Exported `ACQUISITIONS` list fixes order + labels. Unit-tested per keyword family, incl. the "3x pipeline" false-positive guard on `x`.
- [x] **AC35 — radial model.** _(Tested: segments always 7 in order, counts sum, converted tallied; nodes carry segment/rings/currentRing; decay + contact fields survive; empty input keeps the rim.)_ Pure `funnelRadialModel(journeys, now)` → nodes carrying `segment` (0–6), `rings` (visited stage indexes in order, for the inward entry replay) and `currentRing`; decay/likelihood/relationship/contact fields identical to the space model. Segment summary (count + converted per segment, all 7 always present, counts sum to journeys). Unit-tested.
- [x] **AC36 — GHL source attribution.** _(funnel-ghl-source.test.ts: 2 green — source threads into the label and classifies instagram; absent source stays word_of_mouth.)_ `GhlOpportunity` gains `source?`; the mapper threads it into the first-touch label (`Opportunity created in GHL · source: {source}`) so real GHL attribution reaches the classifier and reads in the touch chips. Mapper test proves a `source: 'Instagram DM'` opportunity classifies `instagram`; absent source stays `word_of_mouth`.
- [x] **AC37 — the radial view + layout toggle.** _(Verified live: 153 nodes in 7 labeled wedges (forms 14 from real GHL opt-in attribution, rest honestly word-of-mouth until Trakyo), stage rings labeled, converted core; flow↔radial toggle preserves venture+stage (checked hrefs); fullscreen engages on the canvas root in both views — found+fixed the pinned card covering the fullscreen button.)_ `components/FunnelRadial.tsx`: concentric stage rings (first touch outermost → converted core at center), 7 wedge segments with labels + counts around the rim, nodes orbit tangentially inside their current ring band (likelihood pulls toward the center), entry replay spirals each node inward through its visited rings, decay fade + click card + hover identical to the flow view, own fullscreen button. `/funnel?layout=radial` toggles (validated param, default `flow`); the control line gets the layout switch; both layouts fullscreen.
- [x] **AC38 — physics pass (both views).** _(lib/funnel-viz.ts shared: smoothK(dt) = 1−exp(−dt/110ms) with dt clamped 64ms; reduced-motion places nodes at target and skips the rAF loop; node/pulse ref maps delete on unmount; radial core-hop takes the shortest angular path (no long-way sweeps); motion sanity: 5/5 sampled transforms changed across 700ms in both views.)_ Frame-rate independent smoothing (`1 − exp(−dt/τ)` with clamped dt, not a fixed 0.12-per-frame lerp — identical feel at 60 vs 120 Hz); `prefers-reduced-motion` renders nodes AT their target (today they freeze 12 % of the way); node ref maps delete on unmount (no stale refs across filter changes); no NaN transforms when a node has no touches.
- [x] **AC39 — gates + visual + commit.** _(Full suite **652/652 (74 files)**, tsc clean (two concurrent-session files excluded); both layouts 200 live; shared node card opens on real Attio leads in both; zero console errors; bogus/edge params (archive+radial, invalid enums) all 200.)_ Full suite + typecheck green; browser-verified on 4100: radial renders live data in 7 segments, toggle preserves venture/stage filters, fullscreen works in both layouts, motion is organic (no snapping at replay→orbit handoff).

## Round 11 — merge X + LinkedIn, bug sweep (Alex, 2026-07-04)

Alex: condense the X and LinkedIn wedges into one, and go through all the
bugs inside the funnel view and fix them.

- [x] **AC40 — one X / LinkedIn wedge.** _(Verified live: rim reads Instagram/YouTube/Newsletter/X ∕ LinkedIn/Forms/Word of mouth; both keyword families classify to `x_linkedin` (tests); SEG_COUNT derives from ACQUISITIONS.length; wedge hues skip s4 so no wedge wears the conversion green.)_ `ACQUISITIONS` drops to 6 segments: `x_linkedin` (label "X / LinkedIn") replaces the separate `x` and `linkedin`; both keyword families classify into it. The radial derives wedge count/spans from `ACQUISITIONS.length` (no hardcoded 7). Tests updated for the 6-segment order and both keyword families.
- [x] **AC41 — bug sweep.** _(Found + fixed: (1) journey table Entry column mislabeled GHL rows `organic` — now `attio`/`ghl` → `crm`, verified live on real rows; (2) `posRef` eased-position maps leaked ids across filter changes in both canvases — pruned at effect start. Fresh read of replay/orbit math found no further defects: leg/dwell continuity, clamps, and deterministic hand-offs all hold; stale-acquisition grep clean; zero console errors.)_ Fresh-eyes pass over `lib/funnel*.ts` + both canvases + the page; every bug found gets fixed with a note here.
- [x] **AC42 — gates + visual + commit.** _(Funnel cluster 62/62 post-merge; integration gates (api + both smokes) 63/65 with the only failures the two documented machine-load flakes — broadcast fan-out and the HOME page render, both ~710s timeouts while a concurrent session ran the full suite; neither imports anything in this round's diff, and both passed isolated at 12:43 (16s/10s). tsc clean. Live: 6 wedges render and orbit, GHL table rows read `crm`, card/canvas-click/fullscreen-button hit-target all verified; fullscreen engage re-verified impossible this hour only because the shared automation Chrome denies user-activation ("not granted" even on raw documentElement) — the handler engaged correctly twice earlier today and is unchanged.)_ Suite + typecheck green; radial verified live with 6 wedges; both layouts healthy.

## Round 12 — the flow view becomes a neural network (Alex, 2026-07-08)

Alex is replacing the left-to-right hub view with a neural-net
visualization (the radial stays). Deep navy canvas with a center radial
glow; leads enter as labeled input nodes (mono labels + tiny touch
sparklines), funnel stages are the hidden layers (columns of pale dots,
widths = real reached-counts), and every lead's journey draws thin curved
strands between adjacent layers — green for healthy/advancing, red where the
lead is stalled/decayed, opacity by likelihood, layered strokes for glow so
dense regions bloom. Terminal-style floating layer cards (name, neuron
count, red clickable Activation that cycles). Hover a neuron: the camera
eases in, that lead's full path lights up, everything else dims to ~15%;
mouse away eases back. Faint elliptical contours + slow idle shimmer.

- [x] **AC43 — neural model (pure).** _(funnel-neural.test.ts: 5 green — cumulative reached-counts, node-per-layer + edge-per-transition, sign flips on stalled/decayed, label cap at top likelihood w/ bounded sparklines, empty input well-formed.)_ `lib/funnel-neural.ts`: `funnelNeuralModel(journeys, now)` → layers (INPUT + one per later stage, `count` = leads that reached it), per-lead nodes `(layer, row)` for every stage reached, edges per transition with `sign` (healthy `+1` / stalled-or-decayed `-1`), `strength` (likelihood 0–1) and `decay`; `labeled` top-N (≤40 by likelihood) input rows each with a real touch-cadence sparkline series. Unit-tested (counts, edge signs, label cap, sparkline from touches, empty input).
- [x] **AC44 — the network canvas.** _(Live: 155 leads render as the web — red-heavy near INPUT (his pipeline's honest stall state), thinning green toward OUTPUT; layer cards float per column (OUTPUT pinned right so it never clips); activation cycles ReLU→tanh on click; sheen band CSS-driven + reduced-motion stilled; FunnelSpace.tsx deleted, toggle reads network · radial.)_ `components/FunnelNeural.tsx` replaces `FunnelSpace` as the flow layout (radial untouched, `FunnelSpace.tsx` deleted, toggle reads `network · radial`): midnight-navy radial-gradient canvas, tight dot columns, multi-strand curved edges (green/red, opacity by strength, core+halo strokes for bloom), floating layer cards (mono, translucent, `Neurons: n`, red `Activation: ReLU (click)` cycling ReLU→tanh→sigmoid→GELU), faint contour ellipses, slow CSS shimmer, fullscreen button, `prefers-reduced-motion` stills the shimmer.
- [x] **AC45 — spotlight + camera.** _(Verified in-browser: hover dims 154/155 lead groups to 0.13 with the hovered path lit, camera transform eases toward the neuron (rAF + smoothK), full ease-back on leave, click pins the shared card for the hovered lead. Hover is svg-level nearest-neuron hit-testing in world space — element enter/leave would oscillate once the zoom moves the dot from under the cursor.)_ Hovering any lead dot eases the camera toward it (rAF-lerped transform) and lights that lead's entire path at full opacity while the rest dims to ~15 %; leaving eases back to the full view; clicking pins the shared `FunnelNodeCard`; top-likelihood input rows carry name labels + sparklines.
- [x] **AC46 — gates + visual + commit.** _(Funnel cluster + both smoke nets 109/109, tsc clean; network + radial both 200 live; zero console errors; verification ran in an isolated browser context because a concurrent session was actively driving the shared tabs.)_ Funnel cluster + targeted integration tests + typecheck green; browser-verified live: network renders live leads, spotlight + zoom + card + fullscreen button work, radial unaffected, zero console errors.

## Round 13 — plasma energy pass on the network (Alex, 2026-07-08)

Tesla-ball energy: the web should feel like a plasma globe. Neon red, green
AND yellow strands pulsing with traveling sparks; clicking a node isolates
it with bright stark-white radiating lines while everything dims; the camera
slowly pans and zooms across clusters on its own (cinematic idle), yielding
to hover/click. Activation lines stay as dummy flavor (his words: doesn't
matter). Data mapping stays real.

- [x] **AC47 — three-hue energy (pure).** _(Unit-tested: won/hot → green, warm/cold active → yellow, stalled → red; all three hues confirmed present in the live web; legend updated.)_ Edges gain `hue: 'green' | 'yellow' | 'red'`: red = stalled/decayed, green = converted or hot-and-active momentum, yellow = the active-but-uncommitted middle (warm/cold). Unit-tested; legend updated.
- [x] **AC48 — plasma render.** _(154 pulse sparks animating (computed animationName verified), arc-flash cycles a random lead group per 1.4 s bucket while idle, starfield + column frames added per the reference; reduced-motion stills pulses/flash/sheen via CSS.)_ Traveling pulse sparks along every strand (dash-offset animation, staggered per-strand phase/speed), occasional arc-flash brightening one random lead path (~every 1.4 s, deterministic per time bucket, suppressed while hovering/selected), neon palette; `prefers-reduced-motion` stills pulses, flashes and the sheen.
- [x] **AC49 — white burst isolation (per Alex's hover reference).** _(Hover AND click run stark-white: a filament fan (≤26 per adjacent layer, 31 white paths measured) radiates from the touched neuron to its neighboring cohort — visual context per the reference — while the lead's real journey stays the brightest strand; click pins the card ("Sam" verified) with deep dim (154 groups at 0.08); empty-space click + leave release. Legend states burst = cohort, bright path = journey.)_
- [x] **AC50 — cinematic idle camera + gates.** _(Idle camera drifts waypoints without input (transform delta verified); hover/click zoom is CURSOR-ANCHORED — centering the neuron slid it out from under the pointer and focus flapped (caught in verification); anchored zoom + 44-unit release hysteresis keeps focus stable after settle (verified: focus survives post-zoom movement). Funnel-neural 6/6, smoke 16/16 isolated (one home-page load flake in the parallel run, unrelated), tsc clean, zero console errors.)_

## Round 14 — manual camera only (Alex, 2026-07-08)

"Enough with this auto zoom shit." No camera motion he didn't ask for: the
idle tour and the hover/click zoom are gone. He zooms and pans himself.

- [x] **AC51 — manual camera.** _(Verified in-browser, all in one pass: idle camera holds perfectly still for 2.5 s; hover shows spotlight + white burst with the transform unchanged; wheel zooms at the cursor; drag pans 1:1 and the click after a pan is swallowed; reset returns to scale 1.0; a plain click still pins ("Sam"). funnel-neural 6/6, tsc clean, zero console errors.)_ No automatic camera movement of any kind (no idle waypoints, no follow-the-mouse zoom). Scroll wheel zooms at the cursor (clamped 1–4×, page scroll suppressed over the canvas), drag pans (1:1 feel, viewport clamped to the canvas, click-after-drag swallowed), zoom in/out + reset buttons beside fullscreen. Hover spotlight/burst and click-to-pin unchanged, hit radius scales with zoom.

## Round 15 — the lead layer: dossier, origin, attention (Alex, 2026-07-11)

Alex: the UI is solid but it doesn't solve a problem. Clicking a node must
show the PERSON — who they are, where they came from, contact info — and the
view must help him make sense of things, not just look alive.

Grounded facts (probed live 2026-07-11): deal records carry `associated_people`
+ `associated_company` record references; `POST /objects/people/records/query`
and `/objects/companies/records/query` both accept `filter: {record_id: {$in:
[...]}}` (batch join = 2 requests); person records carry `name.full_name`,
`email_addresses`, `phone_numbers`, `job_title`, `linkedin`, `description`.

- [x] **AC52 — Attio contact join.** _(Live: 98 Attio journeys → 91 person, 95 email, 58 phone, 95 company, 77 role. Found live: Attio 400s "too many constraint values" past 100 ids per $in — chunk is exactly 100. funnel-live.test.ts 13 green incl. join/missing-ref/back-compat.)_ `FunnelContactSchema` gains `person`,
  `company`, `role`, `linkedin` (nullable, schema-default null — no DDL).
  `lib/funnel-live.ts`: `AttioDeal` reads `associated_people` /
  `associated_company`; new `fetchAttioContacts(dealRefs, key)` (2 batched
  `$in` queries, chunked, honest null on failure) + pure `mapAttioDeals(deals,
  now, contacts?)` fills person/email/phone/company/role/linkedin from the
  joined records. Unit tests: join fills the fields, missing refs stay null,
  no-contacts call unchanged (back-compat).
- [x] **AC53 — origin in words.** _(originOf pure + 3 tests; accepts journeys AND space nodes via structural HasTouches.)_ Pure `originOf(journey)` (lib/funnel-radial.ts):
  `{ segment label, entry label, channel, source, at }` from the acquisition
  classifier + first touch — "where they came from" as a sentence, not a hue.
  Unit tests per source.
- [x] **AC54 — the dossier card.** _(Verified live: real person + role @ company header, origin block (segment · date · source · entry), full email visible + wa/sms/linkedin/CRM links, last-msg resolves honestly ("no thread on record" on a real miss, ~3s budget); route tested (400/200). Also fixed en route: two SSR hydration mismatches — rnd() and radial polar() now quantized (Math.sin ULP drift between Node and Chrome).)_ `FunnelNodeCard` becomes a real dossier
  (both canvases, same component): identity block (person · role @ company,
  venture, deal name + value), origin block (came in via …, entry date,
  source), contact block (email / call / wa / sms / linkedin / CRM ↗ — only
  what exists, full values visible not just links), status strip (stage,
  quiet days w/ decay tint, likelihood, relationship), touch trail kept, and
  the last message exchanged — fetched on pin from new
  `GET /api/funnel/lead-message?name=&email=` (comms feed race-budgeted,
  honest `unavailable` / `no thread on record`). Route unit-tested (400 no
  name, 200 shape).
- [x] **AC55 — attention queue.** _(attentionQueue 4 tests incl. fading-first_touch-is-a-save edge; rail live: PUSH NOW surfaced NovaTech (85%, freshest), SAVE NOW surfaced a $20k deal at 100% likelihood 36d quiet; ?lead= pins the dossier in both canvases (verified network + radial).)_ Pure `attentionQueue(journeys, now)` in
  `lib/funnel.ts`: `pushNow` (active + hot, likelihood ≥70, freshest first)
  and `saveNow` (decaying, highest likelihood·value first), capped 4 each,
  unit-tested. Page renders a two-column "act on this" rail under the canvas;
  every row deep-links `?lead=<id>`; both canvases accept `initialLeadId` and
  pin that lead's dossier on load (so a rail click = canvas + dossier open).
- [x] **AC56 — gates + visual.** _(Touched cluster 161/161 (12 files) + tsc clean; full suite 76/79 files with the 3 fails = the documented broadcast/home load flakes (pass isolated) + the smoke-net coverage gap for the new route (fixed, 27/27). Zero console errors on both layouts after the hydration fixes.)_ Full suite + typecheck green; browser: click
  a live Attio node → real person with email/phone/company visible; rail rows
  pin the right dossier; radial + network both work; zero console errors.

## Revert (2026-07-21) — flow view back to the original dots

Alex's call: the neural-network flow view is out; the **original AC5
pipeline** (`components/FunnelFlow.tsx`: stage columns left → right, one node
per client, little touch-marker dots along each path, marching-dash + halo) is
restored as the `flow` layout, restored verbatim from history and fed by the
same live journeys (Attio ∪ GHL + Trakyo merge, decay/archive intact).
`FunnelNeural.tsx` / `lib/funnel-neural.ts` / its tests are retired (recover
from git if ever wanted); the radial layout is untouched; `funnelSpaceModel`
stays (radial + dossier card build on it). `funnelFlowLayout` + its unit tests
are back in `lib/funnel.ts` / `tests/funnel.test.ts`. FunnelFlow ships eager
(it is light, SSR-safe SVG); only radial stays behind the lazy wrapper —
`code-splitting.test.ts` pins the new contract. `?lead=` pinning remains a
radial-only feature (the original flow view predates dossier pinning).

## Condensed one-page flow (2026-07-21, same day as the revert)

Alex: the restored row-per-client canvas was too tall with ~180 live leads.
The flow view now condenses to ONE page: the name column is gone (names live
on hover and in the Journey data table underneath), rows sort into the funnel
silhouette (furthest stage first via `sortFlowRows`, entry lanes banded), and
row height adapts via `flowMetrics` (`lib/funnel-viz.ts`, unit-tested): 22px
airy at a dozen leads, hairlines (~3px) at pipeline scale, 520-unit canvas
budget so header + canvas + legend fit a laptop viewport. Touch dots stay the
journey language at every density; halo + inline $ only render when airy
(dense mode moves both into the hover card). Hovering any row dims the rest
and shows an identity card (name, venture, stage, $); dot hover still shows
the touch card.

## Orbit flow (2026-07-21, third pass) — the space returns

Alex: make the flow view like the radial but left → right, leads as dots
ORBITING the stage they're in. That is the retired journey space, so
`components/FunnelSpace.tsx` is restored from history (last pre-neural
version) with three upgrades: (1) `initialLeadId` — the attention rail's
`?lead=` now pins the dossier in BOTH canvases again; (2) `orbitSpread`
(`lib/funnel-viz.ts`, unit-tested) widens a hub's orbit band with its
population (capped 2.4x) so the ~100-lead live first-touch cluster reads as a
field, not a packed donut; (3) wide orbits flatten (y scaled by 1/sqrt(spread))
so they never wash over the hub labels. Entry replay, spine pulses, hub hues,
decay-to-red, relationship rings, fullscreen, and the shared FunnelNodeCard
all return as they were. The condensed FunnelFlow canvas + funnelFlowLayout /
flowMetrics / sortFlowRows are retired (git history keeps them); both engines
ride the lazy wrapper again and `code-splitting.test.ts` pins that contract.

## Test plan
- **AC1** → `funnel.test.ts`: seeded journeys exist for both ventures; touches ordered 1..n, 4–5 per contact; converted contacts have product + amount; Zod parse of every row.
- **AC2** → fixture of hand-built journeys → exact stage counts + conversion % (incl. organic vs ads split, zero-division guard).
- **AC3** → route test: 200 shape parse, venture filter narrows, invalid venture 400.
- **AC4–AC6** → typecheck + build green, `curl /funnel` 200; nav/orphans/smoke suites still green (they derive from `lib/nav.ts`); visual: bars + journey chips render in terminal theme with venture colors (`#00ffaa` Vantage, `#d9263f` LC).

## Decisions (inferred — flag at review)
- Spelling: **Vantage** (codebase canonical; prompt's "meryidan" mapped to it).
- Funnel is a **client-journey** view, not income accounting — conversion amounts are illustrative dummy values, distinct from `/finances`.
- 5-stage canonical enum with `nurtured` optional ⇒ "4–5 touches" exactly as asked.
- Meta Ads gets a status-only connector now (same pattern as Trakyo) so the source strip is honest and the swap-in point already exists.

## Risks / unknowns
- `smoke.test.ts` / `orphans.test.ts` / `nav.test.ts` may assert route lists — they derive from `lib/nav.ts`, but build must confirm they stay green after adding the nav item (digit shortcuts shift by design).
- lucide-react version may lack the `Funnel` icon — fall back to `Filter`.
- Trakyo's real event granularity is unknown (no public API); the touch shape (stage/channel/label/source/at) is our best real-ready guess — revisit at wiring time.
- `seed.test.ts` may pin table/row expectations — extend it, don't break it.

**First slice:** AC1 — the data layer. Everything else (math, API, page) reads through it, and it forces the journey shape decision that Trakyo/Meta Ads will have to fill later.
