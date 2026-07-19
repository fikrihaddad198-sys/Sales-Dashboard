# Comparison Page Dynamic Period Labels — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the "Week to Week" nav item to "Comparison" and make every period label on `#page-period` (and the FLDT cup card) reflect the actually-selected date ranges instead of hardcoded week names.

**Architecture:** One pure helper `periodLabels()` reads the three shared range inputs and returns truthful labels (week names only when the ranges really are 3 aligned consecutive weeks; otherwise date ranges). A tiny `refreshPeriodLabels()` applies them to static DOM (card headings, compare-card titles) via `textContent`; the chart/table builders (`buildWeeklyTrend`, `buildWeeklySummary`, `buildCagrTable`, `renderFldtWeekly`) read `periodLabels()` at build time. No data-flow or perf-invariant changes.

**Tech Stack:** Vanilla JS inside the single-file `index.html` (~8000 lines). No test framework — verification is grep + a scratch Node check for the pure logic + the owner's manual browser checklist.

**Spec:** `docs/superpowers/specs/2026-07-19-comparison-dynamic-labels-design.md`

## Global Constraints

- Single-file rule: all changes to app code go in `index.html` — never split files.
- Bump `sw.js` `CACHE_VERSION`: `fore-v118` → `fore-v119` (standing rule 1).
- Update `CLAUDE.md` in the same work (standing rule 9).
- Label refresh must be `textContent` only on static DOM — never `innerHTML` rebuilds, never `renderPage()` calls (perf rules).
- Indonesian label copy exactly: `2 Minggu Lalu` / `1 Minggu Lalu` / `Minggu Ini`; fallback `Periode 1/2/3`; short forms `W-2/W-1/W0` and `P1/P2/P3`.
- Existing helpers to reuse (already defined near index.html:5329–5379, do NOT redefine): `HARI`, `fmtShortDate(s)` (returns `dd/mm`), `toInputDate(d)` (returns `yyyy-mm-dd`), `getVal(id)`.
- **Deviation from spec (approved reasoning):** the FLDT cup-card title is set from `renderFldtWeekly()` (build time), NOT from `refreshPeriodLabels()` — `fldtData[1..3]` is built once and never invalidated on range change (pre-existing), so a live label would describe data the FLDT charts aren't showing.

---

### Task 1: Rename nav "Week to Week" → "Comparison"

**Files:**
- Modify: `index.html` (nav button ~line 4534; two comments ~lines 1652 and 9292)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing later tasks rely on (pure copy change).

- [ ] **Step 1: Edit the nav button label + aria-label**

In `index.html`, find:

```html
<button class="nav-btn" data-page="period" onclick="showPage('period',this)" aria-label="Week to Week">
```

Replace `aria-label="Week to Week"` with `aria-label="Comparison"`.

On the next line, find `<span class="nav-label">Week to Week</span>` and replace with `<span class="nav-label">Comparison</span>`.

- [ ] **Step 2: Update the two stale comments**

Near line 1652, in the CSS comment `~27 of these on Week to Week` → `~27 of these on Comparison`.
Near line 9292, in the JS comment `Week to Week ps-cards` → `Comparison ps-cards`.

- [ ] **Step 3: Verify no stray occurrences**

Run: `grep -n "Week to Week" index.html`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "rename: nav 'Week to Week' -> 'Comparison'"
```

---

### Task 2: Add `periodLabels()` + `refreshPeriodLabels()` and span hooks

**Files:**
- Modify: `index.html` — new functions directly above `function setPeriodMode(m){` (~line 6987); span hooks in static HTML (~lines 4796–4797 and ~4877); call site at top of `loadPeriod` (~line 7004).

**Interfaces:**
- Consumes: `getVal`, `toInputDate`, `fmtShortDate` (existing globals).
- Produces (later tasks rely on these exact shapes):
  - `periodLabels()` → `{ weekly:boolean, long:[string,string,string], short:[string,string,string], title:[string,string,string] }` — index 0 = range1 (oldest), index 2 = range3 (newest).
  - `refreshPeriodLabels()` → void; safe to call any time (null-guards every element).
  - DOM ids: `compare-w32-title`, `compare-w31-title`, `fldt-cup-title`.

- [ ] **Step 1: Add span hooks to static HTML**

Find (one line, ~4796):

```html
<div class="card reveal"><div class="card-hdr"><div class="card-hdr-dot"></div>Minggu Ini vs 1 Minggu Lalu</div><div id="compare-w32"></div></div>
```

Replace the header text with a span:

```html
<div class="card reveal"><div class="card-hdr"><div class="card-hdr-dot"></div><span id="compare-w32-title">Minggu Ini vs 1 Minggu Lalu</span></div><div id="compare-w32"></div></div>
```

Same on the next line for `compare-w31`:

```html
<div class="card reveal reveal-delay-1"><div class="card-hdr"><div class="card-hdr-dot"></div><span id="compare-w31-title">Minggu Ini vs 2 Minggu Lalu</span></div><div id="compare-w31"></div></div>
```

And the FLDT cup card (~4877):

```html
<div class="card reveal reveal-delay-1"><div class="card-hdr"><div class="card-hdr-dot"></div><span id="fldt-cup-title">Komposisi Cup — Minggu Ini</span></div><div class="chart-wrap h240"><canvas id="fldt-doughnut"></canvas></div></div>
```

- [ ] **Step 2: Add the two functions**

Insert directly above `function setPeriodMode(m){`:

```javascript
/* Truthful labels for the 3 Comparison ranges. Week names ONLY when the
   ranges really are 3 aligned consecutive weeks anchored on the current
   calendar week (exactly the setDefaultDates pattern); otherwise the real
   date ranges. Index 0 = range1 (oldest) … index 2 = range3 (newest). */
function periodLabels(){
  const r=[1,2,3].map(n=>({s:getVal('range'+n+'s'),e:getVal('range'+n+'e')}));
  const shift=(iso,days)=>{ if(!iso)return''; const[y,m,d]=iso.split('-').map(Number); const dt=new Date(y,m-1,d); dt.setDate(dt.getDate()+days); return toInputDate(dt); };
  const now=new Date(), dow=now.getDay(), diffToMon=dow===0?-6:1-dow;
  const mon=new Date(now); mon.setDate(now.getDate()+diffToMon);
  const weekly = !!(r[2].s&&r[2].e) && r[2].s===toInputDate(mon)
    && r[1].s===shift(r[2].s,-7)  && r[1].e===shift(r[2].e,-7)
    && r[0].s===shift(r[2].s,-14) && r[0].e===shift(r[2].e,-14);
  if(weekly) return { weekly:true,
    long:['2 Minggu Lalu','1 Minggu Lalu','Minggu Ini'],
    short:['W-2','W-1','W0'], title:['','',''] };
  const range=x=>{ if(!x.s||!x.e) return null; const a=fmtShortDate(x.s), b=fmtShortDate(x.e); return a===b?a:a+'–'+b; };
  return { weekly:false,
    long:r.map((x,i)=>range(x)||('Periode '+(i+1))),
    short:['P1','P2','P3'],
    title:r.map(x=>range(x)||'') };
}
function refreshPeriodLabels(){
  const L=periodLabels();
  document.querySelectorAll('#weekly-mode .period-heading').forEach((el,i)=>{ el.textContent=L.long[i]; });
  const t32=document.getElementById('compare-w32-title'); if(t32) t32.textContent=L.long[2]+' vs '+L.long[1];
  const t31=document.getElementById('compare-w31-title'); if(t31) t31.textContent=L.long[2]+' vs '+L.long[0];
}
```

(Note: `#weekly-mode` scoping matters — the Custom mode cards also use `.period-heading` and must stay "Periode 1/2".)

- [ ] **Step 3: Call it from `loadPeriod`**

Find:

```javascript
function loadPeriod(n){
  const s=getVal('range'+n+'s'), e=getVal('range'+n+'e');
```

Insert `refreshPeriodLabels();` as the first statement:

```javascript
function loadPeriod(n){
  refreshPeriodLabels();
  const s=getVal('range'+n+'s'), e=getVal('range'+n+'e');
```

(`loadPeriod(n)` is already wired to every range change via `DRP_TRIGGERS` at ~7965 and to page init/theme rebuild via `initPeriodPage` — no other call sites needed.)

- [ ] **Step 4: Scratch-verify the detection logic in Node**

Write `/tmp/claude-0/-home-user-Sales-Dashboard/a0567894-3e3e-5293-8722-ee3a6c1be5ef/scratchpad/test-period-labels.js` with the function pasted plus stubs, and assertions:

```javascript
// stubs matching index.html
const toInputDate=d=>{const dd=String(d.getDate()).padStart(2,'0'),mm=String(d.getMonth()+1).padStart(2,'0');return`${d.getFullYear()}-${mm}-${dd}`;};
const fmtShortDate=s=>{if(!s)return'—';const[y,m,d]=s.split('-').map(Number);const dt=new Date(y,m-1,d);return String(dt.getDate()).padStart(2,'0')+'/'+String(dt.getMonth()+1).padStart(2,'0');};
let VALS={}; const getVal=id=>VALS[id]||'';
// >>> paste periodLabels() from index.html here verbatim <<<

// helpers to build the default weekly pattern (mirror of setDefaultDates)
const now=new Date(), dow=now.getDay(), diffToMon=dow===0?-6:1-dow;
const mon=new Date(now); mon.setDate(now.getDate()+diffToMon);
const yest=new Date(now); yest.setDate(now.getDate()-1);
const sh=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x;};
VALS={range3s:toInputDate(mon),range3e:toInputDate(yest),
      range2s:toInputDate(sh(mon,-7)),range2e:toInputDate(sh(yest,-7)),
      range1s:toInputDate(sh(mon,-14)),range1e:toInputDate(sh(yest,-14))};
let L=periodLabels();
console.assert(L.weekly===true,'defaults must be weekly, got',L);
console.assert(L.long[2]==='Minggu Ini'&&L.short[0]==='W-2','weekly labels');

VALS.range1s='2026-06-01'; VALS.range1e='2026-06-07';   // week of last month
L=periodLabels();
console.assert(L.weekly===false,'shifted range1 must break weekly');
console.assert(L.long[0]==='01/06–07/06','date label, got '+L.long[0]);
console.assert(L.long[2].includes('/'),'range3 becomes dates too');

VALS.range2s=''; VALS.range2e='';                        // empty slot
L=periodLabels();
console.assert(L.long[1]==='Periode 2','empty fallback, got '+L.long[1]);
console.log('ALL PASS');
```

Run: `node <scratchpad>/test-period-labels.js`
Expected: `ALL PASS` (and no assertion output).

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(comparison): truthful dynamic period labels (headings + compare titles)"
```

---

### Task 3: Feed dynamic labels into the chart/table builders

**Files:**
- Modify: `index.html` — `buildWeeklySummary` (~7048), `buildWeeklyTrend` (~7057), `buildCagrTable` (~7081), `renderFldtWeekly` (~7155), `CHART_LABELS` (~6023).

**Interfaces:**
- Consumes: `periodLabels()` from Task 2 (`{weekly, long[3], short[3], title[3]}`), DOM id `fldt-cup-title` from Task 2.
- Produces: nothing new.

- [ ] **Step 1: `buildWeeklySummary` — pass labels to the compare tables**

Replace:

```javascript
  buildCompareTable('compare-w32',periodData[3],periodData[2],'Minggu Ini','1 Minggu Lalu');
  buildCompareTable('compare-w31',periodData[3],periodData[1],'Minggu Ini','2 Minggu Lalu');
```

with:

```javascript
  const L=periodLabels();
  buildCompareTable('compare-w32',periodData[3],periodData[2],L.long[2],L.long[1]);
  buildCompareTable('compare-w31',periodData[3],periodData[1],L.long[2],L.long[0]);
```

(`buildCompareTable` already takes `lCurr`/`lPrev` — no change to it.)

- [ ] **Step 2: `buildWeeklyTrend` — dynamic dataset labels**

Inside `buildWeeklyTrend`, after `const k=_weeklyChan;` add:

```javascript
  const L=periodLabels();
```

Then in the three datasets replace the hardcoded `label:` values:
- `label:'2 Minggu Lalu'` → `label:L.long[0]`
- `label:'1 Minggu Lalu'` → `label:L.long[1]`
- `label:'Minggu Ini'` → `label:L.long[2]`

- [ ] **Step 3: `buildCagrTable` — dynamic `<th>` headers**

At the top of `buildCagrTable` (after the guard line) add `const L=periodLabels();`, then replace the `<thead>` template line:

```javascript
  document.getElementById('cagr-table').innerHTML=`<div class="tbl-wrap"><table><thead><tr><th>Metrik</th><th>W-2</th><th>W-1</th><th>W0</th><th>W-2→W-1</th><th>W-1→W0</th><th>2W CAGR</th></tr></thead><tbody>${rows}</tbody></table></div>`;
```

with:

```javascript
  document.getElementById('cagr-table').innerHTML=`<div class="tbl-wrap"><table><thead><tr><th>Metrik</th><th title="${L.title[0]}">${L.short[0]}</th><th title="${L.title[1]}">${L.short[1]}</th><th title="${L.title[2]}">${L.short[2]}</th><th>${L.short[0]}→${L.short[1]}</th><th>${L.short[1]}→${L.short[2]}</th><th>${L.weekly?'2W CAGR':'CAGR'}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
```

- [ ] **Step 4: `renderFldtWeekly` — set the cup-card title at build time**

At the top of `renderFldtWeekly`, after the `if(!p1||!p2||!p3) return;` guard, add:

```javascript
  const cupT=document.getElementById('fldt-cup-title'); if(cupT) cupT.textContent='Komposisi Cup — '+periodLabels().long[2];
```

(Deliberately NOT in `refreshPeriodLabels` — see Global Constraints deviation note.)

- [ ] **Step 5: Fix the weekly-trend aria label**

In `CHART_LABELS` (~6023) replace `'weekly-trend-chart':'Grafik tren GMV mingguan'` with `'weekly-trend-chart':'Grafik tren GMV 3 periode'`.

- [ ] **Step 6: Verify no hardcoded week labels remain in JS**

Run: `grep -n "Minggu Lalu" index.html`
Expected: matches remain ONLY in (a) the label array inside `periodLabels()` itself, and (b) the static HTML defaults that get overwritten at runtime (the 3 `.period-heading` divs and the 2 `compare-w3x-title` spans). There must be NO match left inside `buildWeeklyTrend`, `buildWeeklySummary`, or `buildCagrTable`.

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat(comparison): dynamic labels in trend legend, compare tables, CAGR headers, FLDT cup card"
```

---

### Task 4: Housekeeping — service worker bump + CLAUDE.md

**Files:**
- Modify: `sw.js` (CACHE_VERSION), `CLAUDE.md` (nav name + label behavior).

**Interfaces:**
- Consumes: nothing. Produces: nothing.

- [ ] **Step 1: Bump the cache version**

In `sw.js` replace `fore-v118` with `fore-v119`.

- [ ] **Step 2: Update CLAUDE.md**

- In the sw section: `Currently \`fore-v118\`` → `Currently \`fore-v119\`` (and the standing-rule example `fore-v118\` → increment to \`fore-v119\`` → `fore-v119\` → increment to \`fore-v120\``).
- Add to the Navigation or a fitting section a short paragraph:

```markdown
**Comparison page labels (`#page-period`)**: nav item is "Comparison" (was
"Week to Week"). Weekly-mode labels are dynamic via `periodLabels()`: week
names ("Minggu Ini" etc. / W-2 W-1 W0) appear ONLY when the 3 ranges are 3
aligned consecutive weeks anchored on the current calendar week; otherwise
every label (card headings, trend legend, compare titles/tables, CAGR `<th>`)
shows the real date range (P1/P2/P3 short forms). `refreshPeriodLabels()`
runs from `loadPeriod()`; the FLDT "Komposisi Cup" title is set in
`renderFldtWeekly()` at build time because `fldtData` is never invalidated
on range change (pre-existing) — don't move it to the live refresh.
```

- [ ] **Step 3: Commit + push**

```bash
git add sw.js CLAUDE.md
git commit -m "chore: bump sw cache to fore-v119, document dynamic Comparison labels"
git push -u origin claude/dashboard-progress-03l2eq
```

---

## Owner manual verification checklist (after deploy)

1. Fresh load, defaults → week labels everywhere ("Minggu Ini", W0, …); nav shows "Comparison".
2. Change any one range → all labels flip to `dd/mm–dd/mm` dates in sync (cards, legend, compare titles+tables, CAGR).
3. Re-pick the exact default weeks → week labels return.
4. Empty a range → that slot reads "Periode n".
5. FLDT page: cup card title matches the data FLDT actually shows.
6. Dark + light theme swap → labels survive the rebuild.
