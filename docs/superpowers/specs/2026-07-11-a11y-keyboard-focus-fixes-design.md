# A11y: Keyboard & Focus Fixes — Design Spec

**Status:** Approved by owner, 2026-07-11

## Goal
Close 4 real accessibility gaps found by a web-design-guidelines audit of `index.html`,
without touching any documented/deliberate motion or design decisions.

## Constraints (do not break)
- Single-file architecture (index.html).
- Every CSS color needs dark + light variants (not triggered here — no new colors).
- Bump `CACHE_VERSION` in `sw.js` on deploy.
- Don't touch documented invariants: `_renderedPages`, `_chartAnim`, `replayPageCharts`,
  gradient caching, dock magnify, page-swap-in opacity-only.

## Audit findings (source of this spec)
Ran `web-design-guidelines` + `improve-animations` skills against `index.html`.
Dashboard was already disciplined (easing tokens, global `prefers-reduced-motion`
override, no `<img>` without dimensions, login/register forms already have correct
`autocomplete`/`inputmode`). Confirmed real gaps:

1. **HIGH** — `index.html:3462` — `#standby-logo-btn:focus-visible{outline:none}`
   removes the focus ring on the standby-screen unlock button with no replacement.
2. **HIGH** — `index.html:4651,4656,4661,6521,6555` — `.kpi-clickable` /
   `.contrib-ch-card` are `<div onclick>` (KPI drill-down, channel popup triggers)
   with no `tabindex`, `role`, or keyboard handler — keyboard users cannot open them.
3. **LOW** — `index.html:765,775,1970,2352,2357,2559` — `transition: all` (6 places)
   mixes cheap (transform) and paint-cost (background/border/color) properties in one
   shorthand.
4. **Missed opportunity** — KPI modal (`openKpiModal`/`closeKpiModal`) and channel
   popup (`openChannelPopup`/`closeChannelPopup`) don't trap focus: Tab can escape
   to the background, and focus isn't restored to the triggering card on close.

Not findings (already correct, verified before writing this spec):
- `#toast-host` already has `aria-live="polite"` (index.html:4429).
- Escape-to-close already wired for both modals (index.html:9230, 9237).
- Global `prefers-reduced-motion` override already blankets all animation/transition.

## Scope — 4 fixes, no waves (all safe, independent, one commit each)

### 1. Standby button focus ring
Delete `#standby-logo-btn:focus-visible { outline: none; }` (line 3462) entirely.
Falls back to the existing global `:focus-visible` rule (line 245, gold 2px ring).
No new CSS.

### 2. `transition: all` → explicit properties
Replace all 6 occurrences with the actual properties that change at each site
(e.g. `.hdr-btn` → `background-color, border-color, color`; `.hdr-icon-btn` → same
+ `transform`, since it also rotates/scales on hover). Same durations/easings,
no visual behavior change.

### 3. Keyboard access for `.kpi-clickable` / `.contrib-ch-card`
- Add `tabindex="0" role="button"` to the 5 elements (3 static HTML at lines
  4651/4656/4661, 2 built via JS template string at 6521/6555).
- Add one shared delegated listener (near the existing Escape listeners at
  9230/9237):
  ```javascript
  document.addEventListener('keydown', e=>{
    if((e.key==='Enter'||e.key===' ') && e.target.matches('.kpi-clickable,.contrib-ch-card')){
      e.preventDefault(); e.target.click();
    }
  });
  ```
  Triggers the existing native `.click()`, which runs the existing `onclick`
  (`openKpiModal(...)` / `openChannelPopup(...)`) unchanged — no per-element logic
  duplicated, and it auto-covers any future card using these classes.
- Focus ring is free via the existing global `[tabindex]:focus-visible` rule
  (line 250) — no new CSS.
- No `aria-label` needed — visible text content inside each card already gives it
  an accessible name.

**Approach chosen over native `<button>` conversion:** lower risk — these elements
are grid cells / cards (`.h-col`, `.metric-card`) whose layout depends on `div`
display context; converting to `<button>` would require a CSS reset and re-test in
both themes for no behavioral gain here.

### 4. Focus-trap + focus-restore for both modals
One reusable pair of functions (module-level state — the two modals are never open
at the same time, so a single shared trap is sufficient):

```javascript
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

Wiring:
- `openKpiModal` already stores `_kpiModalSrc=cardEl` (line 8937) — call
  `activateFocusTrap(modal, cardEl)` once the modal is visible.
- `closeKpiModal` → call `deactivateFocusTrap()`.
- `openChannelPopup`/`closeChannelPopup` → same pattern, using their existing
  `cardEl` parameter.

No `inert` (avoids a browser-support check), no new dependency.

## Verification (manual, on local server localhost:8080 — no GitHub push)
1. Standby screen → Tab to unlock button → gold ring visible.
2. Dashboard → Tab to each KPI hero/metric card → ring visible, Enter/Space opens
   the same modal as a click.
3. With a modal open → Tab repeatedly → focus never escapes to the background,
   cycles within the modal only.
4. Close the modal (Escape or close button) → focus returns exactly to the
   triggering card, not lost to `<body>`.
5. Repeat 1-4 for `.contrib-ch-card` / channel popup.
6. Check both themes (dark/light) — no new colors introduced, but confirm nothing
   is visually broken in either.
7. Regression check: confirm `_renderedPages`/`replayPageCharts`/chart entrance
   animation behavior is unchanged (this change only touches event handling + a
   few CSS `transition` shorthands, not chart/render code).

No new automated test suite — out of scope (Playwright is a separate, already
deferred item in `CLAUDE.md`'s roadmap).

## Deploy note
Bump `CACHE_VERSION` in `sw.js` when this ships (per standing rule — not part of
local verification, only relevant once pushed).
