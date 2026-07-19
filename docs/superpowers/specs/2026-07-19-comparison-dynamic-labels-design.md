# Comparison Page — Dynamic Period Labels

**Date:** 2026-07-19
**Status:** Approved by owner

## Problem

The nav item says "Week to Week", but the page (`#page-period`) is used flexibly:
the owner often compares a week of this month vs the same week last month, not
calendar week-to-week. Two lies result:

1. The nav name "Week to Week" doesn't describe how the page is used (the page
   title already says "Period Comparison").
2. In Weekly mode, the labels "2 Minggu Lalu / 1 Minggu Lalu / Minggu Ini" are
   hardcoded in 5 places while the three date pickers accept any range — so when
   the selected ranges aren't the actual calendar weeks, every label misleads
   and the owner misreads the data.

Hardcoded label sites today:

- 3 card headings (`.period-heading` `p1c/p2c/p3c`, index.html ~4752–4770)
- "Tren 3 Minggu" chart dataset legend (`buildWeeklyTrend`, ~7067–7069)
- 2 compare-card headers "Minggu Ini vs 1/2 Minggu Lalu" (static HTML ~4796–4797)
- `buildCompareTable` call args (~7051–7052)
- CAGR table `<th>` headers `W-2 / W-1 / W0` (`buildCagrTable`, ~7088)
- Bonus, same lie elsewhere: FLDT card "Komposisi Cup — Minggu Ini" (~4877) —
  FLDT shares the same `range1s..range3e` inputs.

Precedent already in the codebase: `renderFldtWeekly` builds its axis labels
from the actual selected dates (`fmtR`, ~7158).

## Decision (owner-approved)

- **Nav rename:** "Week to Week" → **"Comparison"** (label + `aria-label`,
  index.html:4534). Page title "Period Comparison" unchanged.
- **Labels: smart detect.** When the three ranges genuinely form three aligned
  consecutive weeks, keep the friendly week labels; otherwise show the real
  date ranges. Never show a week label that isn't true.

## Design

### `periodLabels()` — single source of truth

Reads `range1s/e`, `range2s/e`, `range3s/e` and returns labels for all
consumers:

- **Weekly detection:** `range3` starts on the Monday of the current calendar
  week, AND `range2` = `range3` shifted −7 days (both start and end), AND
  `range1` = `range3` shifted −14 days. This exactly matches the defaults set
  in `setDefaultDates` (index.html ~5692–5705), so the initial view keeps week
  labels.
- **Weekly →** long: `["2 Minggu Lalu","1 Minggu Lalu","Minggu Ini"]`;
  short (CAGR `<th>`): `W-2 / W-1 / W0`.
- **Not weekly →** long: date ranges via `fmtShortDate`, e.g. `"30 Jun–6 Jul"`
  (start===end collapses to one date, same as `fmtR` in FLDT);
  short: `P1 / P2 / P3` with `title=` holding the full range.
- **Empty range n →** fallback `"Periode n"` for that slot (short: `Pn`).

### `refreshPeriodLabels()` — apply everywhere

Called from `loadPeriod()` (already triggered on every date change via the
`DRP_TRIGGERS` map, ~7965). Updates via `textContent` only — no rebuilds:

1. The 3 card headings `p1c/p2c/p3c`.
2. `buildWeeklyTrend` dataset labels — the function reads `periodLabels()` at
   build time; no extra call needed since `loadPeriod` already rebuilds it via
   `buildWeeklySummary` on every range change.
3. The 2 compare-card headers → add a small `<span id>` inside each static
   `card-hdr` so text becomes "«L3» vs «L2»" / "«L3» vs «L1»".
4. `buildCompareTable('compare-w32'/'w31', …)` — pass labels as the existing
   `lCurr`/`lPrev` args (already parameterized).
5. `buildCagrTable` `<th>` row — short labels (+`title=` full range when dates).
6. FLDT "Komposisi Cup" card header → "Komposisi Cup — «L3»" (one line; give
   the static header a `<span id>` too, refreshed from the same helper).

### Out of scope / unchanged

- Custom mode (labels already neutral "Periode 1/2").
- Data flow, filtering, `_renderedPages`, chart perf invariants — label-only.
- No new settings, no persistence.

## Housekeeping

- Bump `sw.js` `CACHE_VERSION` `fore-v118` → `fore-v119`.
- Update `CLAUDE.md` (nav name, dynamic-label behavior) per standing rule 9.

## Verification (manual)

1. Fresh load, defaults → week labels everywhere ("Minggu Ini", W0, …).
2. Change any one of the 3 ranges → ALL labels flip to date ranges in sync
   (cards, legend, compare headers, compare tables, CAGR, FLDT cup card).
3. Restore the exact default weeks via pickers → week labels return.
4. One range empty → that slot reads "Periode n", others still dates.
5. Check dark + light themes; theme swap rebuilds pages — labels must survive.
