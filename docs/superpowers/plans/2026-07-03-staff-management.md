# Staff Management & Fore-ID Login — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Backend (`Code.gs`) is deployed & tested by the OWNER in Apps Script — its "verification" steps are owner-run manual checks, not automated. Frontend is `index.html` (single file). Steps use `- [ ]`.

**Goal:** In-app self-service Register + Fore-ID login + owner approval gate + online-users view, keeping Supabase for auth and the `service_role` key server-side in GAS only.

**Spec:** `docs/superpowers/specs/2026-07-03-staff-management-design.md` (read it — it holds the security model and decisions).

**Architecture:** Supabase = auth (email+password, email confirm). GAS = trusted broker (holds `service_role`, owns the `staff` sheet = identity + status source of truth, enforces status on the data endpoint). Client logs in by Fore ID → GAS maps to email → Supabase auth (password never touches GAS).

## Global Constraints (from spec)

- **Fore ID:** numeric string, regex `^\d{3,8}$`, unique, stored/compared as STRING (leading zeros).
- **Password:** min 6 chars.
- **Owner:** a `staff` row with `is_owner=TRUE`, `status=active`; logs in by Fore ID like everyone.
- **Online:** `last_seen` within 3 minutes.
- **`service_role` key lives ONLY in GAS `CFG`** — never in `index.html`, never in a commit that ships to the browser. (GAS source is not served to browsers, so committing it in `backend/Code.gs` is acceptable, same as the existing anon key — but flag it to the owner.)
- **The data endpoint is the real gate:** `data` returns rows only when caller `status==='active'`.
- Single-file `index.html`; every colour rule both themes; bump `sw.js` cache at the end.
- **Do not lock the owner out:** the owner's staff row + Supabase user must exist and be `active` before the new login replaces the old one (Task S0 + S1).

---

## Phase S — Owner setup (manual, owner executes; I provide exact steps)

### Task S0: Supabase + sheet groundwork

- [ ] **Step 1:** Supabase → Authentication → Providers/Email → **enable "Confirm email"**. Confirm the email sender sends (test with your own email).
- [ ] **Step 2:** Supabase → Project Settings → API → copy the **`service_role`** secret key (NOT the anon key).
- [ ] **Step 3:** In the sales spreadsheet (`1Y49…`), add a tab **`staff`** with header row exactly: `fore_id | email | status | is_owner | created_at | approved_at | last_seen`.
- [ ] **Step 4:** Add YOUR owner row: pick a numeric Fore ID (e.g. `100`), your email (the one already in Supabase = `fikrihaddad198@gmail.com`), `status=active`, `is_owner=TRUE`, fill `created_at`/`approved_at` with today. **This guarantees you can log in as owner after the switch.**
- [ ] **Step 5:** For each EXISTING Supabase user, add a `staff` row (assign each a numeric Fore ID, `status=active`, `is_owner=FALSE`). Migration — otherwise they can't log in by Fore ID.

**Verification:** the `staff` tab has a header + your owner row + one row per existing user.

---

## Phase A — Backend: fresh `backend/Code.gs`

**Files:** Rewrite `backend/Code.gs` (replace the transitional Telegram+Supabase hybrid). Owner deploys as a NEW Apps Script version and tests.

**Interfaces — Produces (JSONP `doGet`, `?action=…&callback=cb`):**
- `register` `{fore_id,email,password}` → `{ok, error?}`
- `resolveLogin` `{fore_id}` → `{ok, email?, status?, email_confirmed?, is_owner?, error?}`
- `data` `{token}` → `{ok, csv?, is_owner?, error?}` (enforces `active`, updates `last_seen`)
- `me` `{token}` → `{ok, fore_id, status, is_owner}` (for session restore + isOwner)
- `listStaff` `{token}` → `{ok, staff:[…], error?}` (owner only)
- `setStatus` `{token, fore_id, status}` → `{ok, error?}` (owner only)
- `deleteStaff` `{token, fore_id}` → `{ok, error?}` (owner only)

### Task A1: Write the new Code.gs

- [ ] **Step 1: CFG** — keep `SPREADSHEET_ID`, `DATA_SHEET='bacot'`, `SUPA_URL`, `SUPA_KEY` (anon), `OWNER_EMAIL` (fallback); add `STAFF_SHEET='staff'`, `SUPA_SERVICE_KEY=''` (owner pastes their service_role here in Apps Script), `ONLINE_MIN=3`. Remove all Telegram/`access`-sheet/poll code.

- [ ] **Step 2: Supabase helpers** (via `UrlFetchApp`):
  - `sbUser(token)` → `GET {SUPA_URL}/auth/v1/user` with `Authorization: Bearer token`, `apikey: SUPA_KEY`. Returns `{email, email_confirmed_at}` or null.
  - `sbAdminCreateUser(email,password)` → `POST /auth/v1/admin/users` with `apikey`+`Authorization: Bearer SUPA_SERVICE_KEY`, body `{email,password,email_confirm:false}` (so a confirmation email IS required). Returns created user or throws on duplicate.
  - `sbAdminDeleteUser(email)` → look up user id via `GET /auth/v1/admin/users?email=…` then `DELETE /auth/v1/admin/users/{id}`.

- [ ] **Step 3: staff-sheet helpers** — `staffSheet()`, `staffAll()` (array of row objects), `staffFindByForeId(id)`, `staffFindByEmail(email)`, `staffAppend(obj)`, `staffSet(fore_id, field, value)`. Compare `fore_id` as String.

- [ ] **Step 4: auth resolution** — `callerEmail(token)=sbUser(token)?.email`; `callerRow(token)` → `staffFindByEmail(callerEmail)`; `requireOwner(token)` → row with `is_owner===TRUE && status==='active'`, else throw `'not_owner'`.

- [ ] **Step 5: endpoints**
  - `apiRegister(fore_id,email,password)`: validate `^\d{3,8}$` + email + pw length; reject if fore_id/email exists; `sbAdminCreateUser`; `staffAppend({fore_id,email,status:'pending',is_owner:'',created_at:now})`; return `{ok:true}`. On Supabase duplicate → `{ok:false,error:'email_exists'}`.
  - `apiResolveLogin(fore_id)`: row=find; if none → `{ok:false,error:'not_found'}`; else return `{ok:true,email,status,is_owner:row.is_owner===true||row.is_owner==='TRUE'}`. (email_confirmed is checked client-side after Supabase sign-in, or via sbUser — keep simple: return status; client shows pending/disabled messages.)
  - `apiData(token)`: `row=callerRow(token)`; if `!row || row.status!=='active'` → `{ok:false,error:'inactive'}`; else `staffSet(row.fore_id,'last_seen',now)`; return `{ok:true, csv:readDataCsv(), is_owner:…}`.
  - `apiMe(token)`: return `{ok, fore_id, status, is_owner}` from callerRow (for session restore).
  - `apiListStaff(token)`: `requireOwner`; return all rows + `online = (now-last_seen)≤ONLINE_MIN`.
  - `apiSetStatus(token,fore_id,status)`: `requireOwner`; validate status ∈ {pending,active,disabled}; `staffSet`; if activating set `approved_at`.
  - `apiDeleteStaff(token,fore_id)`: `requireOwner`; `sbAdminDeleteUser(row.email)`; delete sheet row.
  - Keep `readDataCsv()`, `jsonp()`, `doGet()` router.

- [ ] **Step 6: OWNER TEST (manual, after deploy)** — deploy new version; in a browser hit:
  - `…/exec?action=resolveLogin&fore_id=100&callback=cb` → returns your email + active.
  - `…/exec?action=register&fore_id=999&email=test@…&password=secret6&callback=cb` → creates a pending user + you get the confirm email.
  - `…/exec?action=listStaff&token=<your supabase token>&callback=cb` → returns rows (401/not_owner without a valid owner token).
  Expected: each returns JSONP `cb({...})`. Fix in Apps Script until green.

- [ ] **Step 7: Commit** the new `backend/Code.gs` (`feat(gas): staff management backend — register/login/status/admin`).

---

## Phase C — Frontend (`index.html`)

### Task C1: Login/Register UI (Masuk / Daftar tabs)

- [ ] **Step 1:** In `#pin-screen`, replace the single email form with two tab buttons **Masuk / Daftar** and two forms:
  - **Masuk:** `reg-foreid` (numeric), `reg-pw`, button `submitLogin()`.
  - **Daftar:** `reg-foreid2`, `reg-email`, `reg-pw2`, `reg-pw2-confirm`, button `submitRegister()`.
- [ ] **Step 2:** Style tabs (both themes) reusing existing `.reg-*` classes. Numeric inputs `inputmode="numeric"`.
- [ ] **Step 3: Verify** (browser): tabs switch; forms render dark+light; no console error. Commit.

### Task C2: Wire register + Fore-ID login

- [ ] **Step 1: `submitRegister()`** — validate `^\d{3,8}$`, email, pw≥6, pw match → `gasCall('register',{fore_id,email,password})` → on ok: `toast('Cek email untuk konfirmasi, lalu tunggu owner mengaktifkan','success')` + switch to Masuk; on error map `email_exists`/`fore_id_exists`/`invalid` to Indonesian messages.
- [ ] **Step 2: `submitLogin()`** (rewrite) — `gasCall('resolveLogin',{fore_id})`; handle `not_found` / `status==='pending'` ("Menunggu approval owner") / `disabled`; else `sb.auth.signInWithPassword({email, password})`; on `Email not confirmed` → "Konfirmasi email dulu". On success → `SESS.set(...)` + `grantAccess()`.
- [ ] **Step 3:** `SESS.isOwner` now from GAS `me`/`resolveLogin` `is_owner`, not `OWNER_EMAIL`. Update `SESS.set` call sites + the resume path (init IIFE) to fetch `me`.
- [ ] **Step 4: Verify** (owner, live): register a test Fore ID → get email → (owner) approve later → login by Fore ID works; pending/disabled show correct messages. Commit.

### Task C3: "Kelola Staff" page (owner-only)

- [ ] **Step 1:** Add a nav dock item + `#page-staff`, both hidden unless `SESS.isOwner` (guard in `showPage` + hide the nav btn for non-owners).
- [ ] **Step 2:** On open → `gasCall('listStaff',{token})` → render a list: fore_id, email, status badge, online dot (green if online), and buttons **Aktifkan / Nonaktifkan / Hapus** per row.
- [ ] **Step 3:** Wire buttons → `gasCall('setStatus'|'deleteStaff', …)` → `toast` + refresh list. Confirm before delete.
- [ ] **Step 4:** Auto-refresh the online dots every ~30s while the page is open.
- [ ] **Step 5: Verify** (owner, live): approve/disable/delete a test user reflects in the list and in that user's access. Commit.

### Task C4: Ship

- [ ] **Step 1:** Bump `sw.js` cache.
- [ ] **Step 2:** Update `CLAUDE.md` Authentication section (Fore-ID login, staff sheet, owner via `is_owner`, service_role in GAS) + Standing Rules.
- [ ] **Step 3:** Commit + push.

---

## Sequencing & rollback (safety)

1. Do **Phase S** (owner row exists) and **Phase A** (backend deployed + tested) FIRST. Old frontend still works during this — new endpoints are additive; the old `data` endpoint behaviour is preserved.
2. Only after backend is green, ship **Phase C** (frontend switch to Fore-ID login).
3. **Rollback:** if the new login misbehaves, revert `index.html` to the previous commit (email login) — the backend `data`/`me` still work, and your Supabase user is unchanged. You are never locked out because your owner row is `active` and your Supabase email login still exists.

## Self-Review

- **Spec coverage:** register (C2/A1) · Fore-ID login (C2/A1) · email confirm (A1 create with `email_confirm:false` → Supabase sends link) · owner approval gate (A1 `data` status check + C3 setStatus) · online view (A1 `last_seen` + C3) · owner-only menu (C3) · disable+delete (C3/A1). ✓
- **Security:** `service_role` only in GAS CFG; every owner endpoint `requireOwner`; data gate enforced server-side. ✓
- **Lock-out prevention:** Phase S Step 4 + rollback section. ✓
- **Placeholder check:** backend full body is produced at execution (Task A1) — the plan fixes signatures, security logic, and the owner test checklist; the ~400-line implementation is written then, not pre-pasted (deliberate, not a gap).
- **Owner-dependency:** Phases S and A test steps are owner-run (external Apps Script/Supabase) — flagged throughout; this is inherently collaborative.
