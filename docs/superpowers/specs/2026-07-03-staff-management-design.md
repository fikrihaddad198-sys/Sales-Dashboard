# Staff Management & Fore-ID Login — Design Spec

**Status:** Draft for owner review · 2026-07-03
**Author:** brainstorming session (owner + Claude)

## Goal

Let the owner manage staff accounts entirely inside the web app — self-service **Register**, **Login with Fore ID** (not email), owner **approval gate**, and an **online-users** view — without ever opening the Supabase dashboard, and **without weakening the private-data protection**.

## Non-goals

- Not replacing Supabase. Supabase still handles the hard/dangerous part (password hashing, sessions, email confirmation). Rolling our own auth is explicitly rejected (security risk).
- Not a public product. This is an internal tool for ≤10 known staff.
- No role hierarchy beyond **owner vs staff** (YAGNI).

## Security model (the spine — do not weaken)

Three independent gates, each necessary:

1. **Password** — Supabase (never in our code).
2. **Email confirmation** — Supabase built-in; proves the person owns the email.
3. **Owner approval** — our own `status` flag; proves the owner allows this person to see data.

**The master key (`service_role`) lives ONLY in GAS (server-side), never in `index.html`.** GAS is the trusted broker for every privileged action and re-verifies the caller on each one.

**The real data gate is the data endpoint, not the login screen.** `gasCall('data')` checks the caller's `status === 'active'` server-side before returning any rows. So even if someone bypasses the login UI, they get **no data** unless the owner approved them.

## Data model

**Supabase Auth** (unchanged responsibility): email, password hash, email-confirmed flag, session tokens.

**New Google Sheet tab `staff`** (GAS is source of truth for identity + status):

| col | field | notes |
|-----|-------|-------|
| A | `fore_id` | unique login handle, e.g. `FOR-KEMANG-01`; case-insensitive |
| B | `email` | for verification + maps to the Supabase user |
| C | `status` | `pending` → `active` → `disabled` |
| D | `is_owner` | `TRUE` for the owner row |
| E | `created_at` | ISO |
| F | `approved_at` | ISO, set when owner activates |
| G | `last_seen` | ISO, updated on each data call / heartbeat (drives "online") |

Fore ID ↔ email mapping stays server-side (in the sheet); the client never receives another user's email.

## Flows

### Register (public, but lands as `pending`)
1. Client Register form: **Fore ID · email · password · ulangi password**. Client validates: passwords match, Fore ID format, email format.
2. Client → `gasCall('register', {fore_id, email, password})`.
3. GAS (with `service_role`): reject if `fore_id` or `email` already exists; else **create the Supabase user** (email-confirm required) and append a `staff` row `status='pending'`.
4. Supabase sends the confirmation email automatically.
5. Client shows: "Cek email kamu untuk konfirmasi, lalu tunggu owner mengaktifkan."

### Confirm email
- Staff clicks the Supabase link → email confirmed (Supabase side). `status` in the sheet is still `pending` until the owner approves.

### Login (Fore ID + password)
1. Login form: **Fore ID · password**.
2. Client → `gasCall('resolveLogin', {fore_id})` → GAS returns `{email, status, email_confirmed}` **only enough to proceed**; rejects unknown Fore ID.
3. Client-side guards with clear messages: email not confirmed → "Konfirmasi email dulu"; `status==='pending'` → "Menunggu approval owner"; `status==='disabled'` → "Akun dinonaktifkan".
4. If ok, client calls Supabase `signInWithPassword(email, password)` directly (**password never touches GAS**).
5. On success → normal `grantAccess()`. `SESS.isOwner` derived from the `is_owner` flag returned by GAS (replaces the current `OWNER_EMAIL` check).

### Data access (the enforced gate)
- `gasCall('data')` already passes the Supabase token. GAS resolves token → email → `staff.status`. Returns rows only if `active`. Updates `last_seen`. Non-active → error → client shows the toast/`#data-error` banner.

### Owner: "Kelola Staff" menu (owner-only)
- Hidden entirely unless `SESS.isOwner`.
- **List:** all staff with `fore_id`, `email`, `status`, `email_confirmed`, `last_seen` (+ an "online now" dot for last_seen < N min).
- **Approve:** `gasCall('setStatus', {fore_id, status:'active'})`.
- **Disable / Re-enable:** `setStatus` → `disabled` / `active`.
- **Delete (permanent):** `gasCall('deleteStaff', {fore_id})` → removes Supabase user (admin API) + sheet row.
- Every one of these GAS endpoints **re-verifies the caller is the owner** (token → email → `is_owner`).

### Online monitoring
- `last_seen` is written on each `data` call and each 5-min heartbeat.
- The Kelola Staff list marks anyone with `last_seen` within ~3 min as **online**.

## GAS endpoints (added to `backend/Code.gs`, all JSONP `doGet`)

| action | caller | does |
|--------|--------|------|
| `register` | public | create Supabase user + `pending` staff row |
| `resolveLogin` | public | fore_id → {email, status, email_confirmed} (no secrets) |
| `data` | any logged-in | **now also enforces `status==='active'`** + updates `last_seen` |
| `listStaff` | owner | full staff list + online flags |
| `setStatus` | owner | pending/active/disabled |
| `deleteStaff` | owner | delete Supabase user + row |

Owner verification: GAS calls Supabase `GET /auth/v1/user` with the caller's token → email → matches an `is_owner` row.

## Owner setup (one-time, manual — I'll guide step by step)

1. In Supabase → Auth settings: **enable "Confirm email"** (so registration sends a confirmation link). Ensure the email sender works (Supabase default or your SMTP).
2. Copy the Supabase **`service_role`** key → paste into GAS `CFG` (Apps Script, server-side; never in `index.html`).
3. Create the `staff` sheet tab with the columns above; add **your own owner row** (`is_owner=TRUE`, `status=active`) so you can log in as owner.
4. Redeploy the Apps Script web app (new version).
5. Bump `sw.js` cache and deploy the frontend.

## Client changes (`index.html`)

- Login screen gets **two tabs/buttons: Masuk / Daftar**.
- **Daftar** form: fore_id, email, password, ulangi password + validation.
- **Masuk** form: fore_id + password (email field removed from login).
- New **Kelola Staff** page (owner-only) in the nav dock, hidden for staff.
- `SESS.isOwner` now comes from GAS `is_owner`, not `OWNER_EMAIL`.

## Open decisions for owner review

1. **Fore ID format** — free text, or a pattern (e.g. `FOR-<store>-<nn>`)? Proposal: free text, 3–20 chars, letters/numbers/dash, unique, case-insensitive.
2. **Owner's own account** — the owner also logs in with a Fore ID (e.g. `owner`), flagged `is_owner=TRUE`. Confirm.
3. **Password rules** — min length? Proposal: min 8 chars (Supabase default is 6; 8 is safer).
4. **"Online" window** — 3 minutes? adjustable.

## Risks / honest notes

- **Biggest effort of the project so far:** touches auth, backend (`Code.gs`), and adds 2 UI surfaces. Realistic multi-task build.
- **Email deliverability:** Supabase's default email sender is rate-limited and can land in spam. For reliable confirmation emails you may later need SMTP — note but not blocking for ≤10 staff.
- **JSONP is GET-only:** `register` sends the new password in the URL to `script.google.com` over HTTPS (encrypted in transit, but appears in Google's server logs). For ≤10 staff, low-frequency, acceptable; documented as a known limitation. (Login password does NOT go through GAS — it goes client→Supabase directly.)
- **Migration:** existing Supabase users (currently email-login) need a `fore_id` assigned in the new sheet, or they keep working via a fallback. Plan will include a migration note.
