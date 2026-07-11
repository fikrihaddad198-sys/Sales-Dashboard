# A11y Keyboard & Focus Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close 4 verified accessibility gaps in `index.html` (focus ring removal, keyboard-inaccessible KPI/channel cards, `transition: all`, and un-trapped modal focus) without touching any documented motion/design invariant.

**Architecture:** All changes live in the single `index.html` file (no build step, no bundler). Two are pure CSS edits, one adds `tabindex`/`role` plus one delegated `keydown` listener, one adds a small reusable focus-trap pair of functions wired into the two existing modal open/close functions.

**Tech Stack:** Vanilla HTML/CSS/JS, no framework, no test runner. Verification is manual, in-browser, via the static file server already running at `http://localhost:8080`.

## Global Constraints

- Single-file architecture — all edits stay inside `index.html`.
- Every CSS color needs dark + light variants — N/A here, no new colors introduced.
- Don't touch documented invariants: `_renderedPages`, `_chartAnim`, `replayPageCharts`, chart gradient caching, dock magnify, page-swap-in opacity-only.
- Bump `CACHE_VERSION` in `sw.js` only at deploy time (not part of local verification — noted as a follow-up, not a task here, since this work stays local/unpushed for now).
- No `alert()` for errors (N/A — this plan adds no error paths).

---

### Task 1: Remove focus-ring override on standby unlock button

**Files:**
- Modify: `index.html:3462`

**Interfaces:** None — pure CSS deletion, no other task depends on this.

- [ ] **Step 1: Confirm current state**

Read `index.html` around line 3462. Current content:
```css
#standby-logo-btn:focus-visible { outline: none; }
```
This sits directly below the `#standby-logo-btn { ... }` rule block (around line 3456-3461).

- [ ] **Step 2: Delete the override line**

Remove the entire line:
```css
#standby-logo-btn:focus-visible { outline: none; }
```
Leave the blank line after it as-is (don't collapse spacing).

- [ ] **Step 3: Manual verification**

With the local server running (`http://localhost:8080`), open the dashboard in a browser, reach the standby/lock screen (`#standby-screen`), and press `Tab` until the unlock button (`#standby-logo-btn`) receives focus.

Expected: a gold 2px outline ring appears around the button (inherited from the global rule at `index.html:245`, `outline: 2px solid var(--gold); outline-offset: 2px;`). Before this fix, no ring appeared at all.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "fix(a11y): restore focus ring on standby unlock button"
```

---

### Task 2: Replace `transition: all` with explicit properties (6 sites)

**Files:**
- Modify: `index.html:765` (`.hdr-btn`)
- Modify: `index.html:775` (`.hdr-icon-btn`)
- Modify: `index.html:1970` (`.toggle-btn`)
- Modify: `index.html:2352` (`.race-hero-gmv`)
- Modify: `index.html:2357` (`.race-kpi-val`)
- Modify: `index.html:2559` (`.drp-nav`)

**Interfaces:** None — pure CSS, no behavior change, no other task depends on this.

- [ ] **Step 1: `.hdr-btn` (line 765)**

Current:
```css
.hdr-btn {
  ...
  transition: all 0.18s;
}
```
The only rule that changes this element's state is `.hdr-btn:hover { background: var(--cyan-10); border-color: rgba(201,168,76,0.35); color: var(--cyan); }` (line 767) — background, border-color, color. Change to:
```css
  transition: background-color 0.18s, border-color 0.18s, color 0.18s;
```

- [ ] **Step 2: `.hdr-icon-btn` (line 775)**

Current:
```css
  transition: all 0.20s; flex-shrink: 0;
```
Its hover rule `.hdr-icon-btn:hover { background: var(--surface-hover); transform: rotate(15deg) scale(1.05); }` (line 777) changes background and transform. Change to:
```css
  transition: background-color 0.20s, transform 0.20s; flex-shrink: 0;
```

- [ ] **Step 3: `.toggle-btn` (line 1970)**

Current:
```css
  cursor: pointer; transition: all 0.18s;
```
Its state changes come from `.toggle-btn.active { background: var(--bg1); color: var(--t1); box-shadow: var(--e1); }` (line 1973) and `.toggle-btn:active { transform: scale(0.95); }` (line 1974). Change to:
```css
  cursor: pointer; transition: background-color 0.18s, color 0.18s, box-shadow 0.18s, transform 0.18s;
```

- [ ] **Step 4: `.race-hero-gmv` and `.race-kpi-val` (lines 2352, 2357)**

Current:
```css
.race-hero-gmv { font-size:clamp(32px,4vw,56px); font-weight:900; color:var(--t1); line-height:.95; letter-spacing:-2px; margin-bottom:8px; transition:all .3s; }
.race-kpi-val { font-size:22px; font-weight:800; line-height:1; letter-spacing:-.8px; transition:all .3s; }
```
`.race-kpi-val` elements (`#race-ach`, `#race-ideal`, `#race-pace`) get their `color` set inline by JS on data refresh (`index.html:5014,5018,5022`); `.race-hero-gmv` mirrors the same pattern class. The only property that ever changes on either is `color`. Change both to:
```css
.race-hero-gmv { font-size:clamp(32px,4vw,56px); font-weight:900; color:var(--t1); line-height:.95; letter-spacing:-2px; margin-bottom:8px; transition:color .3s; }
.race-kpi-val { font-size:22px; font-weight:800; line-height:1; letter-spacing:-.8px; transition:color .3s; }
```

- [ ] **Step 5: `.drp-nav` (line 2559)**

Current:
```css
  transition:all .15s;backdrop-filter:blur(8px);
```
Its hover rule `.drp-nav:hover{background:rgba(255,255,255,0.15);color:#fff;border-color:rgba(255,255,255,0.2);}` (line 2561) changes background, color, border-color. Change to:
```css
  transition:background-color .15s, color .15s, border-color .15s;backdrop-filter:blur(8px);
```

- [ ] **Step 6: Manual verification**

On the local server, hover/click each affected element and confirm the transition still feels identical (same speed, same smoothness) as before the change:
- Header buttons (top-right icon buttons) — hover.
- Any `.toggle-btn` (e.g. period toggle) — hover, click to activate.
- Race page — switch period/leader and watch the hero GMV / KPI values; color changes should still transition smoothly.
- Date-range picker (DRP) prev/next nav arrows — hover.

Expected: no visible difference from before the edit — only the underlying CSS property list changed, not timing or behavior.

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "fix(a11y): replace transition:all with explicit properties (6 sites)"
```

---

### Task 3: Keyboard access for `.kpi-clickable` / `.contrib-ch-card`

**Files:**
- Modify: `index.html:4651,4656,4661` (static HTML, KPI hero row)
- Modify: `index.html:6521` (JS template string, metric-card grid)
- Modify: `index.html:6555` (JS template string, channel contribution cards)
- Modify: `index.html:~9237` (new shared keydown listener, placed next to the existing Escape listeners)

**Interfaces:**
- Produces: no new named function — the fix is a `document`-level `keydown` listener with no external API. Later tasks don't depend on anything from this task.

- [ ] **Step 1: Add `tabindex`/`role` to the 3 static KPI hero cards**

At `index.html:4651`, current:
```html
          <div class="h-col h-col-gmv kpi-clickable" onclick="openKpiModal('gmv',this)" title="Lihat breakdown GMV">
```
Change to:
```html
          <div class="h-col h-col-gmv kpi-clickable" onclick="openKpiModal('gmv',this)" title="Lihat breakdown GMV" tabindex="0" role="button">
```

At `index.html:4656`, current:
```html
          <div class="h-col h-col-mid kpi-clickable" onclick="openKpiModal('achievement',this)" title="Achievement = persen GMV terhadap target bulanan. 'Ideal' = posisi seharusnya berdasarkan hari berjalan. Klik untuk detail.">
```
Change to (append `tabindex="0" role="button"` before the closing `>`):
```html
          <div class="h-col h-col-mid kpi-clickable" onclick="openKpiModal('achievement',this)" title="Achievement = persen GMV terhadap target bulanan. 'Ideal' = posisi seharusnya berdasarkan hari berjalan. Klik untuk detail." tabindex="0" role="button">
```

At `index.html:4661`, current:
```html
          <div class="h-col h-col-right kpi-clickable" onclick="openKpiModal('pace',this)" title="Daily Pace = rata-rata GMV harian dibanding target harian ideal. 100% = tepat sesuai target. Klik untuk detail.">
```
Change to:
```html
          <div class="h-col h-col-right kpi-clickable" onclick="openKpiModal('pace',this)" title="Daily Pace = rata-rata GMV harian dibanding target harian ideal. 100% = tepat sesuai target. Klik untuk detail." tabindex="0" role="button">
```

- [ ] **Step 2: Add `tabindex`/`role` to the metric-card template string**

At `index.html:6521`, current:
```javascript
      '<div class="metric-card kpi-clickable" style="--mc:${k.sc}" onclick="openKpiModal('${stripKeys[i]}',this)" title="${(METRIC_TIPS[k.l]||'')} Klik untuk detail.">'+
```
Change to:
```javascript
      '<div class="metric-card kpi-clickable" style="--mc:${k.sc}" onclick="openKpiModal('${stripKeys[i]}',this)" title="${(METRIC_TIPS[k.l]||'')} Klik untuk detail." tabindex="0" role="button">'+
```

- [ ] **Step 3: Add `tabindex`/`role` to the channel contribution card template string**

At `index.html:6555`, current:
```javascript
    '<div class="contrib-ch-card" style="--ch-color:'+c.color+'" onclick="openChannelPopup(\''+c.name.toLowerCase()+'\',\''+c.name+'\',\''+c.color+'\',this)">'+
```
Change to:
```javascript
    '<div class="contrib-ch-card" style="--ch-color:'+c.color+'" onclick="openChannelPopup(\''+c.name.toLowerCase()+'\',\''+c.name+'\',\''+c.color+'\',this)" tabindex="0" role="button">'+
```

- [ ] **Step 4: Add the shared keydown listener**

At `index.html:9237`, immediately after the existing line:
```javascript
document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeChannelPopup(); });
```
Insert:
```javascript

/* Enter/Space activates keyboard-focused KPI/channel cards (mouse-only onclick fallback) */
document.addEventListener('keydown', e=>{
  if((e.key==='Enter'||e.key===' ') && e.target.matches('.kpi-clickable,.contrib-ch-card')){
    e.preventDefault(); e.target.click();
  }
});
```

- [ ] **Step 5: Manual verification**

On the local server:
1. Go to the KPI page. Press `Tab` repeatedly until the GMV / Achievement / Daily Pace hero cells receive focus (gold ring visible on each).
2. With one focused, press `Enter` — the corresponding KPI breakdown modal should open, identical to clicking it.
3. Press `Tab` again to reach a `metric-card` (the 4-strip cards below the hero) — press `Space` — the modal should open (page must not scroll from the Space press; `e.preventDefault()` handles this).
4. Go to the Channel page, `Tab` to a `.contrib-ch-card`, press `Enter` — the channel popup should open.

Expected: every card reachable and operable by keyboard alone, same result as a mouse click.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat(a11y): keyboard access for KPI/channel clickable cards"
```

---

### Task 4: Focus-trap + focus-restore for KPI modal and channel popup

**Files:**
- Modify: `index.html` — add two new functions near the existing Escape listeners (~`index.html:9237`, after Task 3's new listener)
- Modify: `index.html:8755` (`_popupOpen`, end of function) — call `activateFocusTrap`
- Modify: `index.html:8798` (`_popupClose`'s `cleanup()`) — call `deactivateFocusTrap`
- Modify: `index.html:9192` (`openKpiModal`, end of function) — call `activateFocusTrap`
- Modify: `index.html:9222` (`closeKpiModal`'s `cleanup()`) — call `deactivateFocusTrap`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `activateFocusTrap(containerEl, triggerEl)` and `deactivateFocusTrap()` — both used by `openKpiModal`/`closeKpiModal` and `_popupOpen`/`_popupClose` in this same task. No later task depends on these.

- [ ] **Step 1: Add the two shared functions**

Immediately after the keydown listener added in Task 3 Step 4 (i.e. right after the `.kpi-clickable,.contrib-ch-card` keydown block, still near `index.html:9237`), insert:

```javascript

/* ── Focus trap for KPI modal + channel popup (shared — only one is ever open at a time) ── */
let _focusTrapPrev = null;
let _focusTrapHandler = null;

function activateFocusTrap(containerEl, triggerEl){
  _focusTrapPrev = triggerEl || document.activeElement;
  const sel = 'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  const first = containerEl.querySelector(sel);
  if(first) first.focus();
  _focusTrapHandler = (e)=>{
    if(e.key!=='Tab') return;
    const f = [...containerEl.querySelectorAll(sel)].filter(el=>el.offsetParent!==null);
    if(!f.length) return;
    const first=f[0], last=f[f.length-1];
    if(e.shiftKey && document.activeElement===first){ e.preventDefault(); last.focus(); }
    else if(!e.shiftKey && document.activeElement===last){ e.preventDefault(); first.focus(); }
  };
  document.addEventListener('keydown', _focusTrapHandler);
}

function deactivateFocusTrap(){
  if(_focusTrapHandler){ document.removeEventListener('keydown', _focusTrapHandler); _focusTrapHandler=null; }
  if(_focusTrapPrev?.focus) _focusTrapPrev.focus();
  _focusTrapPrev = null;
}
```

- [ ] **Step 2: Wire into `_popupOpen`**

At `index.html:8755`, current end of `_popupOpen(cardEl)`:
```javascript
  document.body.style.overflow = 'hidden';
}
```
Change to:
```javascript
  document.body.style.overflow = 'hidden';
  activateFocusTrap(popup, cardEl);
}
```
(`popup` is already in scope — defined at the top of `_popupOpen` as `const popup = document.getElementById('ch-popup');`.)

- [ ] **Step 3: Wire into `_popupClose`'s cleanup**

At `index.html:8798`, current:
```javascript
    _chPopupCharts.forEach(c=>{try{c.destroy();}catch(e){}});
    _chPopupCharts=[];
  }
```
Change to:
```javascript
    _chPopupCharts.forEach(c=>{try{c.destroy();}catch(e){}});
    _chPopupCharts=[];
    deactivateFocusTrap();
  }
```

- [ ] **Step 4: Wire into `openKpiModal`**

At `index.html:9192`, current end of `openKpiModal(type,cardEl)`:
```javascript
    }
  });
}
```
(the `});` closes `new Chart(ctx,{...})` and the final `}` closes the function). Change to:
```javascript
    }
  });
  activateFocusTrap(modal, cardEl);
}
```
(`modal` is already in scope — defined at the top of `openKpiModal` as `const modal = document.getElementById('kpi-modal');`.)

Note: `openKpiModal` has an early return at line 9176 (`if(chartData && !modal.querySelector('#kpi-modal-chart')) return;`) and another early return at line 9180 (`if(!ctx) return;`) — in both cases the modal is already visible with content (the entrance animation was already started earlier in the function), so `activateFocusTrap` should also be added right before each of those two early returns to ensure the trap still activates on that path:

At `index.html:9176`, current:
```javascript
  if(chartData && !modal.querySelector('#kpi-modal-chart')) return;
```
Change to:
```javascript
  if(chartData && !modal.querySelector('#kpi-modal-chart')){ activateFocusTrap(modal, cardEl); return; }
```

At `index.html:9180`, current:
```javascript
  if(!ctx) return;
```
Change to:
```javascript
  if(!ctx){ activateFocusTrap(modal, cardEl); return; }
```

- [ ] **Step 5: Wire into `closeKpiModal`'s cleanup**

At `index.html:9222`, current:
```javascript
    if(_kpiModalChart){ _kpiModalChart.destroy(); _kpiModalChart=null; }
  }
```
Change to:
```javascript
    if(_kpiModalChart){ _kpiModalChart.destroy(); _kpiModalChart=null; }
    deactivateFocusTrap();
  }
```

- [ ] **Step 6: Manual verification**

On the local server:
1. Open a KPI modal (click or Enter on any KPI card). Press `Tab` repeatedly — focus must cycle only among elements inside the modal (close button, any links/buttons in the modal body), never escaping to the header/nav/page behind it. Press `Shift+Tab` from the first focusable element — focus should wrap to the last one.
2. Close the modal (click close button, press `Escape`, or click the backdrop). Confirm keyboard focus lands back exactly on the KPI card that opened it (visible gold ring on that card, not on `<body>` or nowhere).
3. Repeat both checks for the channel popup (`.contrib-ch-card` → open → Tab-cycle check → close → focus-restore check).
4. Confirm chart entrance/tab-switch behavior elsewhere in the app is unaffected (spot-check: switch dashboard tabs a couple of times, confirm no new lag or animation change — this task only touches the two modal open/close functions).

Expected: Tab never leaves either modal while open; focus always returns to the triggering card on close.

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat(a11y): trap focus in KPI modal and channel popup, restore on close"
```

---

## Plan Self-Review

**Spec coverage:** All 4 spec items have a task — standby outline (Task 1), `transition: all` (Task 2), keyboard access (Task 3), focus-trap (Task 4). Verification steps in each task match the spec's verification section.

**Placeholder scan:** No TBD/TODO; every step has literal before/after code, not descriptions.

**Type consistency:** `activateFocusTrap(containerEl, triggerEl)` / `deactivateFocusTrap()` signatures are identical across all 4 call sites (Task 4 Steps 2-5) and match the definition in Step 1. `popup` and `modal` variable names match what's already in scope in `_popupOpen`/`openKpiModal` respectively (verified against current source, not assumed).
