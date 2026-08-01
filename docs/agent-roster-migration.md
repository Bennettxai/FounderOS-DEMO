# Agent roster migration (2026-06-12)

The roster was restructured into instance agents + worker sub-agents
(Alex's directive: prep for OpenClaw Hermes / Claude Code instances on the
Mac mini, one agent per domain with task workers at the bottom of the
hierarchy).

Id mapping (old → new):

| old | new |
|---|---|
| `brain-librarian` | `data-agent` (+ `markdown-auditor`, `vector-auditor` workers) |
| `inbox-triage` | `gmail-worker` (under new `comms-agent`) |
| `slack-scout` | `slack-worker` |
| `social-pulse` | `zernio-publisher` (under new `social-agent`, dept-studio) |
| `studio-monitor` | `stack-monitor` |
| — | new: `conductor`, `comms-agent`, `whatsapp-worker`, `social-agent`, `arcads-creative`, `data-agent` |

`crm-pulse`, `payments-pulse`, `notion-sync` keep their ids (crm-pulse is now
a worker under payments-pulse; notion-sync a specialist under data-agent).

Notes for in-flight work:

- `AGENT_BRAIN_SCOPES` in `lib/brain-graph.ts` has entries for BOTH id sets;
  delete the old block once the brain-graph feature stops referencing them.
- Agents gained `parentId` (hierarchy nesting) and `instance` (runtime
  binding, 'builtin' until the mini) — `openDb` migrates old DB files in
  place, and re-seeding deletes roster-orphaned agent rows.
- New: `runtime.broadcast(message)` + `POST/GET /api/agents/broadcast`
  ("speak to all agents" on /org). Agents may implement `respond(message)`;
  data-agent answers via gbrain query.
