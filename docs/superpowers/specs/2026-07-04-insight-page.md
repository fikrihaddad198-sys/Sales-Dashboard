# "Insight" Page — Deeper Behavioral Analytics

**Status:** Approved direction (owner: page name "Insight", option B, superpowers), 2026-07-04.
**Checkpoint:** create `checkpoint-pre-insight` before edits.

## Goal
One new page, **Insight**, that houses cross-cutting analytical views the existing
pages don't cover — organized into 3 themed sections so it reads as a deliberate
analytics surface, NOT a grab-bag of charts.

## Non-goals
- Not duplicating Channel / FLDT / Day-to-Day. Insight is the "why / patterns" layer.
- No backend changes (all derivable from existing `mapRow` fields).

## Data grounding (real fields from mapRow)
- Channel sales: `offline, online, gofood, grabfood, shopee`
- Channel transaction counts: `adt_store, adt_offline, adt_online, adt_gofood, adt_grabfood, adt_shopee`
- Cups & products (QTY): `cup_total, food_off, large_off, diary_off, topping_off, rtd_off, seasonal_sold, food_qty_all, rtd_qty_all`
- Product revenue (RUPIAH): `food_sales` ONLY. **RTD & Seasonal have qty only, no rupiah.**
- `ipt`, `at_store`, `at_offline`, `gmv`

## Nav + shell
- New nav item **Insight** (people/chart icon, SVG) after Compare, before owner-only Kelola Staff.
- New `<div class="page" id="page-insight">` with its own date-range picker (reuse the
  DRP pattern / `DRP_TRIGGERS`, ids `insight-start`/`insight-end`), presets included.
- Range-empty handled via `showRangeEmpty` (single-range page).
- `renderPage('insight')` builds it once per dataset (dedupe via `_renderedPages`).

## Section 1 — Perilaku Channel
**1a. Basket value per channel (ATV):** horizontal bar, 5 channels, value = `channel_sales / channel_adt`
(offline/adt_offline, online/adt_online, gofood/adt_gofood, grabfood/adt_grabfood, shopee/adt_shopee).
Channel `--tc-*` colours. Answers "who spends most per order". Sort desc. Show Rp value + trx count.
**1b. Offline vs Online (dine-in vs delivery):** Offline = `offline`; Online = `online+gofood+grabfood+shopee`.
Cumulative/daily dual line or stacked area over the range + a headline share split (Offline % vs Online %).
Answers "is delivery growing?".

## Section 2 — Produk & Upsell
**2a. Attach ratios (3 stat cards):**
- Topping per cup = `sum(topping_off) / sum(cup_total)`
- Food per transaksi = `sum(food_qty_all) / sum(adt_store)`
- RTD per transaksi = `sum(rtd_qty_all) / sum(adt_store)`
Each: big ratio value + label + short plain-language caption.
**2b. Food business health:** `food_sales` total (Rp) + Food as % of GMV (`food_sales / gmv`).
(The only product line with a rupiah figure — RTD/Seasonal excluded by data, noted in a small caption.)

## Section 3 — Pola Waktu
**3a. Performa per hari (Sen–Min):** bar chart, avg GMV per weekday across the range
(group rows by `new Date(date).getDay()`, average). Optional secondary: avg transaksi per weekday.
Answers "which day is strongest" → staffing / promo timing.

## Layout
`#page-insight`: filter bar (DRP) → Section 1 (2 cards, g2) → Section 2 (attach 3-up + food card)
→ Section 3 (full-width weekday chart). Quiet Ledger (flat, gold, tabular-nums). Section headers
use the existing `.card-hdr` style. All charts: `role="img"` + Indonesian aria-label, entry animation.

## Constraints
- Single-file; bump `CACHE_VERSION`; update CLAUDE.md (nav list, page inventory).
- Reuse: `filterData`, `aggregateData`/`sum`, `baseOptions`, `grad`, `TC`/`--tc-*`,
  `animateCounter`, DRP helpers, `showRangeEmpty`, `CHART_LABELS` aria pattern.
- Every new CSS colour: dark + light. Reduced-motion respected. Owner taste: premium + smooth.
- Numbers via `animateCounter`; charts built only inside `renderPage('insight')`.

## Honest limitation (confirm on review)
#5 "revenue per product line" is reframed to **Food-only revenue + attach ratios**, because only
`food_sales` is a rupiah figure in the data. RTD/Seasonal rupiah is NOT available.

## Files
`index.html` (nav + page HTML + CSS + render logic), `sw.js`, `CLAUDE.md`. No backend.

## Locked decisions (owner, 2026-07-04)
- Section 1b grouping = **3-way**: Offline · Online · Delivery (GrabFood+GoFood+Shopee).
- Section 2b = **Food revenue only** (Rp, food_sales) + % of GMV; RTD & Seasonal shown as
  **qty terjual** (rtd_qty_all, seasonal_sold), not rupiah.
- Page name = **Insight**. Build section-by-section, each committed + checkpoint-guarded.
