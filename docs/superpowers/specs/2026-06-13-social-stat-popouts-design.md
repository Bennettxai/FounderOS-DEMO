# Social stat pop-outs — design (2026-06-13)

## Goal

Promote **Audience Growth %** and **Total DMs** into the Social page's top
metric strip (beside Total Followers and Email List), each with
**7d / 30d / 60d / all-time** views, and let the user click either value to
open an interactive **pop-out graph** of its history.

## Top strip

Four tiles: `Total Followers · Email List · Audience Growth ▸ · Total DMs ▸`.

- Followers and Email stay static (they keep their own cards + sparklines in
  the grid below).
- **Audience Growth** and **Total DMs** each render a value plus inline range
  chips `[7d][30d][60d][All]` that update the displayed number. The value is
  clickable (▸) and opens the pop-out.
- The standalone "This month" section is removed — its two metrics live here now.

## Pop-outs (`StatPopout` client component)

Centered modal overlay over the page. Close via Esc, click-outside, or ×.

**Audience Growth pop-out** — interactive multi-series graph:
- Series toggles (multi-select, each overlays a line):
  `[All audience] [Instagram] [TikTok] [Twitter] [YouTube] [LinkedIn] [Email]`.
  Platform lines use brand colors; "All audience" = every channel summed.
- Range toggles: `[7d][30d][60d][All]`.
- Default: All audience, 30d. Graph regenerates on any toggle.

**Total DMs pop-out** — cumulative DMs over time with `[7d][30d][60d][All]`
range toggles. DM history is stored per-platform-per-day, so per-platform DM
lines are a future add; the graph shows the total for now.

## Data model & math

- **Growth windows**: `lib/growth.ts` already computes growth over any day
  count; expose a 60-day window alongside the existing 7/30/all.
- **Audience series**: `audienceSeries(db)` returns, per platform and email, a
  `{date,value}[]` series plus an "All audience" series built by carrying each
  channel's most recent value forward across the union of all snapshot dates,
  then summing — so channels sampled on different days still aggregate cleanly.
- **DM history**: new `social_dm_snapshots` table (`platform, captured_at,
  count, source`, PK `(platform, captured_at)`), seeded with ~90 days of
  plausible **dummy** history consistent with the current seeded DM totals.
  `dmCumulativeSeries(db)` returns total cumulative DMs per day; DMs received in
  a window = `current − baseline` (reuses `windowDelta`).
- **API**: `GET /api/social/series?metric=audience|dms` returns the labelled
  series (with colors) the pop-outs plot; growth per range is computed from the
  series.

Honesty rule preserved: dummy data is labelled "dummy"; growth shows an em-dash
when history is too short — never a fabricated zero.

## Testing (TDD, written first)

1. `growthOver(points, 60)` window boundary.
2. `audienceSeries` — carry-forward aggregation across mismatched dates; "All"
   equals the sum of channels; per-platform series intact.
3. DM snapshot round-trip; `dmCumulativeSeries`; DMs-in-window via `windowDelta`.
4. Seed: ~90 days of DM history present; re-seed idempotent.
5. `GET /api/social/series` returns labelled series for both metrics + ranges.

## Out of scope

Per-platform DM lines (data is ready for it; UI shows total only). Custom
arbitrary date ranges (presets 7/30/60/all only). Real DM/Beehiiv sources.
