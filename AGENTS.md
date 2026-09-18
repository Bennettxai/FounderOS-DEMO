# STARTUP — Agent Rules

Read `CLAUDE.md` and the canonical company specification before changing the system.

Authoritative company files:

- `company/company.yaml`
- `company/organization.yaml`
- `company/governance.yaml`
- `policies/memory_policy.yaml`

## Non-negotiables

- Never commit secrets.
- Never push to any remote without explicit human approval.
- Never invent operational company history or production data.
- Never give an AI agent unrestricted brokerage execution credentials.
- Never bypass governance or approval state transitions.
- Do not restore removed FounderOS functionality merely to satisfy an old test.

## Engineering rules

- Run `npm run typecheck`.
- Run `npm test`.
- Keep structured data validated with Zod.
- Use repository abstractions for operational persistence.
- Preserve useful generic infrastructure.
- Remove application-specific FounderOS assumptions.
- Treat empty Foundation Mode datasets as valid.

## Architecture principle

Agents propose actions.

The deterministic Company Control Plane decides whether those actions are technically permitted.

The human CEO retains final investment and execution authority.

## Startup Brain

Startup Brain is the company's institutional memory.

Do not recreate or depend on the legacy FounderOS G-Brain.

Raw market history belongs in market-data systems, not institutional memory.