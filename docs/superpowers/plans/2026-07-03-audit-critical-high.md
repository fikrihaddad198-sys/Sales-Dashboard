# Audit Critical + High Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline). Subagent-driven is NOT used here — the whole app is one file (`index.html`), so parallel implementers would collide. Steps use checkbox (`- [ ]`) tracking.

**Goal:** Close the Critical + High items from the 2026-07-03 design audit without a rewrite.

**Architecture:** Single-file vanilla PWA. All CSS in one `<style>`, all JS in `<script>`s inside `index.html` (9,238 lines). No build step, no test runner — **verification is manual in the browser + `grep` assertions on source**. Both dark (`:root`) and light (`[data-theme="light"]`) themes are mandatory for every colour rule.

**Tech Stack:** HTML/CSS/JS, Chart.js 4.4.1. Service worker `sw.js` (`CACHE_VERSION`, currently `fore-v106`).

## Global Constraints

- Never split `index.html` (per CLAUDE.md).
- Every new colour token/rule needs BOTH `:root` and `[data-theme="light"]` values.
- Bump `sw.js` `CACHE_VERSION` once at the end (single deploy) — `fore-v106` → `fore-v107`.
- No new runtime dependencies. Toast/skeleton/error use existing patterns.
- Commit per task; each commit ends `Co-Authored-By: Claude Opus 4.8` + Claude-Session trailer, then `git commit --amend --no-edit --reset-author` for verified signature.
- Verification is manual (no framework): a task "passes" when the stated `grep` check matches AND the described browser behaviour holds.

---

### Task 1: Design tokens — `--success` + typography scale

**Files:** Modify `index.html` `:root` block (~L115–151) and `[data-theme="light"]` block (~L152–197).

**Interfaces — Produces:** CSS vars used by every later task:
`--success`, `--success-10`, `--fs-caption`, `--fs-label`, `--fs-body`, `--fs-data`, `--fs-h3`, `--fs-h2`, `--fs-hero`, `--lh-tight`, `--lh-body`.

- [ ] **Step 1: Add success + type tokens to `:root`** (after the radius/spacing tokens, before `--ease-out`):

```css
/* Semantic success — green, distinct from the gold accent (audit §2) */
--success:    #4a9d68;
--success-10: rgba(74,157,104,0.12);
--success-20: rgba(74,157,104,0.22);

/* Typography scale (audit §4). 12px floor — nothing below this for real content. */
--fs-caption: 12px;   /* smallest allowed: dense labels, table sub-text */
--fs-label:   13px;   /* field labels, chips */
--fs-body:    14px;   /* default body/UI */
--fs-data:    15px;   /* metric values in rows */
--fs-h3:      18px;
--fs-h2:      22px;
--fs-hero:    clamp(30px, 4vw, 44px);
--lh-tight:   1.2;
--lh-body:    1.55;
```

- [ ] **Step 2: Add light-mode success** to `[data-theme="light"]` (type tokens are theme-agnostic — only colour needs a light variant):

```css
--success:    #2f8f57;
--success-10: rgba(47,143,87,0.12);
--success-20: rgba(47,143,87,0.20);
```

- [ ] **Step 3: Verify**
Run: `grep -n "\-\-fs-body\|\-\-success:" index.html`
Expected: 3 matches (`--fs-body` once, `--success:` in both themes). No visual change yet.

- [ ] **Step 4: Commit** `feat(tokens): add --success semantic + --fs-* typography scale`

---

### Task 2: Enforce the 12px type floor

**Files:** Modify `index.html` — every CSS `font-size` below 12px, and inline `font-size` in JS-built markup (notably `renderD2D` L6565–6590, `pFmt` badges).

**Interfaces — Consumes:** `--fs-*` from Task 1.

**Context:** `grep -oE "font-size: ?[0-9.]+px" index.html | sort | uniq -c` shows sizes 7,8,9,9.5,10,11,11.5px in heavy use. Floor = 12px. Where a value is clearly a data label, map to `var(--fs-caption)`; where body, `var(--fs-body)`.

- [ ] **Step 1: List every sub-12px occurrence**
Run: `grep -nE "font-size: ?(7|8|9|9\.5|10|10\.5|11|11\.5)(px)?[^0-9]" index.html`
Record the line numbers.

- [ ] **Step 2: Raise CSS rules** — for each match in the `<style>` block, replace the raw value with the nearest scale token (`≤12 → var(--fs-caption)`, `13 → var(--fs-label)`). Do NOT touch `--tc-*`/opacity/other numeric props — only `font-size`.

- [ ] **Step 3: Raise inline JS font-sizes** in `renderD2D`/`pFmt` (e.g. `font-size:9px` group headers, `font-size:10px` Δ badges, `font-size:11px` table) → `12px` minimum. Keep them literal px (they're in template strings) but never below 12.

- [ ] **Step 4: Verify no sub-12px remains**
Run: `grep -nE "font-size: ?(7|8|9|10|11)(px|;)" index.html`
Expected: **0 matches** (allowing `1[2-9]`, `2x`, etc. to remain).

- [ ] **Step 5: Browser check** — dark + light, KPI + Day-to-Day + All Summary: text is legible, no overflow/clipping introduced by the larger type. Fix any wrap/overflow with existing layout (not by shrinking font back).

- [ ] **Step 6: Commit** `refactor(type): enforce 12px floor across CSS + JS-built markup`

---

### Task 3: Toast system (replace `alert()`)

**Files:** Modify `index.html`. Reuse the `.mr-joke` visual language (L3078–3090). Add a generic `#toast-host` + `toast()` helper. Replace the 6 `alert()` sites: L6616, L6618, L6633, L6731, L9127, L9178.

**Interfaces — Produces:** `toast(msg, type)` where `type ∈ {'info','error','success'}`.

- [ ] **Step 1: Add toast CSS** (near `.mr-joke`), both themes:

```css
#toast-host{position:fixed;left:50%;bottom:calc(74px + env(safe-area-inset-bottom,0));
  transform:translateX(-50%);z-index:10050;display:flex;flex-direction:column;gap:8px;
  pointer-events:none;width:max-content;max-width:min(92vw,420px)}
.toast{background:var(--bg2);border:1px solid var(--border-md);border-radius:12px;
  padding:11px 15px;font-size:var(--fs-body);color:var(--t1);box-shadow:var(--e3);
  opacity:0;transform:translateY(8px);transition:opacity .22s var(--ease-out),transform .22s var(--ease-out);
  display:flex;gap:9px;align-items:center;box-shadow:var(--e3)}
.toast.show{opacity:1;transform:translateY(0)}
.toast.error{box-shadow:inset 3px 0 0 var(--red),var(--e3)}
.toast.success{box-shadow:inset 3px 0 0 var(--success),var(--e3)}
.toast.info{box-shadow:inset 3px 0 0 var(--gold),var(--e3)}
```

- [ ] **Step 2: Add host div** just before `</body>` (near `#screen-guard`): `<div id="toast-host" aria-live="polite"></div>`

- [ ] **Step 3: Add helper** (in the main script):

```js
function toast(msg, type){
  const host=document.getElementById('toast-host'); if(!host) return;
  const t=document.createElement('div'); t.className='toast '+(type||'info'); t.textContent=msg;
  host.appendChild(t);
  requestAnimationFrame(()=>t.classList.add('show'));
  setTimeout(()=>{ t.classList.remove('show'); setTimeout(()=>t.remove(),240); }, 3400);
}
```

- [ ] **Step 4: Replace the 6 `alert()` calls** with `toast(...,'error')` (errors) / `'info'` (the "Data belum siap" / Print-to-PDF hint). Keep the same Indonesian copy.

- [ ] **Step 5: Verify**
Run: `grep -c "alert(" index.html` → Expected: **0**.
Browser: trigger an export before data loads → toast appears bottom-centre, auto-dismisses, doesn't block. `aria-live="polite"` announces it.

- [ ] **Step 6: Commit** `feat(ux): toast system replacing native alert()`

---

### Task 4: Data-fail inline error + retry

**Files:** Modify `index.html` `loadData()` catch block (L5252–5257) and add an error surface on the KPI page.

**Interfaces — Consumes:** `toast()` (Task 3), `--fs-*` (Task 1).

**Context:** Today a failed GAS call only does `console.error` + sets a hidden `#last-updated`. The dashboard renders blank (the exact bug the owner hit).

- [ ] **Step 1: Add a data-error banner element** at the top of the app body (after the header, before `.app-body` pages) — hidden by default:

```html
<div id="data-error" role="alert" style="display:none">
  <span id="data-error-msg">Gagal memuat data.</span>
  <button class="reg-btn" id="data-error-retry" onclick="loadData()">Coba lagi</button>
</div>
```

- [ ] **Step 2: Style it** (both themes):

```css
#data-error{margin:14px clamp(14px,4vw,32px);padding:14px 18px;border-radius:12px;
  background:var(--red-10);border:1px solid var(--red-20);box-shadow:inset 3px 0 0 var(--red);
  display:flex;gap:14px;align-items:center;justify-content:space-between;flex-wrap:wrap;font-size:var(--fs-body);color:var(--t1)}
#data-error.show{display:flex}
```

- [ ] **Step 3: Wire it in `loadData`** — in the `catch`, show it with a specific message; in the success path, hide it:

```js
// success path (after allData=parseCSV...):
document.getElementById('data-error')?.classList.remove('show');
// catch block:
const de=document.getElementById('data-error');
if(de){ document.getElementById('data-error-msg').textContent =
  e.message==='timeout' ? 'Koneksi timeout saat memuat data.' :
  e.message==='not_configured' ? 'Sumber data belum dikonfigurasi.' :
  'Gagal memuat data. Periksa koneksi lalu coba lagi.';
  de.classList.add('show'); }
toast('Gagal memuat data','error');
```

- [ ] **Step 4: Verify**
Browser (or temporarily break `GAS_URL`): failed load shows the banner + toast, dashboard no longer silently blank; clicking **Coba lagi** re-runs `loadData` and the banner clears on success.
Run: `grep -n "data-error" index.html` → element, style, and both JS branches present.

- [ ] **Step 5: Commit** `feat(ux): inline data-load error + retry (no more blank dashboard)`

---

### Task 5: Loading skeleton on every load (not just first)

**Files:** Modify `index.html` `loadData()` (L5227–5230) and `showPage()` build path (L5500–5514).

**Interfaces — Consumes:** existing `.skeleton` (L567) and `#kpi-skeleton`.

**Context:** `firstLoad` gate (L5229) shows the skeleton only when `allData` is empty. Refreshes and first page-builds show nothing.

- [ ] **Step 1: Show skeleton on ALL loads while the current page is KPI** — change the gate:

```js
const skel=document.getElementById('kpi-skeleton');
if(skel && currentPage==='kpi') skel.classList.add('show');
```
(remove the `firstLoad`-only condition; keep the existing `remove('show')` in success + catch + the `expired/revoked` early return — verify all three paths clear it.)

- [ ] **Step 2: Add a lightweight page-build shimmer** — in `showPage` `needsRender` branch (L5508, before `renderPage(p)`), the page is already held at `opacity:0`; that's acceptable. No new skeleton needed per page IF the KPI skeleton covers the main case. (YAGNI: do not build per-page skeletons unless review asks.)

- [ ] **Step 3: Verify**
Browser: trigger a data refresh with existing data on the KPI page → skeleton shows during fetch, clears on completion AND on error (no stuck skeleton).
Run: `grep -n "kpi-skeleton" index.html` → gate no longer references `firstLoad`.

- [ ] **Step 4: Commit** `feat(ux): show KPI skeleton on every load, clear on success+error`

---

### Task 6: Table review (rescoped from "sortable tables")

**Files:** Inspect `renderD2D` (L6561) and `renderAllSumm` (L6499); modify only if a real gap is found.

**Context — why rescoped:** D2D already has sticky top header (L6593), sticky first column (L6584), and zebra (L6583). It is a **chronological time-series** — sorting by an arbitrary column would break `vs Kemarin` / `vs Minggu Lalu` / `Δ`. True column-sort is therefore **not applicable** to D2D and would be a regression.

- [ ] **Step 1: Read `renderAllSumm` (L6499–6549)** and decide: is All Summary a flat, order-independent table (candidate for sort) or another time-series/grouped view?

- [ ] **Step 2: If All Summary is a flat store/metric grid** → add click-to-sort on its column headers (toggle asc/desc, arrow indicator), preserving the existing markup. **If it is a time-series/grouped view like D2D** → no sort; instead just confirm sticky header + zebra render correctly in BOTH themes and note "sorting N/A" in the commit.

- [ ] **Step 3: Regardless — verify D2D sticky header contrast in light mode** (the sticky `<th>` uses `var(--bg2)`; confirm it's opaque enough over scrolled rows in light theme). Fix only if it bleeds.

- [ ] **Step 4: Verify + Commit**
Browser: scroll D2D and All Summary in both themes — headers stay put and readable.
Commit: `fix(tables): verify sticky/zebra both themes; sort added to All Summary where applicable`

---

### Task 7: Ship — bump cache, update CLAUDE.md roadmap status

**Files:** `sw.js` (`CACHE_VERSION`), `CLAUDE.md` (Known Gaps section — mark Critical/High done).

- [ ] **Step 1:** `sw.js`: `fore-v106` → `fore-v107`.
- [ ] **Step 2:** In CLAUDE.md "Known Gaps & Roadmap", move the completed Critical + High bullets to a "✅ Done (v107)" note; leave Medium/Polish as pending.
- [ ] **Step 3:** Add a new Standing Rule if a durable invariant emerged (e.g. "No `font-size` below `--fs-caption` (12px)"; "Errors surface via `toast()`/`#data-error`, never `alert()`").
- [ ] **Step 4: Commit + push** `chore: bump cache fore-v107; audit Critical+High done`

---

## Self-Review

**Spec coverage:** (1) data-fail → Task 4 ✓; (2) type scale + floor → Tasks 1,2 ✓; (3) toast → Task 3 ✓; (4) skeletons → Task 5 ✓; (5) sortable/sticky tables → Task 6 (rescoped, sticky already present; sort only where applicable) ✓ with owner note; (6) `--success` → Task 1 ✓.

**Placeholder scan:** all steps carry concrete selectors, line anchors, code, and grep checks. Task 6 Step 2 is conditional-by-design (depends on All Summary's real structure, read in Step 1) — not a placeholder.

**Type consistency:** `toast(msg,type)` used identically in Tasks 3 & 4. `--fs-*`/`--success` names identical across Tasks 1,2,3,4. `#data-error`/`#toast-host` ids consistent.

**Owner flag:** Task 6 rescopes audit item #5 — surface this at review (sorting a date time-series is a regression, not an improvement).
