# FounderOS (Demo)

A personal operator OS and AI-agent command center: a live web dashboard for
running a solo business as a set of AI-assisted "departments." This is a
sanitized demo build seeded with placeholder data, so you can explore the whole
product without any real accounts or keys.

## Quick start

Requires Node 18+.

```bash
npm install
cp .env.example .env.local   # optional — only needed to wire live integrations
npm run dev                  # http://localhost:4100
```

A local SQLite database is seeded with demo data on first run, so every page is
populated out of the box. No credentials are required to browse.

## What you're looking at

- `/` operator console
- `/comms` unified inbox feed
- `/social` growth dashboard — per-account follower diagrams, audience-share pie, recency-dotted post grid
- `/agents` agent roster
- `/org` org hierarchy board
- `/brain` knowledge core + graph: departments ride a rotating wheel (arrow paddles turn it, expanded trees swing into the apex), lens dropdowns slice the graph by entity type, business function, or action, and the capture slot in the header takes text, voice, or dropped documents
- `/funnel` client-journey flow — left-right neural-network view and a radial acquisition wheel, both fullscreenable
- `/finances` income and expense charts with month tooltips, money-out views, and an expenses-by-category pie
- `/analytics` · `/roadmap` · `/integrations` · `/reference`

Five themes ship, including the Monolith default (white on black, color =
status only) — pick via the palette icon in the top bar.

Navigate with the sidebar or the Command Palette (Cmd/Ctrl + K).

## Wiring live data (optional)

Every integration reads through a connector that honestly reports
"not configured" until you add its key — nothing fakes a connection. Copy
`.env.example` to `.env.local` and fill in whichever services you want to see
live (email, Slack, Stripe, and so on). None are required for the demo.

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind · better-sqlite3 · Zod · Vitest.

## Commands

```bash
npm run dev         # dev server on :4100
npm test            # vitest suite
npm run typecheck   # tsc --noEmit
npm run build && npm start
```

## Note

This is a demo build. All names, companies, clients, financial figures, and
social numbers are placeholder data.
