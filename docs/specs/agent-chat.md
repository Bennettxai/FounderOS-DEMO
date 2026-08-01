# Agent Chat & Conductor Routing — spec

**Goal:** On the `/agents` tab, talk to each agent (and the Conductor) in a real LLM-backed conversation where the agent can call its own connectors as tools; the Conductor routes a message to the best-fit or explicitly `@named` agent; per-agent Run buttons are gone; and a live activity feed of what agents have done lives on the same page.

## Scope
- **In:**
  - New `lib/connectors/llm.ts`: honest `ConnectorStatus` + a `chat()` entry point backed by the **Vercel AI Gateway**, with an `LLM_PROVIDER=stub` path for tests (no network).
  - `agent_messages` table (one rolling conversation per agent; `conductor` is an agent id) — repo + Zod + tests.
  - Per-agent chat: `lib/agents/chat.ts` + `POST /api/agents/[id]/chat` (JSON request/response), persisting turns.
  - Tool-calling: extend `RuntimeAgent` with optional `chatTools()`; wire AI SDK multi-step tool loop; implement **read-only** tools for the connector-backed agents (data → G-Brain, comms → inbox counts, sales → Attio/Stripe read, social → Zernio read, payments → Stripe read).
  - Conductor routing: `lib/agents/conductor.ts` — `@agent` prefix routes directly; otherwise the model picks the best-fit agent id from the roster, delegates to that agent's chat, returns `{ routedTo, reply }`. Reached via `POST /api/agents/[id]/chat` when `id === 'conductor'`.
  - Activity feed: `GET /api/agents/activity` unioning `agent_runs` + `broadcast_replies` + `agent_messages` into typed `ActivityEvent[]`, newest-first.
  - UI on `/agents`: remove `RunAgentButton`; add a per-agent chat panel; add a Conductor chat block; add a live activity feed component. Tasks/activity render **inside the agents section**.
- **Out:**
  - Token streaming UI (v1 is request/response JSON; streaming is a follow-up spec).
  - Multiple threads per agent (one ongoing conversation per agent for v1).
  - **Write/destructive** tool actions (send email, create deal, publish post) — tools are read-only in v1.
  - Cron execution/scheduling (unchanged; cron management UI stays as-is).
  - Auth on chat endpoints (local app).
  - Removing the `POST /api/agents/[id]/run` route — kept for cron/future use; only the **button** is removed.

## Acceptance criteria
- [x] **C1 — LLM connector + stub.** `lib/connectors/llm.ts` exports `llmStatus(): Promise<ConnectorStatus>` (`not_configured` when no `AI_GATEWAY_API_KEY`, `connected` when present) and `chat({ system, messages, tools? })`. Under `LLM_PROVIDER=stub` it returns a deterministic reply with **no network call** and can emit a tool call when the prompt contains a known trigger token. _(Done: `tests/llm.test.ts` 4/4; added `ai`@6 dep; `.env.example` updated; gateway path uses `gateway()` + `generateText` + `stepCountIs(6)`.)_
- [x] **C2 — `agent_messages` persistence.** New table + repo (`insert`, `byAgent(agentId)` oldest→newest, `recent(limit)`) + `AgentMessageSchema` (Zod) validating every row out. Round-trips on a `:memory:` DB. _(Done: `tests/agent-messages.test.ts` 4/4; `agent_messages` DDL, `AgentMessageSchema`/`AgentToolCallSchema`, repo wired into `openDb`.)_
- [x] **C3 — Per-agent chat.** `lib/agents/chat.ts` + `POST /api/agents/[id]/chat` accepts `{ message }`, loads the agent's recent history, calls `chat()` with the agent's system prompt, persists the user turn and the assistant turn, and returns `{ reply, messages }`. 404 for unknown agent. _(Done: `tests/agent-chat.test.ts` 5/5; `chatWithAgent` + route; `RuntimeAgent.chatTools?()` added; route on Node runtime; 400 on empty, 404 on unknown.)_
- [x] **C4 — Tool-calling.** `RuntimeAgent` gains optional `chatTools()`; the chat orchestrator runs the AI SDK tool loop and feeds results back. At least the data-agent exposes a working read-only `searchGBrain` tool reusing the existing connector. A stub-triggered tool call invokes the connector and persists a `role:'tool'` message capturing the call + result. _(Done: `tests/agent-tools.test.ts` 2/2; data-agent `searchGBrain` wraps `getBrainProvider().search`; user→tool→assistant turns persisted.)_
- [x] **C5 — Conductor routing.** `lib/agents/conductor.ts route(message)`: a leading `@<agentId|slug>` routes straight to that agent; otherwise the model returns a best-fit agent id from the roster. The route delegates to that agent's chat and returns `{ routedTo, reply }`. Unknown `@name` → falls back to model routing (never throws). _(Done: `tests/conductor.test.ts` 5/5; `routeConductorMessage` matches by id + name-slug; `id==='conductor'` branch in the chat route.)_
- [x] **C6 — Activity feed API.** `GET /api/agents/activity?limit=` returns `ActivityEvent[]` (`kind: 'run'|'message'|'broadcast'`, `agentId`, `at`, `summary`) merged across the three tables, sorted newest-first, honoring `limit`. _(Done: `tests/activity.test.ts` 4/4; `recentActivity` projection + route; user turns excluded.)_
- [x] **C7 — Agents page: chat replaces Run.** `app/agents/page.tsx` no longer renders `RunAgentButton`; each agent card opens an `AgentChat` panel that posts to `/api/agents/[id]/chat` and shows the conversation. `typecheck` + `build` green. _(Done: `components/AgentChat.tsx`; page renders 0 `RunAgentButton`, SSR-seeds history; `next build` ✓ Compiled successfully.)_
- [x] **C8 — Conductor chat on /agents.** A Conductor chat block on `/agents` posts to the conductor chat endpoint and shows `routedTo` + reply (upgrades the existing `ConductorCard` from broadcast to routed chat, or adds an adjacent block). _(Done: new `components/ConductorChat.tsx` at the top of `/agents`; `/org` `ConductorCard` left frozen; shows `→ <agent>` per reply; `next build` ✓.)_
- [x] **C9 — Live activity feed on /agents.** `AgentActivityFeed` renders `GET /api/agents/activity` in the agents section, newest-first, terminal-themed. _(Done: `components/AgentActivityFeed.tsx`, SSR-seeded via `recentActivity(db,40)` + refresh button, placed under the stat row; `next build` ✓.)_

## Contract changes
- **Dependency:** add `ai` (Vercel AI SDK v6) — gateway via `"provider/model"` strings.
- **Env:** `AI_GATEWAY_API_KEY` (real), `LLM_PROVIDER` (`gateway` default | `stub`), `LLM_MODEL` (default `anthropic/claude-sonnet-4-6`). Add to `.env.example`.
- **DB:** new `agent_messages(id, agent_id, role, content, tool_calls, created_at)`; repo in `lib/db.ts`.
- **Schemas:** `AgentMessageSchema`, `ActivityEventSchema` in `lib/schemas.ts`.
- **Types:** `RuntimeAgent.chatTools?(): Record<string, AiTool>` in `lib/agents/runtime.ts`.
- **New modules:** `lib/connectors/llm.ts`, `lib/agents/chat.ts`, `lib/agents/conductor.ts`, activity aggregation (repo method or `lib/agents/activity.ts`).
- **Routes:** `POST /api/agents/[id]/chat`, `GET /api/agents/activity` (both Node runtime — better-sqlite3 is native).
- **Components:** new `components/AgentChat.tsx`, `components/AgentActivityFeed.tsx`; edit `app/agents/page.tsx`, `components/ConductorCard.tsx`.

## Test plan
- C1 → unit: no key ⇒ `not_configured`; key set ⇒ `connected`; `LLM_PROVIDER=stub` `chat()` returns canned text and (with trigger) a tool call, asserting no network.
- C2 → unit (`:memory:`): insert N messages, `byAgent` ordered oldest→newest, `recent` honors limit, Zod rejects a malformed row.
- C3 → integration: POST a message ⇒ exactly 2 new rows (user, assistant) + response `reply` equals stub output; unknown agent ⇒ 404.
- C4 → integration (stub trigger): tool fires ⇒ connector invoked (assert via a stubbed/seeded connector result) ⇒ `role:'tool'` row persisted ⇒ final reply includes tool output.
- C5 → unit: `@sales-agent hi` ⇒ `routedTo==='sales-agent'`; bare message ⇒ stub returns a fixed best-fit id ⇒ that agent answers; `@nope` ⇒ falls back, no throw.
- C6 → integration: seed 1 run + 1 message + 1 broadcast reply ⇒ feed returns 3 events, correct `kind`s, newest-first, `limit=2` truncates.
- C7–C9 → `npm run typecheck && npm run build` green; manual: Run button absent, chat panel works, Conductor routes, activity feed lists events. (No component-test harness exists; gate on typecheck/build + manual.)

## Risks / unknowns
- **AI SDK v6 surface** (`generateText`/`streamText`, `tool()`, gateway `"provider/model"` resolution, step/tool-loop option name). Confirm against the `vercel:ai-sdk` / `vercel:ai-gateway` skills at build time; pin a known-good version.
- **Gateway auth**: SDK reads `AI_GATEWAY_API_KEY` from env by default — verify, and confirm `not_configured` path stays honest with no key.
- **Native DB on routes**: chat/activity routes must run on the Node runtime (not edge) since `better-sqlite3` is native; mirror existing route config.
- **Live tools hit real services** (Gmail, Stripe, Attio). v1 tools are **read-only**; any future write action must require explicit confirmation.
- **Streaming deferred** — v1 returns full JSON replies. Confirm acceptable at spec review (chat works, just not token-by-token).
- **Model/cost** — default `LLM_MODEL` is env-overridable; sonnet-class chosen for cost/quality balance.

**First slice:** **C1 (LLM connector + stub).** Everything downstream calls `chat()`, and the `stub` provider is what makes C2–C6 testable without network — building it first de-risks the entire loop.

---

## Review — PASS (2026-06-20)

Gates green: `tsc --noEmit` clean · `vitest` 379/379 · `next build` ✓. All 9 criteria verified against the code. Adversarial pass found no critical issues and no scope creep; tools are read-only, streaming deferred, `/run` route kept (only the button removed). Fixes applied during review:

- **MAJOR — chat route masked all errors as 404.** Now resolves the agent up front: genuinely-unknown agent → 404, any downstream failure (gateway/Zod/etc.) → 500. (`app/api/agents/[id]/chat/route.ts`)
- **MAJOR — gateway tool-call/result alignment was positional.** Now matches result to call by `toolCallId`, so a missing/failed tool result can't misattach outputs. (`lib/connectors/llm.ts`)
- **MINOR — LLM connector was invisible on /integrations.** Registered `llmStatus` in `allConnectorStatuses`. (`lib/connectors/index.ts`)
- **MINOR — documented** that prior `tool` turns are kept for the activity feed but not replayed to the model on follow-ups (v1, read-only). (`lib/agents/chat.ts`)

Known limitations (honest, not blockers):
- The **real gateway call** and **real best-fit routing selection** are only exercised by the `stub` (offline tests can't hit a live model); the stub-fallback routing path *is* tested. Needs a live `AI_GATEWAY_API_KEY` for true end-to-end verification.
- Default `LLM_MODEL=anthropic/claude-sonnet-4-6` is the current Sonnet and is env-overridable; confirm the gateway exposes that slug when wiring the key.
- `@agent` with no message body re-sends the literal token as content (cosmetic).
