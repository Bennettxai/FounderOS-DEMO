# Social + Finances backlog — spec

**Goal:** Close the codeable gaps from the repo to-do list — make the home page as live as `/social`, finish the honest dummy→live swaps that don't need paid add-ons, and scaffold the Finances roadmap — without touching the other session's hot files (`db.ts`/`schemas.ts`/`seed.ts`/`agents/*`) or anything blocked on credentials/paid tiers.

## Scope
- **In:** home-page live sync + real posting; dead-code removal; Beehiiv connector (honest fallback); real email send in Comms; Finances Phase-3 processor scaffolding (PayPal/FanBasis×2/Wise, incl. Wise outflow); Finances Phase-2 statement ingestion via a **separate** store.
- **Out:** buying creds/keys (Stripe/Beehiiv/PayPal/FanBasis/Wise keys, Late analytics add-on); per-post engagement (paid-gated); hosting migration; prod-server daemonizing; the other session's agent-chat / Conductor / LLM work. Connectors ship **real-ready** (honest `not_configured` until a key lands) — wiring the keys themselves is Alex's, not this spec's.
- **Conventions (apply to every criterion):** TDD (failing test first); new data crosses a Zod/`ConnectorStatus` boundary; never emit a fake "connected"/fake number; one file per test module; `FOUNDER_OS_DB=:memory:` for DB tests. Each feature is its own commit; `npm test && npm run typecheck` green before checking a box.

---

## Feature 1 — Home page live (parity with /social)
`app/page.tsx:71` still calls `syncFromZernioConfig` (static) and `:90` feeds `HomeSocialGraph` dummy `postingSeries`. The Social page is already live; Home should match.

### Acceptance criteria
- [x] Home page calls `await syncFromZernioLive(db)` instead of `syncFromZernioConfig(db)` (live follower counts).
- [x] Home posting graph is driven by **real** post history (`zernioPostDays()`), not `postingSeries(...)` dummy — same cross-post per-platform breakdown the Social chart uses.
- [x] A pure helper converts `PostDay[]` → the `PostSeries[]` shape `HomeSocialGraph` expects, over a given day window; unit-tested. *(`postSeriesFromDays`, 2 tests)*
- [x] Home still renders (HTTP 200) when the Zernio API is unreachable (falls back like Social does). *(render verified 200; fallback via the already-tested `zernioPostDays`→[] / `syncFromZernioLive`→config guards.)*

### Contract changes
- New pure fn in `lib/posting-activity.ts`: `postSeriesFromDays(posts, today, days, platforms) → PostSeries[]`.
- `app/page.tsx`: async sync swap + posting source swap.

### Test plan
- `postSeriesFromDays` → unit test (per-platform totals, cross-posts, empty window) in `tests/posting-activity.test.ts`.
- Manual: `/` on :4123 shows live follower numbers matching `/social`.

### Risks
- `HomeSocialGraph` is the other session's file — **do not edit it**; only change its input data in `app/page.tsx`.

---

## Feature 2 — Remove dead `postingCadence`
`postingCadence()` in `lib/social.ts` has zero callers after the chart rebuild.

### Acceptance criteria
- [x] `postingCadence` (and its now-unused test, if any) removed; `grep postingCadence` returns only `postingCadenceByPlatform`.
- [x] `npm test && npm run typecheck` green. *(383 tests pass; typecheck clean.)*

### Risks
- `lib/social.ts` is shared; keep the edit to the single dead function (additive-safe).

---

## Feature 3 — Beehiiv email-list connector (honest fallback)
`lib/email-list.ts` builds from seeded snapshots only. Add a real Beehiiv source that lights up when keyed, falls back to seeded otherwise — mirrors the Zernio pattern.

### Acceptance criteria
- [x] New `lib/connectors/beehiiv.ts`: `beehiivStatus()` returns honest `ConnectorStatus` (`not_configured` without `BEEHIIV_API_KEY`/`BEEHIIV_PUBLICATION_ID`; `connected` with live subscriber count; `error` on API failure), with a 60s cache + timeout like `zernio.ts`.
- [x] `parseBeehiivStats(raw)` pure parser → `{ subscribers: number }`; unit-tested incl. malformed input → null. *(4 tests)*
- [x] Beehiiv registered in `lib/connectors/index.ts` so `/integrations` shows it. *(batch — shared file now clean)*
- [x] `buildEmailList(db)` prefers the live subscriber count when available, else seeded — never a fake number; tested via `syncBeehiivEmail` (3 tests).
- [x] `.env.example` documents `BEEHIIV_API_KEY` + `BEEHIIV_PUBLICATION_ID`. *(batch)*

### Contract changes
- New connector file + `index.ts` registration; new env keys.

### Test plan
- `parseBeehiivStats` → `tests/beehiiv.test.ts` (valid + malformed).
- email-list live-preference → extend `tests/social-extras.test.ts` or new test with injected source.

### Risks
- Beehiiv endpoint/shape unverified (no key on hand) — parser is written to a documented shape and guarded; status stays `not_configured` until Alex adds a key, so nothing fake ships.

---

## Feature 4 — Comms real email send (Gmail SMTP)
`app/api/comms/reply/route.ts` only sends Slack; email is a client-side `mailto:` draft. Send for real via the existing inbox app-passwords over SMTP.

### Acceptance criteria
- [x] `sendEmailReply({accountId, to, subject, text})` in `lib/connectors/email.ts` sends via SMTP (nodemailer) using the matching `INBOX_n` account's user/pass; returns `{ok, error?}` (honest, never throws). *(2 tests: no-config + empty-recipient return ok:false)*
- [x] `POST /api/comms/reply` accepts `source: 'email'` (discriminated union alongside `slack`); failure → `502` honest error, not a fake success.
- [x] `CommsItem` carries the originating inbox (`account`) so a reply knows which account to send **from**; populated in `latestEmails`.
- [x] `CommsFeed` email reply posts to the route and reports real success/failure; falls back to `mailto:` only when SMTP is unavailable/failed.
- [x] `.env.example` documents `INBOX_n_SMTP_HOST`/`_SMTP_PORT` (default `smtp.gmail.com:465`). *(batch)*

### Contract changes
- `lib/connectors/email.ts`: add `account`/`replyFrom` to `CommsItem` mapping + `sendEmailReply`.
- `lib/comms.ts` (`CommsItem` type): add `account?: string`.
- `app/api/comms/reply/route.ts`: widen `ReplySchema` to a discriminated union (`slack` | `email`).
- New dep: `nodemailer` (+ `@types/nodemailer`).

### Test plan
- `ReplySchema` union validation → unit test (accept email payload, reject malformed).
- `sendEmailReply` with no SMTP config → returns `{ok:false}` (no throw); test with stubbed transport for the success path.
- Manual: reply to a real inbox email from `/comms`, confirm receipt.

### Risks
- Gmail may need SMTP enabled for the app password; if it 5xx's, the route returns honest `502` and the UI falls back to `mailto:`.
- Adding a dep touches `package.json` (other session also edits it) — coordinate the merge.

---

## Feature 5 — Finances Phase 3: processor scaffolding (honest)
`lib/finances.ts` already names 6 income accounts (Stripe + PayPal + FanBasis×2 + Wise×2) but `configuredProcessors` in `payments.ts` lists stripe/paypal/**square/whop** — a mismatch. Reconcile to the real processors and add honest config detection + Wise outflow.

### Acceptance criteria
- [x] `configuredProcessors(env)` reflects the **real** processors: stripe, paypal, fanbasis-vantage, fanbasis-lc, wise-1, wise-2 — square/whop dropped.
- [x] Each non-Stripe processor reports honest `configured` from its env keys (`PAYPAL_*`, `FANBASIS_VANTAGE_KEY`/`FANBASIS_LC_KEY`, `WISE_1_TOKEN`/`WISE_2_TOKEN`); no live call until keyed.
- [x] `incomeAccounts(stripe, configured)` `live`/`income`/`configured` per account derives from real config (not just Stripe) — pure, unit-tested. *(key-set ≠ live until a real pull lands)*
- [x] Wise: `wiseOutgoing(env)` returns recent **outgoing** transfers when keyed, else `null`; `/finances` shows an "Outgoing · Wise" section when present (hidden without a key). *(`parseWiseTransfers` tested; section verified hidden.)*
- [x] `paymentsStatus` detail lists all configured processors; `/finances` "N/6 live" accurate (renders "0/6 live" with no keys).
- [x] `.env.example` documents PAYPAL/FANBASIS/WISE keys. *(batch)*

### Contract changes
- `payments.ts`: processor registry rewrite + per-processor config branches + `wiseOutgoing`.
- `finances.ts`: `incomeAccounts` keys off the registry; new `OutgoingTransfer` type.
- `app/finances/page.tsx`: render Wise outflow section.

### Test plan
- `configuredProcessors` env matrix → `tests/finances.test.ts` (each processor on/off).
- `incomeAccounts` live/income derivation → unit test with injected config.
- `wiseOutgoing` parser → unit test (valid + null when unkeyed).

### Risks
- PayPal/FanBasis/Wise API shapes unverified (no keys) — ship parsers to documented shapes, guarded; everything stays `not_configured` until keys land, so no fake live.

---

## Feature 6 — Finances Phase 2: statement ingestion (CSV → ledger)
Upload monthly bank/CC statements → parse → categorize → persist a ledger → reconcile against processor income, replacing `SAMPLE_EXPENSES`. **Uses a separate store** so it never touches the shared `db.ts`/`schemas.ts`/`seed.ts`.

### Acceptance criteria
- [x] `lib/statements.ts` (pure): `parseStatementCsv(text) → ParsedRow[]` (date, description, amountCents, direction in/out) tolerant of signed-amount, Debit/Credit, $/commas/parentheses, alternate headers; malformed rows skipped. *(5 tests)*
- [x] `categorize(row)` maps a row to a spend category by description rules (inbound = Income); unit-tested. *(3 tests)*
- [x] `lib/ledger.ts`: a **separate** better-sqlite3 store at `data/ledger.db` with `insertRows` (hash-deduped) / `monthly()` / `reconcile(income)` / `rowCount`; not imported by the shared repo layer. *(3 tests)*
- [x] `POST /api/finances/statements` parses + categorizes + persists, returns `{inserted, parsed, byCategory}`; rejects non-CSV/unparseable with `400`. *(verified e2e)*
- [x] `/finances` placeholder → real `StatementUploader`; expenses-by-category shows **real** parsed spend when a ledger exists (sample fallback), labeled "uploaded" vs "sample". *(verified: flips on upload, reverts on cleanup)*
- [x] `data/ledger.db*` gitignored (via existing `data/*.db` rule); statements never committed.

### Contract changes
- New `lib/statements.ts`, `lib/ledger.ts`, `app/api/finances/statements/route.ts`, a client uploader component.
- `app/finances/page.tsx`: read ledger when present; new `.gitignore` entries.

### Test plan
- `parseStatementCsv` + `categorize` → `tests/statements.test.ts` (real-ish CSV fixtures, malformed rows, both directions).
- `ledger` repo → `tests/ledger.test.ts` with a temp/`:memory:` ledger db (insert→monthly→reconcile).
- Manual: upload a sample CSV on `/finances`, see categorized real spend + reconciled net.

### Risks
- Bank CSV formats vary wildly — v1 targets common shapes (date/description/amount), logs unparsed rows rather than guessing; PDF parsing is a later slice.
- Largest feature — build it last, after the quick wins de-risk the loop.

---

## Deferred shared-file edits — ✅ DONE (batch, 2026-06-22, after the other session committed)
- [x] `lib/connectors/index.ts` — register `beehiivStatus` (Feature 3).
- [x] `.env.example` — `BEEHIIV_API_KEY` + `BEEHIIV_PUBLICATION_ID` (F3); Wise/PayPal/FanBasis keys (F5); `INBOX_n_SMTP_HOST/_PORT` (F4).
- [x] `package.json` — add `nodemailer` + `@types/nodemailer` (Feature 4).
- [x] payments/email already registered in `index.ts` — no further status entries needed (F5 via existing `paymentsStatus`, F4 via existing `emailStatus`).

## Build order / first slice
Smallest-first, each de-risking the next:
1. **Feature 2** (dead-code) — trivial, proves the loop end-to-end.
2. **Feature 1** (home live) — reuses shipped `social-live`/`posting-activity`; high value, low risk.
3. **Feature 3** (Beehiiv) — self-contained connector, mirrors Zernio.
4. **Feature 5** (Phase-3 scaffolding) — pure config logic + guarded parsers.
5. **Feature 4** (email send) — adds a dep + contract change; medium risk.
6. **Feature 6** (statement ingestion) — largest; separate store.

**First slice:** Feature 2's single criterion (remove `postingCadence`) — smallest possible green slice to validate the spec→build→review loop, then proceed to Feature 1.
