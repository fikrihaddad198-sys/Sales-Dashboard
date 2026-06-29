# Dashboard Improvements Design
Date: 2026-06-29

## Overview

Two-phase improvement to the Fore Coffee Sales Dashboard:
- **Fase 1:** Store Comparison page + smarter charts
- **Fase 2:** Navigation overhaul

Target users: owner (Fikri) primarily, with future store managers and staff in mind as more stores open.

---

## Fase 1: Store Comparison + Smarter Charts

### 1A. Store Comparison Page

A new dashboard page (`#page-compare`) that displays side-by-side performance metrics across all Fore Coffee store locations.

**Layout:**
- Header row: store selector chips (Kemang + future stores)
- Comparison cards: Revenue, Transactions, Avg Order Value — one column per store
- Channel breakdown chart: grouped bar chart, each group = one channel, bars = stores
- Daily trend chart: multi-line chart, one line per store

**Data source:** Same GAS `data` endpoint (existing CSV). Store column already exists in the data. The page filters and groups by store name.

**Locked stores:** Shown as greyed-out columns with "Belum ada data" placeholder — consistent with map locked-store treatment.

**Success criteria:**
- User can see revenue of Kemang vs other stores at a glance
- Channel performance per store visible in one chart
- Page renders within same performance budget as other pages (uses `_renderedPages` cache)

---

### 1B. Smarter Charts

Enhance existing charts on KPI, Sales, and Channel pages with contextual annotations:

- **Trend arrow** on KPI cards: ↑↓ with % change vs previous period (already partially exists via `sc` sub-label — extend to all major KPIs)
- **Peak/lowest markers** on daily trend charts: small dot + label at highest and lowest point of the visible range
- **Inline insight label** on channel breakdown: auto-label the top-performing channel with a small badge ("Terbaik bulan ini")

**Implementation constraint:** Annotations must use Chart.js annotation plugin OR be drawn as HTML overlays — no third-party lib additions. Prefer HTML overlays (simpler, no new CDN dependency).

**Success criteria:**
- At a glance, user knows which day was best/worst and which channel dominates
- No performance regression (annotations computed once per render, cached in `_renderedPages`)

---

## Fase 2: Navigation Overhaul

### Goals
- Clear visual indicator of current page
- Fast path between pages (shortcuts + swipe)
- Smooth page transitions (no jank)

### Layout

**Mobile (< 768px):** Bottom tab bar replacing or augmenting the current top nav. Tabs show icon + label for the 4-5 most-used pages. "More" overflow for secondary pages.

**Desktop (≥ 768px):** Collapsible left sidebar. Collapsed = icons only. Expanded = icons + labels. State persisted in `sessionStorage`.

### Transitions
- Page swap: current slide-fade (`page-swap-in`) kept but tuned — opacity + subtle translateY(4px), duration 180ms. No full translate (causes canvas rasterize shake — known issue per CLAUDE.md).
- Tab switch feedback: immediate visual (active state), then content fades in. No delay before active state updates.

### Quick-jump
- Keyboard shortcuts: `1`–`5` jump to main pages (only when not focused in an input)
- Swipe left/right on mobile: navigate to prev/next page in tab order

### Success criteria
- User always knows which page they're on
- Moving between any two pages feels instant (< 100ms perceived)
- No regression on `_renderedPages` caching or chart replay

---

## Architecture Notes

- **Single-file rule respected:** All changes go into `index.html` (CSS + JS + HTML). No new files for UI.
- **`_renderedPages` cache:** Store Comparison page participates — renders once per dataset, replays charts on revisit.
- **Theme support:** All new colors use existing CSS vars (`--bg2`, `--t1`, `--tc-*`). Both dark and light variants required.
- **No new accent colors:** Channel identity uses existing `--tc-*` tokens. Gold `#c9a84c` remains the single chrome accent.
- **SW cache:** Bump `CACHE_VERSION` on every deploy.

---

## Out of Scope

- Multi-user role management (future)
- Real-time data push (GAS polling is sufficient for now)
- Chart library upgrade (Chart.js 4.4.1 stays)
- Splitting index.html into modules (explicit user rule)
