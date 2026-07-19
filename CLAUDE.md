# Fore Coffee Sales Dashboard — Claude Context

A single-file PWA sales intelligence dashboard for Fore Coffee Jakarta. Auth via Supabase (email + password). Data fetched from Google Sheets via Google Apps Script (JSONP).

## Architecture

```
index.html          ← Everything: all CSS, all JS, all HTML (~8000 lines)
sw.js               ← Service worker (PWA offline cache)
manifest.json       ← PWA manifest
backend/Code.gs     ← Google Apps Script (deployed as web app)
backend/SETUP.md    ← One-time GAS setup instructions
```

**Single-file rule**: Never split index.html into separate files unless the user explicitly asks for Phase 5 modularization. The monolith is intentional for simple static hosting.

## Key Config (index.html)

```javascript
const GAS_URL = 'https://script.google.com/macros/s/AKfycbwyGkd-mZSYW924JyEqPAk_8rUP6DTJ7HcTFEqH8nOtKoLQp32x-hWXG5OstJQjOvTS/exec';
```

All GAS calls use JSONP (avoids CORS with static hosting). Pattern: append `?action=…&callback=cb` to GAS_URL.

### CDN dependencies

- Chart.js `4.4.1` — all charts (loaded in `<head>`, used on every render)
- Fonts: Inter, JetBrains Mono, Fira Code, Fira Sans (Google Fonts, `<head>`)
- **Lazy-loaded on demand** (export-only, NOT in `<head>` — see `ensureExportLibs()`):
  xlsx `0.18.5` (Excel export), html2canvas `1.4.1` + jspdf `2.5.1` (KPI PDF export).
  Injected via `loadScript()` on first export click so they don't block first paint.

These are cross-origin and never cached by the service worker (network only).

## Authentication (Fore ID + Supabase, sessionStorage)

Login is by **Fore ID (numeric, 3–8 digits) + password**, NOT email. Email is used
only for verification (Supabase confirmation email). Supabase still owns the hard
parts (password hashing, sessions, email confirmation); the GAS `staff` sheet owns
identity (Fore ID ↔ email) + the approval `status`. No Telegram flow.

```javascript
const SUPA_URL = 'https://umarsaninyxepfgscjts.supabase.co';
// Owner status comes from the staff sheet (is_owner), NOT a hardcoded email.
```

Login screen has two tabs (`switchAuth('login'|'register')`):
- **Masuk** (`#login-form`): Fore ID + password. `submitLogin()` → `gasCall('resolveLogin',{fore_id})`
  → `{email,status,is_owner}`; guards `pending`/`disabled` with messages; then
  `sb.auth.signInWithPassword({email,password})` → `SESS.set(token, exp, email, isOwner)`.
- **Daftar** (`#register-form`): Fore ID + email + password ×2. `submitRegister()` validates,
  `gasCall('register',{fore_id,email})` reserves a **pending** staff row, then
  `sb.auth.signUp({email,password})` sends the confirm email. New accounts stay
  `pending` until the owner approves — email-confirmed alone does NOT grant access.

**Password reset** (`#recovery-form`): Supabase's reset email links back to the app
with a recovery token in the URL hash. On load, `isRecoveryLink()` detects it →
`enterRecoveryMode()` shows a "buat password baru" form (tabs hidden); `submitRecovery()`
calls `sb.auth.updateUser({password})`, then signs out + clears the hash so the recovery
session never becomes a real login (forces a clean re-login). Requires the Supabase
**Site URL / Redirect URLs** to point at the deployed dashboard, else the email link 404s.

**Three independent gates:** (1) password [Supabase], (2) email confirmation [Supabase],
(3) owner approval [`status==='active'` in the staff sheet]. The **real data gate** is
the GAS `data` endpoint — it returns rows only when the caller's status is `active`,
so bypassing the login UI still yields no data.

- **Owner** = staff row `is_owner=TRUE` → `SESS.isOwner` → session never expires, no
  countdown chip. `body.is-owner` (toggled on `fore-session-change`) reveals the
  owner-only **Kelola Staff** nav item (`.owner-only`).
- **Normal users** → session expires per Supabase token `expires_at`, countdown chip shown.
- Tokens stored in `sessionStorage` — closing tab logs out (intentional).
- `SESS.clear()` also wipes `localStorage` (legacy cleanup).

### Client timers (all `setInterval`)

- `_sessTimer` — 1s session countdown tick (drives the expiry chip)
- `_heartTimer` — every 5 min: `sb.auth.getSession()` refreshes Supabase token; if gone → `endSession('expired')`
- Clock — 30s `updateClock()`

A `fore-session-change` DOM event fires on login/logout; the screenshot guard listens for it.

## GAS Backend (Code.gs) — Data + staff identity/approval

GAS owns the sales CSV (sheet `bacot`) **and** the `staff` sheet (identity + status
source of truth). Spreadsheet ID: `1Y49X7Gj2Zy8XaX85ONHQTXnd3ItrmwPZHA2MXlRy4gU`.
**No `service_role`/master key** lives here — only the public anon key (safe). GAS
verifies callers via Supabase `GET /auth/v1/user` with the caller's token → email →
staff row. See `backend/SETUP.md`.

`staff` sheet columns: `fore_id | email | status | is_owner | created_at | approved_at | last_seen`.
Status flow: `pending` → `active` → `disabled`. "Online" = `last_seen` within 3 min.

GAS endpoints (`doGet` only, JSONP — append `?action=…&callback=cb` to `GAS_URL`):
- `register`(fore_id,email) — reserve a **pending** row (client then does Supabase signUp); also emails all owners (`is_owner=TRUE`) via `MailApp.sendEmail` so the owner knows to approve (best-effort, never blocks registration — needs the GAS Gmail scope re-authorized on deploy)
- `resolveLogin`(fore_id) — → `{email,status,is_owner}` (no secrets); drives login
- `data`(token) — **the real gate**: rows only if caller status `active`; updates `last_seen`
- `me`(token) — session restore / isOwner
- `listStaff`(token) — owner-only: full list + `online` flag
- `setStatus`(token,fore_id,status) — owner-only: approve / disable / re-enable
- `deleteStaff`(token,fore_id) — owner-only: remove staff row (revokes access)

All GAS calls go through `gasCall(action, params)` which injects a JSONP `<script>` tag (avoids CORS).

## Performance Rules (do not break these)

### `_renderedPages` Set (root cause fix for page-switch lag)

Pages are only built once per dataset. Tab switches to already-rendered pages do zero chart work.

```javascript
let _renderedPages = new Set();
// In showPage(): only call renderPage(p) if !_renderedPages.has(p)
// Clear on: data reload, theme change
// Add on: successful renderPage()
```

**Never** call `renderPage()` on every `showPage()` call. That was the root cause of 50–150ms main-thread blocks on every tab switch.

### Chart gradient caching (`chart._gradCache`)

```javascript
function grad(ctx, color, a1, a2) {
  const cache = chart._gradCache || (chart._gradCache = {});
  const key = color+'|'+a1+'|'+a2+'|'+h;
  if (cache[key]) return cache[key];
  // create and cache gradient
}
```

Never create canvas gradients inside animation callbacks. Always cache per chart instance.

### Card entrance animation gating (`body.dr-animating`)

Card/KPI entrance animations (`dr-rise-in`) are scoped to `body.dr-animating` only, which is added during the initial dashboard reveal and removed after 1.5s. This prevents card jitter on the *initial* reveal cascade.

```css
body.dr-animating .card { animation: dr-rise-in 0.55s ... }
/* NOT: body.dashboard-ready .card { ... } */
```

**Per-page-switch chart replay (`replayPageCharts`)**: On every tab **revisit**, `showPage` calls `replayPageCharts(pageEl)` → for each `<canvas>` on the page, `Chart.getChart(cv).reset(); .update()`, which re-runs the entrance **draw** animation **without rebuilding** (no `innerHTML`, no `new Chart()`). It's far lighter than `renderPage()` so charts re-animate on every visit AND it stays smooth. Deferred one `requestAnimationFrame` so the synchronous part never blocks the switch; skipped under `prefers-reduced-motion`. First visit still animates via the normal `renderPage()` build (don't double up). The page keyframe (`page-swap-in`) stays **opacity-only** — never translate the whole page (re-rasterises canvas+blur → shake; this was tried as a `.chart-wrap`/`.card` CSS rise and removed). `will-change` on `.reveal` is scoped to `body.dr-animating` only (was permanent → idle GPU layers on iPad). Hover: `transitions.active.animation.duration=0` in `baseOptions()` makes hover instant (no per-frame gradient redraw — that was the hover "stutter").

### Chart draw animation gating (`_chartAnim`)

```javascript
let _chartAnim = true; // true = show chart draw animation on (re)build
// Stays true for the whole session — DO NOT flip it false on a timer.
```

`_chartAnim` stays `true`. Charts only ever (re)build inside `renderPage()`,
which runs **once per page per dataset** (deduped by `_renderedPages`) — i.e.
only on a real change: first visit to a page, filter change, or theme change.
Cached tab switches don't *rebuild* (no `renderPage()`); they replay the
existing charts' draw via `replayPageCharts` (intentional — owner wants the
entrance on every visit). So animating the draw is always wanted.

**History — do not re-add a timed `_chartAnim = false`.** An earlier version
flipped it false ~1.5–1.6s after load. Owner sessions never expire and always
take the resume path, where data arrives via JSONP *after* that timer fired —
so charts built with `_chartAnim` already false and animated **not at all**
(reported bug). Fixed by leaving it true.

### Page switch build/fade ordering (`showPage`)

First visit to a page builds it (Chart.js + heavy `innerHTML`) synchronously.
That build must NOT run in the same frame as the `page-swap-in` fade or the
fade drops frames and looks choppy. `showPage()` keeps the page `active` (so
charts size correctly) but at inline `opacity:0` during the build, then starts
the fade on the next `requestAnimationFrame` once the main thread is free.
Already-built pages fade immediately. Don't move `renderPage()` back to running
inline right before adding `page-swapping`.

### Progress bar (`@property --p`)

Uses `@property --p` (registered CSS custom property) so `transition: --p` works reliably. Do NOT revert to `transition: transform` via var() — that was unreliable.

The indicator dot is counter-scaled: `transform: scaleX(calc(1 / max(var(--p, 0.15), 0.15)))` so it stays circular as the bar grows.

## Insight Page (`#page-insight`)

Deeper behavioral analytics — the "why/patterns" layer beyond Channel/FLDT/D2D. Own
date picker (`insight-start/end`, DRP pattern). `renderInsight()` (deduped by
`_renderedPages`) filters via `filterData` → `aggregateData` and builds 3 sections:
- **Perilaku Channel:** `buildInsAtv` (basket value = channel sales ÷ channel transactions,
  horizontal bar) + `buildInsSplit` (Offline · Online · **Delivery = Grab+Go+Shopee**, 3-way
  stacked-area trend + % share chips).
- **Produk & Upsell:** `renderInsAttach` (Topping/cup, Food/trx, RTD/trx ratios) +
  `renderInsProduct` (**Food revenue in Rp + % of GMV** — the only rupiah product line; RTD &
  Seasonal are **qty only**, a real data limit).
- **Pola Waktu:** `buildInsWeekday` (avg GMV by day-of-week, Mon→Sun, weekend bars in amber).

## Comparison Page (`#page-period`)

Nav item is **"Comparison"** (renamed 2026-07-19, was "Week to Week" — owner
compares flexibly, e.g. a week of this month vs the same week last month).
Weekly-mode labels are **dynamic** via `periodLabels()` (single source of
truth): week names ("2 Minggu Lalu / 1 Minggu Lalu / Minggu Ini", short
`W-2/W-1/W0`) appear ONLY when the 3 ranges are 3 aligned consecutive weeks
anchored on the Monday of the current calendar week (exactly the
`setDefaultDates` pattern); otherwise every label shows the real date range
(`dd/mm–dd/mm`, short `P1/P2/P3` with full range in `title=`), empty slot →
"Periode n". Consumers: card headings + the 2 compare-card title spans
(`refreshPeriodLabels()`, called from `loadPeriod()` → runs on every range
change), trend legend (`buildWeeklyTrend`), compare tables
(`buildWeeklySummary`), CAGR `<th>` (`buildCagrTable`). The FLDT
"Komposisi Cup" title (`#fldt-cup-title`) is set in `renderFldtWeekly()` at
**build time**, NOT in the live refresh — `fldtData[1..3]` is never
invalidated on range change (pre-existing), so a live label could describe
ranges those charts aren't showing. Don't re-hardcode week names anywhere on
this page.

## Navigation (`#main-nav`)

Mobile (`≤768px`): fixed **bottom tab bar**, icon-only (labels hidden), gold pill behind active icon.

Desktop (`≥769px`): a **floating dock** in BOTH states — expanded = the same dock widened to the right to reveal labels; collapsed = narrowed to icons. Same float/center/round/glass; only `width` changes (214px ↔ 64px). **Collapsed (dock) by default** on entry — `initSidebar()` collapses unless the user explicitly expanded this session (`sidebarCollapsed==='0'`). Toggled by `toggleSidebar()` (persisted in `sessionStorage` `sidebarCollapsed`: `'1'`=dock, `'0'`=expanded). Clicking a page while expanded auto-collapses back to the dock (in `showPage`, guarded by `btn` truthy = real tap).
- **Expanded** (232px): edge-docked, "Fore Coffee" wordmark + per-item labels, pushes content via `.app-body { margin-left: 232px }`.
- **Collapsed → floating macOS-style dock** (`#main-nav.collapsed`): detaches from edge (`left:14px`, vertically centred), rounded + frosted glass, icon-only tiles, content gutter `margin-left: 88px`.

**Smoothness invariants (don't regress — these were the "patah-patah" bug):**
- `#main-nav` is `position:fixed`, so animating its geometry (`width/top/left/transform/border-radius`) does **not** reflow the document. Keep the open/close motion on the fixed nav.
- **Content push = real `margin-left` animation (240px↔88px)** so content genuinely narrows/widens ("terdorong"). translateX was tried to avoid reflow but clipped ~152px of content off-screen on expand ("mengecil" — owner rejected). `Chart.defaults.resizeDelay=160` keeps charts from re-rendering per frame during the push (residual layout reflow remains — acceptable trade for no clipping). Nav open/close speed: `--nav-ease` + `0.55s` (easeInOutQuart); label uses `max-width`+opacity so closing mirrors opening. Dock total height identical in both states (button 44, toggle 40, vertical margin 2) so the toggle never shifts vertically.
- **Dock magnification** (`initDockMagnify`): on `pointermove` over the collapsed dock, each `.nav-btn` scales via `--mag` (cosine falloff, `DOCK_MAX_SCALE`/`DOCK_RADIUS`). Pointer math is **rAF-throttled** (one apply per frame); resting icon centers are cached on entry (`_dockCenters`) so distance never feeds back on the applied transform. Icons magnify (`--mag`) AND push neighbours apart (`--ty`, `DOCK_SPREAD`) so tiles never overlap. First entry keeps the CSS transition (smooth grow-in); after ~190ms JS adds `.dock-snap` to make subsequent per-frame steering instant (no rubber-band). `will-change:transform` + `z-index` set only while live (`.dock-live`), cleared on `pointerleave`/expand via `resetDockMagnify()`. Touch vs precise is gated per-event by `e.pointerType` (`touch` skipped) — **NOT** a `(pointer:fine)` media query: iPadOS reports `(pointer:coarse)` even with a trackpad attached, which would wrongly disable the dock there. Also disabled under `prefers-reduced-motion`. Transform-only — never touches layout.
- Was a CSS parse bug here once: a bare `--ease-out-expo:` declaration sat directly inside `@media (min-width:769px)` (outside any selector), which invalidated the **entire** block and collapsed the sidebar to a horizontal row. Custom props must live inside a selector (`:root{}`).

## Design System

**Quiet Ledger calm pass (all `.page`s)**: every dashboard page is flattened — data `.card`/`.metric-card` are flat solid surfaces (`--bg2` / `#fff`), hairline borders, calm hover (border-color only, no lift), **NO glass blur, NO glow** (`text-shadow:none` across `.page`, progress bars thin/solid/flat, hero orbs hidden), and `tabular-nums` throughout. Glass identity is **kept only on chrome (nav/header) + the map reveal** (both live outside `.page`). Big value numbers are **neutral**; colour is reserved for genuine status: Achievement/Daily Pace, the metric-card status **sub** (`sc`: green=good, red=warning, grey=neutral — set in `renderKpi`), and channel identity (dot/bar/%). Don't reintroduce glow/glass on data surfaces.

**Dark mode** (default):
```css
--bg: #0a0a0b; --bg1: #101012; --bg2: #161618; --bg3: #1e1e21; --bg4: #27272a;
--gold: #c9a84c;        /* accent only, not chrome */
--cyan: #c9a84c;        /* alias for gold (legacy --cyan usages) */
--t1: #fafafa; --t2: #a1a1aa; --t3: #71717a; --t4: #3f3f46;
--red: #f87171;         /* negative delta only */
```

**Light mode**: defined with `[data-theme="light"]` — every CSS color must have both dark and light variants.

**Theme persistence**: `toggleTheme()` → `applyThemeSwap()` writes `localStorage 'foreTheme'`. A tiny inline `<head>` script applies the saved theme before first paint (no flash); `initTheme()` syncs the JS `TC` colours on load. Toggle available in the app header AND on the device-selection screen (`#device-theme-btn`). (localStorage is fine here — it's a UI pref, not an auth token.)

**Single accent**: The entire chrome uses gold `#c9a84c`. `--cyan`, `--green`, `--pink`, `--violet`, `--blue`, `--teal` are all aliased to gold. Only `--red` and `--amber` differ (red for negative, amber for warnings).

**Channel colors** (the one data-identity exception to gold-only, per owner request): each sales channel has a fixed hue used everywhere (tabs, dots, cards, charts). Defined as `--tc-*` CSS tokens in BOTH themes (light variants deepened for legibility on cream) AND mirrored in the JS `TC` object (charts can't read CSS vars) — **keep the two in sync**. Tab-pill tints derive from the tokens via `color-mix`, so each channel only needs its one token updated.
- `--tc-offline` = blue · `--tc-online` = yellow · `--tc-grabfood` = dark green · `--tc-gofood` = light green · `--tc-shopee` = orange

**Typography**: Geist (UI, swapped from Inter 2026-07 — a motion/design audit flagged Inter as the generic "AI-default" font; Geist keeps the same neutral character with more presence), JetBrains Mono (numbers/code). `Fira Sans` was dropped from the Google Fonts load at the same time — it was loaded but never referenced anywhere in the CSS.

**Rule**: Gold accent for data/KPIs only. Chrome/nav/borders stay neutral Zinc/Slate.

**Design tokens** (`:root` + `[data-theme="light"]`): colour ramp `--bg..bg4`, `--t1..t4`, single accent `--gold`/`--cyan` (aliased), semantic `--red`/`--amber`/**`--success`**, channel `--tc-*`; **type scale `--fs-caption(12)/label(13)/body(14)/data(15)/h3(18)/h2(22)/hero`** + `--lh-*`; spacing `--sp1..8`; radius **single scale `--r2(6)/r3(10)/r4(14)/r5(18)/r6(22)/r7(28)`** (legacy `--r-sm..xl` removed); elevation `--e0..e4`; motion `--ease-out/smooth/bar/inout`.

### Component inventory (de-facto design system — vanilla classes, no framework)

- **Atoms:** `.badge`(`.up/.dn/.warn/.neu` — up/down carry ↑/↓ shape cue), `.drp-btn`, `.reg-btn`, `.inp`, `.nav-btn`, `.chip`, `.toast`(`.info/.error/.success`), `.drp-preset`.
- **Molecules:** `.metric-card`, `.summ-kpi-card`, `.fldt-card`, `.rank-row`, `.filter-group`, `#data-error` banner, the DRP popup (`#drp-popup` + presets), `.mr-joke` toast.
- **Organisms:** `#kpi-hero`, `#main-nav` dock, channel tabs, D2D table (`renderD2D`), All Summary (`renderAllSumm`), the map reveal.
- **Feedback:** `toast(msg,type)` for transient, `#data-error` for load failures. **Never `alert()`.**

## Service Worker

`sw.js` — bump `CACHE_VERSION` on **every deploy**. Currently `fore-v138`.

Strategy:
- `index.html` / navigations → Network first, cache fallback (offline)
- Static assets (icons, manifest) → Cache first
- Cross-origin (GAS, fonts, CDN) → Network only, never cached

## Map (Jakarta regions)

Real GeoJSON ADM2 boundaries for 5 DKI Jakarta regions rendered inline as SVG (viewBox `1000×979`; the region `<path>`s are baked — there is no live projection function). Store dots (`STORE_POINTS`) are positioned with `x/y` coords in that viewBox. Light mode map outline uses `--t3`, not gold.

**Placing new store dots from lat/lng**: the projection is ~linear over Jakarta, so `x = (lng−106.686)/(106.973−106.686)·1000` and `y = (lat−(−6.089))/((−6.371)−(−6.089))·979`, then offset-calibrated so Kemang (`-6.2605,106.8133`) lands on its known `(449,587)`. Good to ~±10px; nudge `x/y` after. (Don't ask the user for coords — compute them.)

**Locked stores**: each `STORE_POINTS` entry may set `locked: true` (no data yet). Locked dots render as a small grey dot (`r=4.5`), no pulse/ring/glow (`.mr-locked`); hovering any dot reveals its label. Tapping a locked dot calls `showLockedTease()` — a partial zoom+blur toward it + a random cringe one-liner from `MAP_JOKES` in a `.mr-joke` toast, then it eases back (never enters the dashboard). Unlocked dots (currently only Kemang, `r=7.5`) dive into the app as before. Flip `locked:false` once a store has data. `_mapAnimating` guards taps mid-tease.

**Map zoom/pan (`enableMapZoom`)**: the reveal map supports pinch / drag / wheel zoom+pan (so clustered dots can be spread and tapped). Mutates the SVG `viewBox` (crisp vector zoom, 1×–6×), kept separate from the dive's CSS transform so they don't fight. `.mr-map` needs `touch-action:none`. Resets to full view each reveal. A drag sets `_mapPanned` so the dot click ignores the click that ends a pan; pointer capture is only taken once a real drag/pinch starts, so taps still select dots.

**Post-login reveal**: after grant, the Fore logo animates for ~2s then "deflates", and the Jakarta map fades in (`opacity:0` → `.mr-show`) with a zoom — tuned so it does not cover the logo background. The user is fond of this; don't shorten or flatten the reveal without asking. Store dots are clickable.

## Screenshot Protection

A full-screen `#screen-guard` overlay blacks out the app whenever a **non-owner** session sends the page to the background — `visibilitychange` (hidden), `blur`, and `pagehide`. This catches the preview frame mobile OSes grab for the app switcher / screenshot animation, so non-owners can't capture content. Owner sessions are exempt (`SESS.isOwner`). Re-evaluated on the `fore-session-change` event.

**History — do not re-introduce the flicker.** An earlier version kept a "flicker layer" continuously on for non-owner sessions, which made the user's screen visibly flicker during normal use (a reported bug). That was removed. The current guard is `display:none` by default and only `display:block` when it has BOTH `guard-on` (armed) AND `active` (backgrounded) — so it never appears, and never flickers, while the app is in the foreground.

PDF export (`exportKpiPDF`, KPI Summary page) uses html2canvas + jspdf to render `#kpi-hero` to an A4 PDF, paginating tall images across pages.

## Claude Tooling in this repo (`.claude/`)

These load automatically in every session (web/iPad included) because they live in the repo:

- **`ui-ux-pro-max`** skill (`.claude/skills/ui-ux-pro-max/`) — design intelligence: 67 styles, 96 palettes, 57 font pairings, 99 UX guidelines, 25 chart types, 13 stacks. Use it when designing/reviewing/fixing any UI on the dashboard.
- **Superpowers** plugin (declared in `.claude/settings.json`, marketplace `obra/superpowers-marketplace`) — structured dev methodology: brainstorm → design → plan → TDD → review. Auto-installed at session start from GitHub (needs network).
- **Anthropic skills** (`anthropics/skills` marketplace, declared in `.claude/settings.json`): `document-skills` (create/edit Excel, PDF, Word, PowerPoint — use for sales-report exports) + `example-skills` (includes `frontend-design`, `theme-factory`, `webapp-testing`, `brand-guidelines`, etc.). Auto-installed at session start (needs network).
- **`impeccable`** skill (`.claude/skills/impeccable/`) — the most advanced design tool (23 `/impeccable` commands, 44 anti-pattern detectors). Its bundled hook scripts are NOT registered in `settings.json`, so it stays passive (never auto-runs).
- **Ponytail** plugin (`ponytail@ponytail` marketplace `DietrichGebert/ponytail`, declared in `.claude/settings.json`) — "lazy senior developer" efficiency framework: minimal necessary code, YAGNI decision-ladder, review/audit/debt skills. Reinforces the Karpathy Coding Discipline below. Auto-installs at session start **where network allows** (the dashboard-scoped git proxy blocks it in some remote sessions — install is a no-op there, no harm).

### Design-tool precedence (user's rule)

For any UI/design work, **default to `ui-ux-pro-max` + `frontend-design` first**. `impeccable` is the **last resort** — only reach for it when the user explicitly asks for it, when the user asks for "the best / most advanced," or when the first two fall short. **Always confirm with the user before using `impeccable`** (even when they ask for the best). Do not invoke it silently.

**Globally-installed skills used this session (2026-07)** — several third-party design/motion skills were installed globally (`~/.claude/skills/`) and audited against this dashboard:
- **Good fits, safe to reuse:** `web-design-guidelines`, `improve-animations`/`design-motion-principles` (motion audits — respect the documented invariants below, don't re-flag them), `apple-design` (physicality/interruptibility of real gestures — swipe nav, map pan), `redesign-existing-projects` (generic-pattern/AI-slop audit — found the Inter→Geist and z-index-token fixes already applied).
- **Do NOT use `high-end-visual-design`** on this project — it's written for flashy Tailwind/React marketing sites (mandates heavy glass/blur, mesh gradients, glowing orbs, `py-24`+ whitespace). Applying it would directly undo the Quiet Ledger calm pass and reintroduce the exact glass/gradient "AI-slop" that `redesign-existing-projects` itself flags as bad. Evaluated and explicitly skipped 2026-07-12.

## Branch

Active development: `claude/halo-skill-readiness-nlynlg`

Checkpoint before redesign: `checkpoint-pre-redesign` (commit `40a34af`) — restore from here if a redesign goes wrong.

## Known Gaps & Roadmap (design audit 2026-07-03)

Full audit artifact: https://claude.ai/code/artifact/bc0ba79f-aca3-435f-a2b1-47fc1034fb13 — composite **6.3/10**. Strong colour discipline + motion craft; held back by typography, spacing-token adoption, and system-state feedback. Owner decisions: **full type scale (12px floor)**, tackle **Critical + High first**, then review.

**✅ Done (v107) — Critical + High**
- **Data-fail UX** — `loadData()` catch now shows `#data-error` banner + Retry + error toast (no more blank dashboard).
- **Type scale** — `--fs-caption(12)/label(13)/body(14)/data(15)/h3(18)/h2(22)/hero(clamp)` + `--lh-*`; all sub-12px font-sizes (CSS + inline JS) raised to the 12px floor.
- **Toast** — `toast(msg,type)` (`info|error|success`) + `#toast-host`; all 6 `alert()` calls replaced.
- **Skeletons** — `#kpi-skeleton` now shows on every load (not just first), clears on success + error.
- **`--success`** semantic token added (both themes; green ≠ gold).
- **Tables (rescoped):** audit's "sortable tables" does **not apply** — D2D is a chronological time-series (sorting breaks vs-Kemarin/Minggu-Lalu) and already has sticky header + sticky col + zebra; All Summary is KPI cards + bar-list + value-sorted rank + card grid, no data grid. No sort added (would be a regression). Verified sticky/zebra render in both themes.

**✅ Done — Medium (safe, additive)**
- **Date presets** — Hari Ini / 7 / 30 Hari / Bulan Ini in every date picker; trigger map extracted to shared `DRP_TRIGGERS`.
- **Colour-blind status** — all delta badges carry ↑/↓ shape cue (D2D `pFmt` made consistent).
- **Component inventory + token index** — documented in Design System section above.
- **Chart a11y** — `role="img"` + Indonesian `aria-label` on all chart canvases (`CHART_LABELS` + `labelCharts()` at load).
- **Empty-range state** — `#range-empty` message on KPI, Channel, All Summary, Race, Insight (single-range pages) when a valid range has no rows (`showRangeEmpty()`), cleared on page switch. D2D has its own `.empty` message (initial + no-data). (Period + FLDT-weekly share the 3-range picker, "empty" is ambiguous across 3 independent ranges → intentionally excluded. Compare has its own empty → intentionally excluded.) 2026-07-12 audit re-confirmed: every page that can meaningfully show a binary empty state already does — no further work needed here.
- **Metric tooltips** — plain-language `title=` on Achievement / Daily Pace / the 4 strip cards (Target GMV, Gap, Daily Target, Forecast EOM) via `METRIC_TIPS`. Hover-only (owner declined tap affordance).

**⏳ Deferred (risky or own project — need owner decision):** enforce `var(--sp*)` (mass refactor, layout-regression risk), ≥44px touch targets (density trade-off), Cmd-K palette (feature), build-split + Playwright (deploy/infra).

Re-audit 2026-07-12 (same rubric, methodology re-run against current source — full comparison: https://claude.ai/code/artifact/cad4f3b5-29bb-4f92-a1ee-a1c20ecd9c2b): composite **7.25/10** (was 6.3, then 7.0); heuristics **69/100** (was 62). Biggest movers: Typography 4.0→7.0 (12px floor now fully enforced, 0 sub-12px font-sizes left) and Accessibility 5.5→7.5 (keyboard access + focus-trap shipped, `aria-*`/`role=` usage nearly doubled). **Spacing token adoption has not moved at all** — still ~5% (~13 `var(--sp*)` vs ~246 raw `padding`/`gap`), the one system untouched since the original audit. Radius scale confirmed consolidated (legacy `--r-sm..xl` genuinely gone). `--success` token added and in use (11×). Native `alert()` fully gone (0 real calls left).

## Standing Rules

1. Bump `CACHE_VERSION` in `sw.js` on every deploy (currently `fore-v138` → increment to `fore-v139`, etc.)
2. Every CSS color rule needs both dark (`:root`) and light (`[data-theme="light"]`) variants
3. Never split index.html without explicit user request
4. Never use `localStorage` for auth tokens — always `sessionStorage`
5. Never call `renderPage()` on every tab switch — check `_renderedPages` first
6. Never create canvas gradients outside `grad()` caching function
7. Keep entrance animations scoped to `body.dr-animating`, not `body.dashboard-ready`
8. Gold (`#c9a84c`) is the single accent — do not introduce new accent colors into chrome/nav
9. **Update `CLAUDE.md` in the same commit whenever you change architecture, auth, data flow, or any config constant.** This file is the only persistent memory across sessions — if it's stale, every future session will work from wrong assumptions. No exceptions.
10. **No `font-size` below `--fs-caption` (12px)** for real content — use the `--fs-*` scale, never a raw sub-12px value.
11. **User-facing errors/feedback go through `toast(msg,type)` or the `#data-error` banner — never `alert()`.**

## Coding Discipline (Karpathy principles)

1. **Think before coding** — state assumptions; if multiple interpretations exist, present them (don't pick silently); if a simpler approach exists, say so; if something's unclear, stop and ask.
2. **Simplicity first** — minimum code that solves the problem, nothing speculative. No unrequested features/abstractions/flexibility, no error handling for impossible cases. If 200 lines could be 50, rewrite.
3. **Surgical changes** — touch only what's required. Don't "improve" or refactor adjacent code, match existing style, only remove imports/vars your own change orphaned; mention pre-existing dead code instead of deleting it.
4. **Goal-driven execution** — turn the request into verifiable success criteria, then loop until they're met.
