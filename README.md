# Amazing Assistants Online — Landing Site

Standalone marketing SPA, membership pages, and paste packs for Amazing Assistants Online.

## Quick start

Prefer **`index.html`** (includes live API wiring when configured). Serve the folder:

```bash
npx --yes serve .
```

Then visit the local URL shown in the terminal.

`AAO_Website_hallmark.html` and `Amazing_Assistants_Online_Home.html` may lag behind `index.html`. Deploy **`index.html` + `aao-config.js` + `aao-api.js`** for the current app.

## What's included

- Marketing SPA (`index.html`)
- `aao-config.js` / `aao-api.js` — empty config = demo mode; filled = Job Board live mode
- `pages/` — membership purchase, thank-you, talent/how shells
- `assets/`, design tokens, messaging/payments example configs
- `_headers` — Netlify-style security headers (CSP, frame deny, nosniff, etc.)

## Config

Copy the example files and fill in your values:

- `payments-config.example.js` → `payments-config.js`
- `messaging-config.example.js` → `messaging-config.js`
- `aao-config.js` — set `apiBase`, `supabaseUrl`, `supabaseAnonKey` for live mode

Do not commit live checkout URLs, service-role keys, or other secrets. The Supabase **anon** key is public by design.

## Security

- **Demo vs live:** empty `aao-config.js` keeps sample data and localStorage membership/hires. Those client flags are **not** payment proof.
- **Live membership:** `?paid=1` does **not** unlock messaging when the API is configured. Entitlements must come from the backend (webhook / profile flag).
- **CSP:** meta CSP on `index.html` plus `_headers` for hosts that support it. The large inline SPA script still needs `'unsafe-inline'` for now.
- **Host headers to enable:** CSP, `Strict-Transport-Security` (HTTPS only), `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, `X-Content-Type-Options: nosniff`.
  - **Netlify:** ships via `_headers` in this folder.
  - **Vercel:** mirror the same keys in `vercel.json` `headers`, or use a `_headers`-compatible adapter.
  - **GitHub Pages:** cannot set most response headers; rely on the CSP `<meta>` in `index.html` and prefer a host that supports `_headers` for HSTS/frame deny.
- **Backend still required for:** payment webhooks, Supabase RLS, rate limits, Turnstile secret, CORS allowlist.

## Membership paste pack

See `pages/ghl-membership/README.md` for funnel header, hero, order, footer, and thank-you sections.
