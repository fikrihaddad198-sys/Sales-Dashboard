# Fore Coffee Sales Dashboard — Claude Context

A single-file PWA sales intelligence dashboard for Fore Coffee Jakarta. Private data protected by a Google Apps Script access-gating backend with Telegram bot approval flow.

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

## Authentication (sessionStorage, NOT localStorage)

- Tokens stored in `sessionStorage` — closing the browser tab/window logs the user out (intentional)
- Session duration: 30 minutes (set in `CFG.SESSION_MIN` in Code.gs)
- Owner = ID `1` AND name `Fikri` must BOTH match (case-insensitive). Anyone entering owner ID `1` with a different name is treated as a normal user requiring Telegram approval.
- **Owner sessions never expire** (unlimited) and show no countdown chip. Normal users get a 30-min countdown chip.
- On every data request the token is validated server-side

### Client timers (all `setInterval`)

- `_pollTimer` — polls `apiPoll` while waiting for owner approval
- `_sessTimer` — 1s session countdown tick (drives the expiry chip)
- `_heartTimer` — 30s heartbeat (`apiHeartbeat`, keeps `lastSeen` fresh)
- Clock — 30s `updateClock()`

A `fore-session-change` DOM event fires on login/logout; the screenshot guard listens for it.

```javascript
const SESS = {
  get token(){ return sessionStorage.getItem('foreToken'); },
  // set / clear also wipes localStorage (legacy cleanup)
};
```

## GAS Backend (Code.gs)

```javascript
const CFG = {
  SPREADSHEET_ID : '1Y49X7Gj2Zy8XaX85ONHQTXnd3ItrmwPZHA2MXlRy4gU',
  DATA_SHEET     : 'bacot',
  ACCESS_SHEET   : 'access',
  TG_BOT_TOKEN   : '8868940589:AAGXIwtUISRupnB5vHtxBtk0I8tvKbLLmHg',
  TG_OWNER_CHAT  : '7316023785',
  SESSION_MIN    : 30,
  OWNER_IDS      : ['1'],
  OWNER_NAME     : 'Fikri',
};
```

**Polling architecture** (NOT webhook): Apps Script `/exec` always responds with HTTP 302 to POST, which Telegram treats as an error and retries indefinitely — jamming the delivery queue. Solution: `pollTelegram()` runs via a 1-minute time-driven trigger using `getUpdates`. `notifyOwner()` still sends messages instantly; only button-tap processing has ≤1 min latency.

GAS endpoints (`doGet` only, JSONP):
- `register` — submit access request, triggers Telegram notification to owner
- `poll` — check if owner approved/rejected
- `data` — return CSV data (validates token first)
- `me` — validate token, return user info
- `heartbeat` — update `lastSeen` timestamp (col J in access sheet)
- `kick` — owner revokes a live session

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

## Design System

**Dark mode** (default):
```css
--bg: #0a0a0b; --bg1: #101012; --bg2: #161618; --bg3: #1e1e21; --bg4: #27272a;
--gold: #c9a84c;        /* accent only, not chrome */
--cyan: #c9a84c;        /* alias for gold (legacy --cyan usages) */
--t1: #fafafa; --t2: #a1a1aa; --t3: #71717a; --t4: #3f3f46;
--red: #f87171;         /* negative delta only */
```

**Light mode**: defined with `[data-theme="light"]` — every CSS color must have both dark and light variants.

**Single accent**: The entire chrome uses gold `#c9a84c`. `--cyan`, `--green`, `--pink`, `--violet`, `--blue`, `--teal` are all aliased to gold. Only `--red` and `--amber` differ (red for negative, amber for warnings).

**Channel colors** (the one data-identity exception to gold-only, per owner request): each sales channel has a fixed hue used everywhere (tabs, dots, cards, charts). Defined as `--tc-*` CSS tokens in BOTH themes (light variants deepened for legibility on cream) AND mirrored in the JS `TC` object (charts can't read CSS vars) — **keep the two in sync**. Tab-pill tints derive from the tokens via `color-mix`, so each channel only needs its one token updated.
- `--tc-offline` = blue · `--tc-online` = yellow · `--tc-grabfood` = dark green · `--tc-gofood` = light green · `--tc-shopee` = orange

**Typography**: Inter (UI), JetBrains Mono (numbers/code).

**Rule**: Gold accent for data/KPIs only. Chrome/nav/borders stay neutral Zinc/Slate.

## Service Worker

`sw.js` — bump `CACHE_VERSION` on **every deploy**. Currently `fore-v63`.

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

## Telegram Bot Approval Flow

1. User submits `register` → GAS sends Approve/Reject buttons to owner's Telegram
2. Owner taps button → `pollTelegram()` (1-min trigger) picks it up → updates access sheet
3. Frontend polls `apiPoll` → gets approved/rejected → grants or denies dashboard access

### Bot commands (handled in `pollTelegram`)

- `/start` or `/id` → replies with the sender's chat ID (use this to get `TG_OWNER_CHAT` during setup)
- `/siapa` → **owner only**; lists users online in the last 3 min with remaining session minutes + a Kick button each
- Kick button (`kick:<idFore>`) → revokes that user's session
- Approve/Reject buttons (`<decision>:<requestId>`) → owner only

One-time setup: run `setupPollTrigger()` once to create the 1-min trigger AND delete the Telegram webhook (getUpdates and a webhook cannot both be active).

## Screenshot Protection

A full-screen `#screen-guard` overlay blacks out the app whenever a **non-owner** session sends the page to the background — `visibilitychange` (hidden), `blur`, and `pagehide`. This catches the preview frame mobile OSes grab for the app switcher / screenshot animation, so non-owners can't capture content. Owner sessions are exempt (`SESS.isOwner`). Re-evaluated on the `fore-session-change` event.

**History — do not re-introduce the flicker.** An earlier version kept a "flicker layer" continuously on for non-owner sessions, which made the user's screen visibly flicker during normal use (a reported bug). That was removed. The current guard is `display:none` by default and only `display:block` when it has BOTH `guard-on` (armed) AND `active` (backgrounded) — so it never appears, and never flickers, while the app is in the foreground.

PDF export (`exportKpiPDF`, KPI Summary page) uses html2canvas + jspdf to render `#kpi-hero` to an A4 PDF, paginating tall images across pages.

## Online User Monitoring

`apiHeartbeat` is called every 30s from the client (`_heartTimer`), updating col J (`lastSeen`) in the `access` sheet. `getOnlineUsers(N)` returns users seen in the last N minutes (used by `/siapa`, default 3 min). `apiKick` lets the owner revoke any live session by `idFore`/token.

`access` sheet columns (`ACCESS_HEADERS`): `requestId, idFore, name, status, token, createdAt, approvedAt, expiresAt, tgMsgId, lastSeen` (lastSeen = col J / index 10).

## Claude Tooling in this repo (`.claude/`)

These load automatically in every session (web/iPad included) because they live in the repo:

- **`ui-ux-pro-max`** skill (`.claude/skills/ui-ux-pro-max/`) — design intelligence: 67 styles, 96 palettes, 57 font pairings, 99 UX guidelines, 25 chart types, 13 stacks. Use it when designing/reviewing/fixing any UI on the dashboard.
- **Superpowers** plugin (declared in `.claude/settings.json`, marketplace `obra/superpowers-marketplace`) — structured dev methodology: brainstorm → design → plan → TDD → review. Auto-installed at session start from GitHub (needs network).
- **Anthropic skills** (`anthropics/skills` marketplace, declared in `.claude/settings.json`): `document-skills` (create/edit Excel, PDF, Word, PowerPoint — use for sales-report exports) + `example-skills` (includes `frontend-design`, `theme-factory`, `webapp-testing`, `brand-guidelines`, etc.). Auto-installed at session start (needs network).
- **`impeccable`** skill (`.claude/skills/impeccable/`) — the most advanced design tool (23 `/impeccable` commands, 44 anti-pattern detectors). Its bundled hook scripts are NOT registered in `settings.json`, so it stays passive (never auto-runs).

### Design-tool precedence (user's rule)

For any UI/design work, **default to `ui-ux-pro-max` + `frontend-design` first**. `impeccable` is the **last resort** — only reach for it when the user explicitly asks for it, when the user asks for "the best / most advanced," or when the first two fall short. **Always confirm with the user before using `impeccable`** (even when they ask for the best). Do not invoke it silently.

## Branch

Active development: `claude/charming-mayer-5l3pru`

Checkpoint before redesign: `checkpoint-pre-redesign` (commit `40a34af`) — restore from here if a redesign goes wrong.

## Standing Rules

1. Bump `CACHE_VERSION` in `sw.js` on every deploy (currently `fore-v63` → increment to `fore-v64`, etc.)
2. Every CSS color rule needs both dark (`:root`) and light (`[data-theme="light"]`) variants
3. Never split index.html without explicit user request
4. Never use `localStorage` for auth tokens — always `sessionStorage`
5. Never call `renderPage()` on every tab switch — check `_renderedPages` first
6. Never create canvas gradients outside `grad()` caching function
7. Keep entrance animations scoped to `body.dr-animating`, not `body.dashboard-ready`
8. Gold (`#c9a84c`) is the single accent — do not introduce new accent colors into chrome/nav

## Coding Discipline (Karpathy principles)

1. **Think before coding** — state assumptions; if multiple interpretations exist, present them (don't pick silently); if a simpler approach exists, say so; if something's unclear, stop and ask.
2. **Simplicity first** — minimum code that solves the problem, nothing speculative. No unrequested features/abstractions/flexibility, no error handling for impossible cases. If 200 lines could be 50, rewrite.
3. **Surgical changes** — touch only what's required. Don't "improve" or refactor adjacent code, match existing style, only remove imports/vars your own change orphaned; mention pre-existing dead code instead of deleting it.
4. **Goal-driven execution** — turn the request into verifiable success criteria, then loop until they're met.
