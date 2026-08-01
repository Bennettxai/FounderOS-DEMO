# Spec: Beehiiv newsletter analytics dashboard

## Goal
Clicking the Beehiiv (Email list) card on `/social` opens an expandable Beehiiv
analytics dashboard at `/social/beehiiv` listing every past newsletter with its
open rate, click rate, delivery, bounces, unsubscribes and web views. Real data
via the live Beehiiv API, seeded fallback when unconfigured (larp-first).

## In scope
- `/social/beehiiv` route (server component, force-dynamic).
- Live fetch of posts + per-post stats via the app's Beehiiv connector
  (`GET /publications/{pub}/posts?expand[]=stats`), mapped to a `Newsletter`.
- Seeded fallback newsletters so the page is alive without a key.
- Expandable list: each newsletter shows headline metrics collapsed, full
  analytics grid expanded.
- Email cell on `/social` links to `/social/beehiiv` (was `/comms`).

## Out of scope
- Editing/sending newsletters. Subscriber-growth chart (already on `/social`).

## Data contract (Newsletter)
Mapped from Beehiiv REST `stats.email` (+ derived rates):
- id, title, publishedAt (ISO from unix `publish_date`), webUrl
- recipients, delivered, deliveryRate (delivered/recipients)
- opens (unique_opens), openRate (API `open_rate`)
- clicks (unique_clicks), clickRate (API `click_rate`)
- unsubscribes, unsubscribeRate (unsubscribes/delivered), spamReports
- webViews (stats.web.views)
Only `confirmed`/`published` posts are listed.

## Acceptance criteria
- [ ] `parseBeehiivPosts` maps a REST payload to `Newsletter[]`, deriving
      delivery/unsub rates and the ISO date, keeping only sent posts.
- [ ] `getNewsletters` returns live data when the connector has data, else the
      seeded fallback (never a fake-live blank).
- [ ] `newsletterSummary` aggregates count, total recipients, avg open rate,
      best open rate.
- [ ] Every seeded newsletter validates against `NewsletterSchema`.
- [ ] `/social/beehiiv` renders the summary + an expandable per-newsletter list.
- [ ] The `/social` email cell links to `/social/beehiiv`.
- [ ] typecheck + tests green; page renders live with expand working.

## Test plan
`tests/newsletters.test.ts`: parse (REST shape + empty/garbage), sent-only
filter, derived rates, unix->ISO, fallback to seed on no-key, summary math,
schema validation of the seed.
