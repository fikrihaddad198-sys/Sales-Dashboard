# KPI Page — Bottom Section Redesign

**Status:** Approved direction (owner), 2026-07-04. Superpowers flow.
**Checkpoint:** branch off latest `main`; create `checkpoint-pre-kpi-bottom` before edits.

## Problem
The two bottom cards on the KPI page feel useless to the owner:
- **Daily GMV Trend + 7D MA** (`kpi-trend-chart`) — duplicates Day-to-Day / Week-to-Week.
- **Channel Stacked** (`kpi-stacked-chart`) — duplicates the Channel Contribution card right
  above it + the whole Channel page; also missing the **Online** channel.

The KPI page's job is "are we hitting target?" — these charts answer "what's the shape of the
data", already covered elsewhere.

## Changes

### 1. Channel Contribution card — add `Total / Per Hari` toggle
Keep the existing aggregate view as **Total**. Add a **Per Hari** view: a daily **stacked bar**
of GMV by channel, covering ALL FIVE channels — Offline, Online, GrabFood, GoFood, ShopeeFood
(the old stacked chart omitted Online). Colours from the existing `--tc-*` tokens / `TC` object.
Toggle is a small segmented control in the card header (same pattern as other channel toggles).

### 2. Remove the two redundant charts
Delete the `Daily GMV Trend + 7D MA` card and the old `Channel Stacked` card (and their
Chart.js builders + canvas ids `kpi-trend-chart`, `kpi-stacked-chart`). The per-day channel
info is preserved inside the Contribution card (item 1).

### 3. New Card A — "Bulan Ini vs Bulan Lalu"
Answers "are we up or down vs last month at this point?"
- **Headline delta:** cumulative GMV this calendar month-to-date vs last calendar month over
  the same day-count → `+Rp X (+Y%)` (green) or `−Rp X (−Y%)` (red), with ↑/↓ shape cue.
- **Chart:** two cumulative-GMV lines by day-of-month (1..today): this month vs last month.
  This month's line stops at today; last month drawn over the same 1..today window.
- **Calendar-month based**, independent of the date picker (deliberate — a stable MoM read).
- Data from `allData` (already the full sheet history). If last month has no rows → show a
  clean empty state ("Belum ada data bulan lalu untuk dibandingkan"), never a broken chart.

### 4. New Card B — "Sorotan" (auto insights)
Dashboard that "talks". 4–5 one-line insights with an SVG icon (NOT emoji) + semantic colour,
computed from the current KPI range's daily rows. Reuse the Race page's existing insight logic
(streak, ahead/behind ideal pace, furthest-from-target day) — adapt a compact version:
- Hari terbaik (highest daily GMV) — green.
- Hari paling jauh dari target harian — red/amber.
- Streak naik/turun ≥2 hari — up green / down amber.
- Channel dengan penurunan terbesar vs periode pembanding — amber.
- Posisi vs pace ideal (di atas/bawah) — green/red.
Each insight: small SVG icon + text; skip cleanly if its condition doesn't apply (never show
a blank or "N/A" line). Empty range → the existing `#range-empty` message covers it.

## Layout
Bottom of `#page-kpi` becomes: [Channel Contribution (full-width, with toggle)] then a 2-col
grid [Bulan Ini vs Bulan Lalu] [Sorotan]. Keep Quiet Ledger (flat, gold accent, tabular-nums).

## Constraints
- Single-file; bump `CACHE_VERSION`; update CLAUDE.md.
- Reuse `animateCounter`, `TC`/`--tc-*`, chart `baseOptions()`, `grad()` cache, `CHART_LABELS`
  aria pattern. New canvases get `role="img"` + Indonesian `aria-label`.
- `_renderedPages` dedupe respected; charts built inside `renderPage('kpi')` only.
- Every new CSS colour: dark + light variants. Reduced-motion respected.

## Files
`index.html` (KPI HTML + CSS + calcKpi/render logic), `sw.js` (cache), `CLAUDE.md`.
No backend changes.

## Open detail (confirm on review)
Per-day Channel view = stacked bar (recommended). Alternative: small per-day table. Spec
assumes stacked bar.

## Locked decisions (owner, 2026-07-04)
- Per-day Channel view = **stacked bar** (not table).
- Sorotan uses the **selected KPI date range** (default = month-to-date).
- MoM card = **calendar month** (this month 1..today vs last month 1..sameday).
- Owner taste: **premium, smooth, good chart/entrance animation** — hold this bar.
