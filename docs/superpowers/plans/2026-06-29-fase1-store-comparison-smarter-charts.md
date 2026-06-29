# Fase 1: Store Comparison + Smarter Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Store Comparison page and enhance existing charts with peak/lowest markers, trend arrows, and top-channel badges.

**Architecture:** All changes go into `index.html` (single-file rule). Store Comparison page is a new `<div id="page-compare">` registered in the existing page system. Chart annotations are HTML overlays positioned relative to `.chart-wrap` containers — no new CDN dependency. Both new surfaces respect `_renderedPages` caching.

**Tech Stack:** Chart.js 4.4.1 (existing), vanilla JS, CSS custom properties (existing token system)

## Global Constraints

- Single-file rule: ALL changes go into `index.html`. No new files for UI/JS/CSS.
- Never split `index.html` into modules.
- All CSS colors must have both `:root` (dark) and `[data-theme="light"]` variants.
- Gold `#c9a84c` is the only chrome accent — do not introduce new accent colors.
- Channel colors use existing `--tc-*` tokens and JS `TC` object — keep both in sync.
- Never call `renderPage()` on every tab switch — check `_renderedPages` first.
- Never create canvas gradients outside `grad()` caching function.
- Bump `CACHE_VERSION` in `sw.js` on every deploy.
- `sessionStorage` only for auth — never `localStorage`.

---

### Task 1: Add Store Comparison nav tab + empty page shell

**Files:**
- Modify: `index.html` — nav tab list, page shell HTML, CSS for page, JS page registration

**Interfaces:**
- Produces: `#page-compare` DOM element, nav tab `data-page="compare"`, page registered in `PAGES` array (or equivalent page list used by `showPage`)

- [ ] **Step 1: Find the nav tab list and PAGES registration in index.html**

Search for the existing tab structure and `showPage` / `PAGES` to understand exact insertion points:
```bash
grep -n 'data-page\|showPage\|PAGES\s*=' index.html | head -40
```
Note the pattern — each tab has `data-page="<id>"` and there is a corresponding `<div id="page-<id>">`.

- [ ] **Step 2: Add the nav tab for Compare**

Find the last `<button` nav tab in the nav list (search for `data-page="` to locate them). Add immediately after the last tab:
```html
<button class="nav-btn" data-page="compare" onclick="showPage('compare')">
  <span class="nav-icon">⚖️</span>
  <span class="nav-label">Compare</span>
</button>
```

- [ ] **Step 3: Add the empty page shell**

Find where the other `<div id="page-...">` elements live. Add a new one in the same location:
```html
<div id="page-compare" class="page">
  <div class="page-header">
    <h2 class="page-title">Perbandingan Toko</h2>
    <p class="page-sub">Revenue, transaksi, dan channel per toko</p>
  </div>
  <div id="compare-body" class="compare-body">
    <div class="compare-empty">Belum ada data toko lain.</div>
  </div>
</div>
```

- [ ] **Step 4: Add CSS for .compare-body and .compare-empty**

Find the CSS block for `.page` styles. Add after it:
```css
.compare-body { display: flex; flex-direction: column; gap: 1.5rem; }
.compare-empty { color: var(--t3); text-align: center; padding: 3rem 1rem; font-size: 0.95rem; }
```
Add light mode variant in `[data-theme="light"]` block (values are the same CSS vars — no separate rule needed since `--t3` is already theme-aware).

- [ ] **Step 5: Verify the tab appears and clicking it shows the empty page**

Open the dashboard in a browser. Log in. Confirm the "Compare" tab is visible in the nav. Click it — `#page-compare` should become the active page showing "Belum ada data toko lain."

- [ ] **Step 6: Commit**
```bash
git add index.html
git commit -m "feat: add Store Comparison page shell and nav tab"
```

---

### Task 2: Extract store list from data + build comparison summary cards

**Files:**
- Modify: `index.html` — JS `renderPage` for compare, summary card HTML generation, CSS for `.compare-store-col` and `.compare-metric-card`

**Interfaces:**
- Consumes: existing `_data` (parsed CSV rows), existing `TC` channel color object, existing `fmt` / `fmtK` number formatters
- Produces: `renderCompare()` function, per-store revenue/transaction/AOV cards rendered into `#compare-body`

- [ ] **Step 1: Understand existing data shape**

Search for how other pages read `_data`:
```bash
grep -n '_data\[' index.html | head -20
```
Identify the field names for: store name, revenue/sales amount, transaction count, channel. Note exact property names (e.g., `r.store`, `r.channel`, `r.amount`).

- [ ] **Step 2: Write renderCompare() — data aggregation**

Find the block where other `renderPage` functions are defined (search `function renderPage` or `case 'kpi':`). Add `renderCompare()` nearby:

```javascript
function renderCompare() {
  const body = document.getElementById('compare-body');
  if (!body) return;
  const rows = (_data || []);
  if (!rows.length) { body.innerHTML = '<div class="compare-empty">Belum ada data.</div>'; return; }

  // Group by store
  const stores = {};
  rows.forEach(r => {
    const s = r.store || 'Kemang';
    if (!stores[s]) stores[s] = { revenue: 0, txn: 0, channels: {} };
    const amt = parseFloat(r.amount) || 0;
    stores[s].revenue += amt;
    stores[s].txn += 1;
    const ch = r.channel || 'other';
    stores[s].channels[ch] = (stores[s].channels[ch] || 0) + amt;
  });

  const names = Object.keys(stores);
  if (names.length < 2) {
    body.innerHTML = '<div class="compare-empty">Hanya ada 1 toko. Perbandingan tersedia saat toko kedua dibuka.</div>';
    return;
  }

  // Build summary cards row
  const maxRev = Math.max(...names.map(n => stores[n].revenue));
  const cols = names.map(name => {
    const d = stores[name];
    const aov = d.txn > 0 ? d.revenue / d.txn : 0;
    const barPct = maxRev > 0 ? (d.revenue / maxRev * 100).toFixed(1) : 0;
    return `
      <div class="compare-store-col">
        <div class="compare-store-name">${name}</div>
        <div class="compare-metric-card">
          <div class="cmc-label">Revenue</div>
          <div class="cmc-value">${fmtK(d.revenue)}</div>
          <div class="cmc-bar"><div class="cmc-bar-fill" style="width:${barPct}%"></div></div>
        </div>
        <div class="compare-metric-card">
          <div class="cmc-label">Transaksi</div>
          <div class="cmc-value">${d.txn.toLocaleString('id-ID')}</div>
        </div>
        <div class="compare-metric-card">
          <div class="cmc-label">Avg Order</div>
          <div class="cmc-value">${fmtK(aov)}</div>
        </div>
      </div>`;
  }).join('');

  body.innerHTML = `<div class="compare-cols">${cols}</div>`;
}
```

- [ ] **Step 3: Add CSS for compare layout**

```css
.compare-cols { display: flex; gap: 1rem; flex-wrap: wrap; }
.compare-store-col { flex: 1; min-width: 200px; display: flex; flex-direction: column; gap: 0.75rem; }
.compare-store-name { font-size: 1rem; font-weight: 600; color: var(--t1); padding: 0.25rem 0; border-bottom: 1px solid var(--t4); }
.compare-metric-card { background: var(--bg2); border: 1px solid var(--t4); border-radius: 10px; padding: 0.85rem 1rem; }
.cmc-label { font-size: 0.75rem; color: var(--t3); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.25rem; }
.cmc-value { font-size: 1.4rem; font-weight: 700; color: var(--t1); font-variant-numeric: tabular-nums; }
.cmc-bar { margin-top: 0.5rem; height: 4px; background: var(--bg4); border-radius: 2px; }
.cmc-bar-fill { height: 100%; background: var(--gold); border-radius: 2px; transition: width 0.6s ease; }
```

Add light mode: inside `[data-theme="light"]`, `.compare-metric-card { background: #fff; border-color: #e4e4e7; }` and `.cmc-bar { background: #e4e4e7; }`.

- [ ] **Step 4: Wire renderCompare() into the page system**

Find where `showPage` calls `renderPage(p)` or the switch/case that dispatches per-page render. Add `compare` case:
```javascript
case 'compare': renderCompare(); break;
```
Also add `'compare'` to `_renderedPages` logic so it only renders once per dataset (same pattern as other pages).

- [ ] **Step 5: Test with real data**

Open dashboard, go to Compare tab. With current single-store data, confirm "Hanya ada 1 toko" message appears. Check no console errors.

- [ ] **Step 6: Commit**
```bash
git add index.html
git commit -m "feat: store comparison summary cards (revenue, txn, AOV per store)"
```

---

### Task 3: Channel breakdown grouped bar chart on Compare page

**Files:**
- Modify: `index.html` — add `<canvas id="compare-channel-chart">` to compare page, add `renderCompareChannelChart()` JS

**Interfaces:**
- Consumes: `stores` object from `renderCompare()` aggregation (refactor: extract aggregation to `aggregateByStore()` helper), `TC` channel color object, `grad()` gradient cacher, Chart.js global
- Produces: `aggregateByStore()` helper function, grouped bar chart in `#compare-channel-chart`

- [ ] **Step 1: Extract aggregation into a helper**

In `renderCompare()`, move the rows→stores aggregation into a new function:
```javascript
function aggregateByStore(rows) {
  const stores = {};
  (rows || []).forEach(r => {
    const s = r.store || 'Kemang';
    if (!stores[s]) stores[s] = { revenue: 0, txn: 0, channels: {} };
    const amt = parseFloat(r.amount) || 0;
    stores[s].revenue += amt;
    stores[s].txn += 1;
    const ch = r.channel || 'other';
    stores[s].channels[ch] = (stores[s].channels[ch] || 0) + amt;
  });
  return stores;
}
```
Update `renderCompare()` to call `aggregateByStore(_data || [])`.

- [ ] **Step 2: Add canvas to compare page HTML**

Inside `#compare-body`, after the `<div class="compare-cols">` section, add:
```html
<div class="card">
  <div class="card-title">Revenue per Channel per Toko</div>
  <div class="chart-wrap">
    <canvas id="compare-channel-chart"></canvas>
  </div>
</div>
```

- [ ] **Step 3: Write renderCompareChannelChart()**

```javascript
function renderCompareChannelChart(stores) {
  const cv = document.getElementById('compare-channel-chart');
  if (!cv) return;
  const existing = Chart.getChart(cv);
  if (existing) existing.destroy();

  const names = Object.keys(stores);
  const channels = ['offline','online','grabfood','gofood','shopee'];
  const datasets = names.map((storeName, i) => ({
    label: storeName,
    data: channels.map(ch => stores[storeName].channels[ch] || 0),
    backgroundColor: i === 0 ? 'rgba(201,168,76,0.85)' : 'rgba(99,180,255,0.85)',
    borderRadius: 4,
  }));

  new Chart(cv, {
    type: 'bar',
    data: { labels: channels.map(ch => ch.charAt(0).toUpperCase()+ch.slice(1)), datasets },
    options: {
      ...baseOptions(),
      plugins: { legend: { display: true } },
      scales: {
        x: { ...baseOptions().scales?.x },
        y: { ...baseOptions().scales?.y, ticks: { callback: v => fmtK(v) } }
      }
    }
  });
}
```

Call `renderCompareChannelChart(stores)` at the end of `renderCompare()` (after single-store early return is bypassed).

- [ ] **Step 4: Verify chart renders**

Go to Compare tab. Confirm grouped bar chart appears. With single store, the message shows instead (no chart needed). Check chart respects dark/light theme by toggling theme.

- [ ] **Step 5: Commit**
```bash
git add index.html
git commit -m "feat: channel breakdown grouped bar chart on Compare page"
```

---

### Task 4: Smarter charts — peak/lowest markers on daily trend charts

**Files:**
- Modify: `index.html` — add `addPeakMarkers(chartId, canvasEl)` helper, call it after chart build in relevant `renderPage` functions

**Interfaces:**
- Consumes: existing Chart.js chart instances (via `Chart.getChart(canvas)`), `.chart-wrap` parent element
- Produces: `addPeakMarkers(canvas)` function that injects HTML overlay dots+labels for max and min data points

- [ ] **Step 1: Identify which charts show daily trend**

```bash
grep -n 'daily\|trend\|tren\|harian' index.html | grep -i 'canvas\|chart\|id=' | head -20
```
Note the canvas IDs for daily trend charts (e.g., `#sales-trend-chart`, `#daily-chart`).

- [ ] **Step 2: Write addPeakMarkers()**

```javascript
function addPeakMarkers(canvas) {
  const chart = Chart.getChart(canvas);
  if (!chart) return;
  const wrap = canvas.closest('.chart-wrap');
  if (!wrap) return;
  // Remove old markers
  wrap.querySelectorAll('.peak-marker').forEach(el => el.remove());

  const ds = chart.data.datasets[0];
  if (!ds || !ds.data.length) return;
  const vals = ds.data.map(Number);
  const maxVal = Math.max(...vals);
  const minVal = Math.min(...vals);
  const maxIdx = vals.indexOf(maxVal);
  const minIdx = vals.indexOf(minVal);

  [{ idx: maxIdx, val: maxVal, cls: 'peak-high', label: '▲ ' + fmtK(maxVal) },
   { idx: minIdx, val: minVal, cls: 'peak-low',  label: '▼ ' + fmtK(minVal) }]
  .forEach(({ idx, cls, label }) => {
    const meta = chart.getDatasetMeta(0);
    if (!meta.data[idx]) return;
    const pt = meta.data[idx].getCenterPoint();
    const el = document.createElement('div');
    el.className = `peak-marker ${cls}`;
    el.textContent = label;
    el.style.left = pt.x + 'px';
    el.style.top  = pt.y + 'px';
    wrap.appendChild(el);
  });
}
```

- [ ] **Step 3: Add CSS for peak markers**

```css
.chart-wrap { position: relative; }
.peak-marker {
  position: absolute;
  transform: translate(-50%, -130%);
  font-size: 0.68rem;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  pointer-events: none;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.peak-high { background: rgba(201,168,76,0.18); color: var(--gold); border: 1px solid var(--gold); }
.peak-low  { background: rgba(248,113,113,0.12); color: var(--red); border: 1px solid var(--red); }
```

Light mode inside `[data-theme="light"]`:
```css
.peak-high { background: rgba(201,168,76,0.12); }
.peak-low  { background: rgba(248,113,113,0.08); }
```

- [ ] **Step 4: Call addPeakMarkers() after each daily trend chart build**

Find the `new Chart(...)` calls for daily trend canvases identified in Step 1. After each `new Chart(...)` call, add:
```javascript
requestAnimationFrame(() => addPeakMarkers(cv));
```
(`requestAnimationFrame` ensures Chart.js has finished computing pixel positions before we read them.)

- [ ] **Step 5: Handle chart replay (replayPageCharts)**

Find `replayPageCharts`. After `chart.update()` for each canvas, add:
```javascript
requestAnimationFrame(() => addPeakMarkers(cv));
```

- [ ] **Step 6: Verify markers appear**

Open dashboard → Sales page (or whichever has daily trend). Confirm ▲ and ▼ labels appear above peak and below trough points. Toggle theme — verify colors change. Resize window — markers may not reposition (acceptable for v1).

- [ ] **Step 7: Commit**
```bash
git add index.html
git commit -m "feat: peak/lowest markers on daily trend charts"
```

---

### Task 5: Smarter charts — top channel badge

**Files:**
- Modify: `index.html` — add `addTopChannelBadge(wrapEl, channelName)` helper, call after channel breakdown chart build

**Interfaces:**
- Consumes: existing channel breakdown chart canvas, `TC` object for channel colors
- Produces: `.top-channel-badge` element injected into the card containing the channel chart

- [ ] **Step 1: Find channel breakdown chart canvas ID**

```bash
grep -n 'channel\|saluran' index.html | grep 'canvas\|id=' | head -20
```
Note the canvas ID (e.g., `#channel-chart`).

- [ ] **Step 2: Write addTopChannelBadge()**

```javascript
function addTopChannelBadge(canvas) {
  const chart = Chart.getChart(canvas);
  if (!chart) return;
  const card = canvas.closest('.card');
  if (!card) return;
  card.querySelectorAll('.top-channel-badge').forEach(el => el.remove());

  // Find dataset with highest total
  const labels = chart.data.labels || [];
  const totals = labels.map((_, i) =>
    chart.data.datasets.reduce((s, ds) => s + (Number(ds.data[i]) || 0), 0)
  );
  const maxIdx = totals.indexOf(Math.max(...totals));
  if (maxIdx < 0) return;

  const topLabel = labels[maxIdx];
  const topKey = topLabel.toLowerCase();
  const color = (TC && TC[topKey]) ? TC[topKey] : 'var(--gold)';

  const badge = document.createElement('div');
  badge.className = 'top-channel-badge';
  badge.innerHTML = `<span class="tcb-dot" style="background:${color}"></span> <span>${topLabel}</span> <span class="tcb-text">terbaik bulan ini</span>`;

  const title = card.querySelector('.card-title');
  if (title) title.appendChild(badge);
  else card.prepend(badge);
}
```

- [ ] **Step 3: Add CSS**

```css
.top-channel-badge {
  display: inline-flex; align-items: center; gap: 0.35rem;
  font-size: 0.72rem; font-weight: 500;
  background: var(--bg3); border: 1px solid var(--t4);
  border-radius: 99px; padding: 2px 8px;
  margin-left: 0.75rem; vertical-align: middle;
  color: var(--t2);
}
.tcb-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
.tcb-text { color: var(--t3); }
```

Light mode: `.top-channel-badge { background: #f4f4f5; border-color: #d4d4d8; }` inside `[data-theme="light"]`.

- [ ] **Step 4: Call after channel chart build and on replay**

After the `new Chart(...)` for the channel breakdown canvas:
```javascript
requestAnimationFrame(() => addTopChannelBadge(cv));
```
And in `replayPageCharts` after `chart.update()` for that canvas:
```javascript
requestAnimationFrame(() => addTopChannelBadge(cv));
```

- [ ] **Step 5: Verify badge appears**

Open Channel page. Confirm a small pill badge like "• GrabFood terbaik bulan ini" appears next to the card title. Toggle theme — verify it stays readable.

- [ ] **Step 6: Bump cache version and commit**

In `sw.js`, increment `CACHE_VERSION` (e.g., `fore-v73` → `fore-v74`).

```bash
git add index.html sw.js
git commit -m "feat: top channel badge on channel breakdown chart; bump cache fore-v74"
```

---

## Self-Review

**Spec coverage check:**
- Store Comparison page: ✅ Task 1 (shell) + Task 2 (cards) + Task 3 (chart)
- Locked stores shown as greyed placeholder: ⚠️ Partially — Task 2 handles single-store case but doesn't explicitly render locked store columns. Acceptable for v1 since locked stores have no data rows; the "Hanya ada 1 toko" message covers this.
- Daily trend multi-line per store: ❌ Not included — requires a daily-trend-per-store chart. Added as Task 3B below.
- Peak/lowest markers: ✅ Task 4
- Top-channel badge: ✅ Task 5
- Trend arrow on KPI cards: ⚠️ Spec mentions extending trend arrows to all KPIs. Deferred — existing `sc` sub-label already handles this partially; a full pass is a separate small task.
- `_renderedPages` cache: ✅ Task 2 Step 4
- Theme support: ✅ All tasks include light mode variants
- SW cache bump: ✅ Task 5 Step 6

**Placeholder scan:** None found.

**Type consistency:** `aggregateByStore()` defined in Task 3 Step 1 and consumed in Tasks 2 and 3. `addPeakMarkers(canvas)` and `addTopChannelBadge(canvas)` both take a canvas element — consistent.

---

### Task 3B: Daily trend per-store line chart on Compare page

**Files:**
- Modify: `index.html` — add `<canvas id="compare-trend-chart">`, add `renderCompareTrendChart(stores, rows)` JS

**Interfaces:**
- Consumes: `aggregateByStore()` result, raw `_data` rows with date field, `baseOptions()`, Chart.js
- Produces: multi-line chart in `#compare-trend-chart`, one line per store, x-axis = date

- [ ] **Step 1: Find date field name in data rows**

```bash
grep -n 'r\.date\|r\.tanggal\|\.date\b' index.html | head -10
```
Note the exact field name (e.g., `r.date` or `r.tanggal`).

- [ ] **Step 2: Add canvas to compare page**

Inside `#compare-body`, after the channel chart card, add:
```html
<div class="card">
  <div class="card-title">Tren Revenue Harian per Toko</div>
  <div class="chart-wrap">
    <canvas id="compare-trend-chart"></canvas>
  </div>
</div>
```

- [ ] **Step 3: Write renderCompareTrendChart()**

```javascript
function renderCompareTrendChart(stores, rows) {
  const cv = document.getElementById('compare-trend-chart');
  if (!cv) return;
  const existing = Chart.getChart(cv);
  if (existing) existing.destroy();

  const names = Object.keys(stores);
  // Gather all unique dates, sorted
  const allDates = [...new Set((rows||[]).map(r => r.date || r.tanggal || ''))].filter(Boolean).sort();

  // Per store, per date revenue
  const storeByDate = {};
  names.forEach(n => { storeByDate[n] = {}; });
  (rows||[]).forEach(r => {
    const s = r.store || 'Kemang';
    const d = r.date || r.tanggal || '';
    if (!d || !storeByDate[s]) return;
    storeByDate[s][d] = (storeByDate[s][d] || 0) + (parseFloat(r.amount) || 0);
  });

  const colors = ['#c9a84c', '#63b4ff', '#a78bfa', '#34d399'];
  const datasets = names.map((name, i) => ({
    label: name,
    data: allDates.map(d => storeByDate[name][d] || 0),
    borderColor: colors[i % colors.length],
    backgroundColor: 'transparent',
    tension: 0.3,
    pointRadius: 2,
  }));

  new Chart(cv, {
    type: 'line',
    data: { labels: allDates, datasets },
    options: {
      ...baseOptions(),
      plugins: { legend: { display: true } },
      scales: {
        x: { ...(baseOptions().scales?.x || {}) },
        y: { ...(baseOptions().scales?.y || {}), ticks: { callback: v => fmtK(v) } }
      }
    }
  });
}
```

- [ ] **Step 4: Call from renderCompare()**

At the end of `renderCompare()` (after single-store early return), add:
```javascript
renderCompareTrendChart(stores, _data || []);
```

- [ ] **Step 5: Verify**

Compare tab now shows three sections: summary cards, channel chart, daily trend chart. With one store, shows the single-store message (charts not rendered). Check console for errors.

- [ ] **Step 6: Commit**
```bash
git add index.html
git commit -m "feat: daily trend per-store line chart on Compare page"
```
