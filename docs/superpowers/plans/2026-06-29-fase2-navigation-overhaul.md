# Fase 2: Navigation Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace current navigation with a bottom tab bar (mobile) and collapsible sidebar (desktop), add keyboard shortcuts 1–5, swipe left/right, and smooth 180ms page transitions.

**Architecture:** All changes in `index.html`. Nav HTML restructured, CSS rewritten for `.nav-bar` / `.sidebar`, `showPage()` updated for transition timing. Sidebar collapse state in `sessionStorage`. No new dependencies.

**Tech Stack:** Vanilla JS, CSS custom properties, existing `showPage()` and `_renderedPages` system.

## Global Constraints

- Single-file rule: ALL changes in `index.html` only.
- All CSS colors need both `:root` and `[data-theme="light"]` variants.
- Gold `#c9a84c` = single chrome accent only.
- Never call `renderPage()` on every tab switch — `_renderedPages` check must stay.
- Page transition: opacity + translateY(4px) max — no full translate (causes canvas rasterize shake).
- `will-change` on `.reveal` scoped to `body.dr-animating` only.
- Bump `CACHE_VERSION` in `sw.js` on every deploy.

---

### Task 1: Audit current nav + page transition code

**Files:**
- Read only: `index.html` — map current nav HTML structure, `showPage()` logic, transition CSS

**Interfaces:**
- Produces: understanding of exact class names, IDs, and logic to modify in Tasks 2–5

- [ ] **Step 1: Map current nav HTML**

```bash
grep -n 'nav-btn\|nav-bar\|nav-icon\|nav-label\|data-page' index.html | head -40
```
Document: wrapper element ID/class, each button's structure, active class name.

- [ ] **Step 2: Map showPage() logic**

```bash
grep -n 'showPage\|page-swap\|page-swapping\|_renderedPages\|replayPageCharts\|requestAnimationFrame' index.html | head -40
```
Note: where active class is set on nav buttons, where `opacity:0` is applied, where `page-swap-in` animation is triggered.

- [ ] **Step 3: Map current transition CSS**

```bash
grep -n 'page-swap\|page-swapping\|\.page\b\|opacity.*page\|translateY' index.html | head -30
```
Note: current animation duration, easing, properties animated.

- [ ] **Step 4: Note page IDs in order**

List all `data-page="..."` values in their current tab order — this becomes the order for keyboard shortcuts 1–5 and swipe navigation.

No commit needed — audit only.

---

### Task 2: Bottom tab bar (mobile ≤ 768px)

**Files:**
- Modify: `index.html` — restructure nav HTML for bottom bar, add CSS for `.nav-bottom`

**Interfaces:**
- Consumes: existing `showPage()` function (unchanged), existing `data-page` attributes
- Produces: `.nav-bottom` element visible only on mobile, current nav hidden on mobile

- [ ] **Step 1: Wrap existing nav buttons in a new .nav-bottom container**

Find the existing nav wrapper. Add a new wrapper div around the buttons (or repurpose existing):
```html
<nav class="nav-bottom" id="nav-bottom" role="navigation" aria-label="Main navigation">
  <!-- existing nav-btn buttons go here, unchanged -->
</nav>
```
Keep all existing `data-page` attributes and `onclick` handlers intact.

- [ ] **Step 2: Add CSS for bottom tab bar (mobile)**

```css
/* Bottom tab bar — mobile only */
@media (max-width: 768px) {
  .nav-bottom {
    position: fixed;
    bottom: 0; left: 0; right: 0;
    height: 56px;
    display: flex;
    align-items: stretch;
    background: var(--bg1);
    border-top: 1px solid var(--t4);
    z-index: 200;
    padding-bottom: env(safe-area-inset-bottom, 0);
  }
  .nav-btn {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--t3);
    font-size: 0.62rem;
    padding: 0;
    transition: color 0.15s;
  }
  .nav-btn.active { color: var(--gold); }
  .nav-btn .nav-icon { font-size: 1.2rem; line-height: 1; }
  .nav-btn .nav-label { line-height: 1; }

  /* Push page content above bottom bar */
  .dashboard-content, #pages-container, main {
    padding-bottom: calc(56px + env(safe-area-inset-bottom, 0));
  }
}
```

Light mode inside `[data-theme="light"]`:
```css
[data-theme="light"] .nav-bottom { background: #fff; border-top-color: #e4e4e7; }
```

- [ ] **Step 3: Hide old nav on mobile (if separate from .nav-bottom)**

If there was a separate top nav visible on mobile, add:
```css
@media (max-width: 768px) {
  .nav-top, #nav-top { display: none; }
}
```

- [ ] **Step 4: Verify on mobile viewport**

Open DevTools → toggle mobile emulation (375px wide). Confirm bottom bar appears, all tabs visible, active tab highlights in gold. Tap tabs — page changes. No overlap with content.

- [ ] **Step 5: Commit**
```bash
git add index.html
git commit -m "feat: bottom tab bar navigation for mobile"
```

---

### Task 3: Collapsible sidebar (desktop ≥ 769px)

**Files:**
- Modify: `index.html` — add `.sidebar` CSS, add sidebar toggle button, JS for collapse state in sessionStorage

**Interfaces:**
- Consumes: existing nav buttons (same `data-page` + `onclick`), `sessionStorage`
- Produces: `.sidebar` visible on desktop, collapsed state persisted in `sessionStorage['sidebarCollapsed']`

- [ ] **Step 1: Add sidebar CSS**

```css
@media (min-width: 769px) {
  .nav-bottom {
    position: fixed;
    top: 0; left: 0; bottom: 0;
    width: 200px;
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;
    padding: 1rem 0;
    background: var(--bg1);
    border-right: 1px solid var(--t4);
    border-top: none;
    height: auto;
    transition: width 0.2s ease;
    z-index: 200;
  }
  .nav-bottom.collapsed { width: 56px; }

  .nav-btn {
    flex-direction: row;
    justify-content: flex-start;
    gap: 0.75rem;
    padding: 0.65rem 1rem;
    font-size: 0.875rem;
    border-radius: 0;
    width: 100%;
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
  }
  .nav-btn .nav-icon { font-size: 1.1rem; flex-shrink: 0; }
  .nav-btn .nav-label { transition: opacity 0.15s; }
  .nav-bottom.collapsed .nav-btn .nav-label { opacity: 0; pointer-events: none; }
  .nav-btn.active { color: var(--gold); background: color-mix(in srgb, var(--gold) 10%, transparent); }

  /* Sidebar toggle button */
  .sidebar-toggle {
    position: fixed;
    top: 0.75rem;
    left: 0.75rem;
    width: 32px; height: 32px;
    background: var(--bg2);
    border: 1px solid var(--t4);
    border-radius: 6px;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    font-size: 1rem;
    color: var(--t2);
    z-index: 201;
    transition: left 0.2s ease;
  }
  body:not(.sidebar-collapsed) .sidebar-toggle { left: calc(200px + 0.75rem); }

  /* Push page content right of sidebar */
  .dashboard-content, #pages-container, main {
    margin-left: 200px;
    transition: margin-left 0.2s ease;
  }
  body.sidebar-collapsed .dashboard-content,
  body.sidebar-collapsed #pages-container,
  body.sidebar-collapsed main {
    margin-left: 56px;
  }
}
```

Light mode:
```css
[data-theme="light"] @media (min-width: 769px) { /* inside [data-theme="light"] */
  .nav-bottom { background: #fff; border-right-color: #e4e4e7; }
  .nav-btn.active { background: color-mix(in srgb, #c9a84c 8%, transparent); }
  .sidebar-toggle { background: #fff; border-color: #d4d4d8; }
}
```

- [ ] **Step 2: Add toggle button HTML**

Just before the closing `</body>` tag (or near the nav):
```html
<button class="sidebar-toggle" id="sidebar-toggle" onclick="toggleSidebar()" aria-label="Toggle sidebar">☰</button>
```
Hide on mobile: add `.sidebar-toggle { display: none; }` inside `@media (max-width: 768px)`.

- [ ] **Step 3: Add toggleSidebar() JS**

```javascript
function toggleSidebar() {
  const collapsed = document.body.classList.toggle('sidebar-collapsed');
  document.getElementById('nav-bottom').classList.toggle('collapsed', collapsed);
  sessionStorage.setItem('sidebarCollapsed', collapsed ? '1' : '');
}

function initSidebar() {
  if (window.innerWidth <= 768) return;
  const wasCollapsed = sessionStorage.getItem('sidebarCollapsed') === '1';
  if (wasCollapsed) {
    document.body.classList.add('sidebar-collapsed');
    const nav = document.getElementById('nav-bottom');
    if (nav) nav.classList.add('collapsed');
  }
}
```

Call `initSidebar()` in the existing `DOMContentLoaded` / init block (wherever other init calls live).

- [ ] **Step 4: Verify desktop sidebar**

Open dashboard at full desktop width. Confirm sidebar appears on left with icon+label. Click toggle button — sidebar collapses to icon-only. Refresh — collapsed state restored. Content area shifts correctly.

- [ ] **Step 5: Commit**
```bash
git add index.html
git commit -m "feat: collapsible sidebar for desktop navigation"
```

---

### Task 4: Smooth page transitions (180ms, opacity + translateY 4px)

**Files:**
- Modify: `index.html` — update `page-swap-in` keyframe, update `showPage()` transition timing

**Interfaces:**
- Consumes: existing `showPage()`, existing `.page`, `_renderedPages`, `replayPageCharts`
- Produces: 180ms opacity + translateY(4px) transition — no full translate

- [ ] **Step 1: Update page-swap-in keyframe**

Find:
```css
@keyframes page-swap-in
```
Replace its contents with:
```css
@keyframes page-swap-in {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
```
Find the rule that applies `page-swap-in` (e.g., `.page.page-swapping`) and set:
```css
animation: page-swap-in 0.18s ease both;
```

- [ ] **Step 2: Verify showPage() opacity→animation sequencing is correct**

Re-read the `showPage()` logic (from Task 1 audit). Confirm the pattern is:
1. Set new page to `opacity:0` inline (so content builds invisible)
2. Call `renderPage()` if not in `_renderedPages`
3. `requestAnimationFrame(() => { remove inline opacity; add page-swapping class })`

If the current code already does this, no change needed. If it uses a different duration constant, update it to `180` (ms).

- [ ] **Step 3: Verify no translateX / full translate anywhere on .page**

```bash
grep -n 'translateX\|translate3d\|\.page.*translate' index.html | head -20
```
If any full translate is found on `.page` during transitions, remove it (canvas rasterize shake risk per CLAUDE.md).

- [ ] **Step 4: Test transition feel**

Switch between 5 pages rapidly. Confirm: no jank, no canvas shake, transitions feel instant (~180ms is imperceptible as "slow"). Check on mobile emulation too.

- [ ] **Step 5: Commit**
```bash
git add index.html
git commit -m "perf: smooth 180ms page transitions (opacity+translateY 4px only)"
```

---

### Task 5: Keyboard shortcuts (1–5) + swipe navigation

**Files:**
- Modify: `index.html` — add `keydown` listener, add touch swipe handler

**Interfaces:**
- Consumes: `showPage()`, ordered list of page IDs from Task 1 audit
- Produces: `1`–`5` keys navigate to main pages; swipe left/right navigates prev/next

- [ ] **Step 1: Add keyboard shortcut handler**

Using the ordered page IDs from Task 1 (e.g., `['kpi','sales','channel','compare','map']`), add to the existing `document.addEventListener('keydown', ...)` block, or create one:

```javascript
const _NAV_PAGES = ['kpi','sales','channel','compare','map']; // update with real order from audit

document.addEventListener('keydown', (e) => {
  // Skip if user is typing in an input/textarea
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
  const idx = parseInt(e.key, 10);
  if (idx >= 1 && idx <= _NAV_PAGES.length) {
    showPage(_NAV_PAGES[idx - 1]);
  }
});
```

- [ ] **Step 2: Add swipe handler**

```javascript
(function initSwipe() {
  let _swipeStartX = null;
  document.addEventListener('touchstart', e => {
    _swipeStartX = e.touches[0].clientX;
  }, { passive: true });
  document.addEventListener('touchend', e => {
    if (_swipeStartX === null) return;
    const dx = e.changedTouches[0].clientX - _swipeStartX;
    _swipeStartX = null;
    if (Math.abs(dx) < 50) return; // min swipe distance
    const cur = _NAV_PAGES.indexOf(_currentPage); // _currentPage = currently active page ID
    if (dx < 0 && cur < _NAV_PAGES.length - 1) showPage(_NAV_PAGES[cur + 1]); // swipe left → next
    if (dx > 0 && cur > 0)                      showPage(_NAV_PAGES[cur - 1]); // swipe right → prev
  }, { passive: true });
})();
```

Replace `_currentPage` with the actual variable or method used to track the current page (find it via `grep -n '_currentPage\|currentPage\|activePage' index.html | head -10`).

- [ ] **Step 3: Verify keyboard shortcuts**

Open dashboard, click somewhere on the page (not an input), press `1` through `5`. Each should navigate to the corresponding page. Press `1` while the email input is focused — confirm it does NOT navigate.

- [ ] **Step 4: Verify swipe**

On mobile emulation in DevTools, swipe left and right. Confirm page changes. Swipe less than 50px — confirm no navigation.

- [ ] **Step 5: Bump cache and commit**

In `sw.js`, increment `CACHE_VERSION` (e.g., `fore-v74` → `fore-v75`).

```bash
git add index.html sw.js
git commit -m "feat: keyboard shortcuts 1-5 + swipe navigation; bump cache fore-v75"
```

---

## Self-Review

**Spec coverage:**
- Bottom tab bar mobile: ✅ Task 2
- Collapsible sidebar desktop: ✅ Task 3
- Smooth transitions 180ms opacity+translateY: ✅ Task 4
- No full translate (canvas shake): ✅ Task 4 Step 3
- Keyboard shortcuts 1–5: ✅ Task 5
- Swipe left/right: ✅ Task 5
- Sidebar state in sessionStorage: ✅ Task 3 Step 3
- Active page indicator: ✅ Task 2 Step 2 (`.nav-btn.active`)
- `_renderedPages` cache not broken: ✅ Task 4 Step 2 (verify, not change)

**Placeholder scan:** `_currentPage` in Task 5 Step 2 is flagged as "find the real variable name" — this is intentional instruction to the implementer, not a placeholder in the plan. The grep command is provided.

**Type consistency:** `_NAV_PAGES` defined in Task 5 Step 1 and used in Step 2 — consistent. `toggleSidebar()` and `initSidebar()` defined in Task 3 Step 3, called in same task — consistent.
