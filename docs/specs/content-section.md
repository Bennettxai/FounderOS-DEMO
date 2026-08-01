# Content section — spec

**Goal:** A new "Content" view between Social and Agents that surfaces the content-creation agent + crew (tied to social / the Zernio API) and backlinks out to the Vantage content-intelligence system (intel.vantage.ai + /my-analytics).

## Scope
- **In:**
  - New `/content` route, nav item labelled **Content** placed **between Social and Agents** in the Operate group.
  - Page header ("Content Creation").
  - **Content-intelligence backlinks**: prominent cards/buttons that open `https://intel.vantage.ai` and `https://intel.vantage.ai/my-analytics` in a new tab.
  - **Content agent + crew** section: the content lead (`social-agent`) and its content workers, pulled from the real agent repo (role / model / status / tools) — honest, no fake "connected".
  - **Zernio content pipeline** section: recent published content + a short posting-cadence summary, from the live Zernio connector (seed fallback), tied to social.
- **Out:**
  - Re-implementing the full `/social` dashboard (audience charts, composer) — link to `/social` for those.
  - Fetching/iframing the intel system (no API/auth here) — backlink only.
  - Schema / DB / API-route changes; new deps.
  - Running agents from this page (link to `/agents` for Run).

## Acceptance criteria
- [x] **AC1 — content crew selector (pure).** `lib/content.ts` `contentAgents()` returns the `dept-marketing-growth` crew, lead (`social-agent`) first. _(content.test.ts: 3 green.)_
- [x] **AC2 — nav + route.** `Content` nav item (Clapperboard) sits between Social and Agents (Sidebar source confirms 27/28/29); `/content` force-dynamic → **HTTP 200**, "Content Creation" header.
- [x] **AC3 — intelligence backlinks.** Backlink cards to `https://intel.vantage.ai` + `…/my-analytics`, `target="_blank" rel="noopener noreferrer"` (present in rendered HTML).
- [x] **AC4 — content agent + crew.** Lead (`Social Agent`) + workers (`Zernio Publisher`, …) rendered from `getDb().agents.all()` via `contentAgents`, with role/model/status/tools (real seed statuses).
- [x] **AC5 — Zernio pipeline + gates.** Pipeline section (recent content via `zernioRecentPosts`, honest fallback + cadence line) present; terminal tokens + PageHeader/SectionHead/Badge; typecheck clean, **57 test files pass**, build compiled, `/content` route built.

## Contract changes
- **New `lib/content.ts`** (`contentAgents`) + `tests/content.test.ts`.
- **New `app/content/page.tsx`** (server component, `dynamic = 'force-dynamic'`).
- **Edit `components/Sidebar.tsx`** — insert the Content nav item between Social and Agents in `NAV_OPERATE`.
- Reuse `lib/connectors/zernio.ts` (`zernioRecentPosts`, `zernioPostDays`), `getDb().agents`, `PageHeader`, `components/terminal`. Optional: update the `/views` list in CLAUDE.md.
- No schema, DB, or API-route changes.

## Test plan
- **AC1** → `content.test.ts`: `contentAgents(seededAgents)` returns the marketing/growth crew, `social-agent` first, includes the expected worker ids, excludes other depts.
- **AC2** → build green + `curl /content` = 200; Sidebar source shows Content between Social and Agents.
- **AC3 / AC4 / AC5** → typecheck + build green; live on `/content`: backlinks open the two intel URLs in a new tab; crew cards show real seed agents/tools; Zernio recent-content section renders.

## Decisions (inferred — confirm at review)
- Nav label = **Content** (concise, matches Social/Agents); page title = **Content Creation**; route `/content`; icon = `Clapperboard` (lucide).
- "Content agent + crew" = the `dept-marketing-growth` agents (the content/social-media pillar), since that's where the Zernio publisher + creative agents live.
- Intel system is **backlinked** (out-links), not embedded — no creds/API for it here.

## Risks / unknowns
- Sidebar is a client component; nav order verified by source + visual, not a unit test.
- `zernioRecentPosts` is async + may hit the live API; keep the seed fallback so the page renders offline (same pattern as `/social`).
- Don't duplicate `/social` — keep Content focused (agents + pipeline summary + intel backlinks).

**First slice:** AC1 — the pure `contentAgents` selector. It's testable, tiny, and the crew section (AC4) + page build on it.
