# Store Scoping per User — Idea (parked)

**Status:** Approved design, implementation deferred (owner: "save dulu ide untuk nanti"), 2026-07-03

## Goal
Each staff user is bound to ONE store; only the owner can assign/change it (in
Kelola Staff). A user can only see data for their assigned store — any other
store is treated as locked / no data. Enforcement is server-side (GAS `data`),
not just hidden in the UI.

## Owner decisions (finalized)
- Data `bacot` currently has **no per-row store column** — all data is one store (Kemang).
- **Owner assigns the store** (NOT chosen at register). Register form unchanged.
- **One store per user** (no multi-store / area-supervisor).

## Design (approved, not yet built)

**Data model:** add column **`store`** (col H) to the `staff` sheet.
- empty = not set → active user still sees NO data (locked), message "toko belum di-set".
- a store name (e.g. `Kemang Raya`) = user sees only that store.
- owner (`is_owner=TRUE`) = always sees all stores, unaffected.

**Enforcement — GAS `apiData`:**
- owner (or store `*`) → full CSV.
- scoped user → filter rows where the row's store === staff.store.
- Data has no store column yet → treat every row's store as `CFG.DEFAULT_STORE = 'Kemang Raya'`.
  - user assigned Kemang Raya → sees Kemang data.
  - user assigned any other store → 0 rows (locked) — exactly the desired behavior.
- Auto-detects a real store column later (header matching /store|toko|outlet|cabang/i),
  so it starts filtering for real once multi-store data lands — no code change needed.
- user active but store empty → `{ ok:false, error:'no_store' }`.

**New GAS endpoint:** `setStore(token, fore_id, store)` — owner-only; writes staff.store.

**Client (`index.html`):**
- Kelola Staff: each non-owner row gets a **store dropdown** (options from `STORE_POINTS`
  names + "(belum di-set)"); change → `gasCall('setStore',…)`.
- `loadData()`: friendly message for `error:'no_store'` (and `inactive`).
- Map/Compare need no special work — they naturally show only the rows GAS returns.

**Files touched:** `backend/Code.gs` (store col + filter + setStore), `index.html`
(dropdown + no_store message), `backend/SETUP.md` + `CLAUDE.md`.

**Owner one-time step when built:** add `store` header (col H) to the `staff` sheet,
re-paste `Code.gs`, redeploy.
