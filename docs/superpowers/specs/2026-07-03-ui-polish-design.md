# UI Polish & Consistency — Design Spec

**Status:** Approved by owner, 2026-07-03
**Checkpoint:** branch `checkpoint-pre-polish` @ `4e22986` (restore point)

## Goal
Raise the "expensive/deliberate" feel of the dashboard through detail polish and
consistency — WITHOUT breaking the Quiet Ledger calm pass (flat data surfaces,
gold-only accent, glass kept only on chrome + map reveal).

## Constraints (do not break)
- Quiet Ledger: no glow/glass on data surfaces; gold single accent; neutral big numbers.
- Single-file architecture (index.html).
- Bump `CACHE_VERSION` each deploy; update CLAUDE.md on architecture/config changes.
- Every CSS color needs dark + light variants.
- No font-size below 12px; errors via toast/#data-error not alert().

## Scope — 6 items, 2 waves, riskiest last

### Wave 1 — safe + visible (each its own commit)
1. **Emoji → SVG icons (FLDT).** `FLDT_META` uses emoji (☕🧋📔✨🥤🌸) — the only
   place violating "icons = SVG". Replace with line-icons matching the nav set.
2. **Consolidate radius scale.** Collapse legacy `--r-sm..xl` (~4 uses) into the
   dominant `--r2..r7`. Aliasing where values match; nearest token where they differ.
3. **Quiet micro-interactions.** Add a calm, <150ms hover feedback (subtle shadow /
   1px lift) + consistent press feedback on cards/buttons — still Quiet Ledger calm.
4. **Empty states + skeletons.** Unify empty-state style (icon + copy); extend the
   loading skeleton pattern beyond KPI where cheap.
5. **Count-up KPI numbers.** Reuse the Race counter animation on KPI/Channel big
   numbers so they animate up on page reveal.

### Wave 2 — risky, LAST (after Wave 1 approved)
6. **Spacing-token adoption (`--sp*`).** ~123 raw padding + 112 raw gap. Two modes:
   - A = pure aliasing (0 visual change, code hygiene only — invisible to user).
   - B = normalize to 4/8px grid (visible rhythm, but shifts layout).
   Owner picks A or B; if B, done **page-by-page with a visual check each** — never big-bang.

## Abort protocol
- "abort semua" → `git reset --hard checkpoint-pre-polish` + force-push.
- "batalin yang tadi" → revert the last item's commit.
- Claude proactively offers rollback if the owner signals frustration.

## Files
- `index.html` (all items), `sw.js` (cache bump), `CLAUDE.md` (notes).
- No backend changes.
