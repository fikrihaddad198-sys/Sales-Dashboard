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

### CDN dependencies (loaded in `<head>`)

- Chart.js `4.4.1` — all charts
- xlsx `0.18.5` — Excel parsing
- html2canvas `1.4.1` + jspdf `2.5.1` — KPI PDF export
- Fonts: Inter, JetBrains Mono, Fira Code, Fira Sans (Google Fonts)

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

Card/KPI entrance animations (`dr-rise-in`) are scoped to `body.dr-animating` only, which is added during the initial dashboard reveal and removed after 1.5s. This prevents card jitter on every page switch.

```css
body.dr-animating .card { animation: dr-rise-in 0.55s ... }
/* NOT: body.dashboard-ready .card { ... } */
```

### Chart draw animation gating (`_chartAnim`)

```javascript
let _chartAnim = true; // true = show entrance animation
// Set to false after dr-animating ends (1.5s after reveal)
// Reset to true in grantAccess() so next login gets animation again
```

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

**Typography**: Inter (UI), JetBrains Mono (numbers/code).

**Rule**: Gold accent for data/KPIs only. Chrome/nav/borders stay neutral Zinc/Slate.

## Service Worker

`sw.js` — bump `CACHE_VERSION` on **every deploy**. Currently `fore-v45`.

Strategy:
- `index.html` / navigations → Network first, cache fallback (offline)
- Static assets (icons, manifest) → Cache first
- Cross-origin (GAS, fonts, CDN) → Network only, never cached

## Map (Jakarta regions)

Real GeoJSON ADM2 boundaries for 5 DKI Jakarta regions rendered inline as SVG. Store dots (`STORE_POINTS`) are positioned with `x/y` pixel coords relative to the 640×520 SVG viewport. Light mode map outline uses `--t3`, not gold.

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

1. Bump `CACHE_VERSION` in `sw.js` on every deploy (currently `fore-v45` → increment to `fore-v46`, etc.)
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
