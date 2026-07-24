# Product

## Register

product

## Users

Fikri (owner, ID 1) — monitors daily/weekly sales performance across all Fore Coffee Jakarta stores from mobile and desktop. Checks KPIs, channel breakdowns, store comparisons, and day-to-day trends. Sessions are private and short-lived (30 min for staff, unlimited for owner). Staff users require Telegram-approved access.

## Product Purpose

Private PWA sales intelligence dashboard for Fore Coffee Jakarta. Pulls live data from Google Sheets via a GAS backend. Gives the owner and approved staff instant visibility into GMV, channel performance (Offline, GoFood, GrabFood, Shopee, TikTok, Online), store comparisons, and race-to-target progress — all offline-capable via service worker.

## Brand Personality

Precise. Calm. Trusted.

Fore Coffee is an Indonesian specialty coffee brand with physical stores. The dashboard is an internal operational tool — it must feel like a premium instrument, not a consumer app or a generic SaaS admin panel. Data is the content; chrome is invisible infrastructure.

## Anti-references

- Generic SaaS admin panels (white background, blue primary, Tailwind component kits)
- Glassmorphism-heavy dark dashboards (frosted cards everywhere, neon glow, gradients)
- Consumer-facing "beautiful" dark apps with big hero numbers and gradient text
- Retool / Metabase defaults — functional but zero personality
- Notion / Linear sidebar aesthetic — clean but wrong register (tool for creators, not ops)

## Design Principles

1. **Data is the hero** — Chrome (nav, header, controls) stays neutral and invisible. Color is reserved for data identity (channel colors) and genuine status signals (gold for active/accent, red for negative delta).
2. **Calm confidence** — No animations that announce themselves. Motion serves orientation, not delight. The dashboard should feel like a precision instrument at rest.
3. **Owner-grade density** — Information is compressed but never cramped. The owner scans fast; every pixel of padding earns its place.
4. **Single accent discipline** — Gold (#c9a84c) is the only chrome accent. No new hues enter chrome or nav. Channel identity colors (--tc-*) are the only exception and live in data surfaces only.
5. **Offline-first trust** — The app must feel instantaneous. Every interaction is local; data fetches are background operations. The UI never blocks on a network call.

## Accessibility & Inclusion

- Target: WCAG AA minimum, AAA where practical (high contrast dark mode by default)
- Reduced motion: `prefers-reduced-motion` must disable all transitions and animations
- Touch targets: minimum 44×44px on all interactive elements (mobile bottom tab bar + desktop sidebar)
- Keyboard navigation: 1–8 shortcuts for page switching, tab order must match visual order
- Color is never the only indicator (channel dots always paired with label text)
