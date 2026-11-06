# AAO Membership paste sections

Self-contained paste packages for a membership funnel / site page. Classes use the `aao-` prefix so they do not collide with host themes.

## Files

| File | Paste into |
|------|------------|
| [`ghl-membership.css`](./ghl-membership.css) | Funnel/Site → **Custom CSS** |
| [`01-header.html`](./01-header.html) | **Custom Header** (or Tracking → header) |
| [`02-hero.html`](./02-hero.html) | Custom Code / HTML element at **top of page body** |
| [`03-order.html`](./03-order.html) | Custom Code around the **Order Form** |
| [`04-footer.html`](./04-footer.html) | **Custom Footer** |
| [`05-thanks.html`](./05-thanks.html) | **Thank-you / success** funnel step body |
| [`full-preview.html`](./full-preview.html) | Local browser preview only |

## Setup (funnel step)

1. Create a funnel step for membership checkout.
2. Paste `01-header.html` into **Custom Header** (styles are **inlined** — Custom CSS is optional).
3. On the canvas, add a **Custom Code** element and paste `02-hero.html`.
4. Add your native **Order Form / Payment** element (AAO Membership product).
5. Optionally paste `03-order.html` and replace the dashed slot with the Order Form element (or paste the embed inside `#aao-order-slot`).
6. Paste `04-footer.html` into **Custom Footer**.
7. In **Tracking Code → header** (once), set your SPA base before the snippets:
   `<script>window.AAO_SITE="https://YOUR-DOMAIN/landing/AAO_Website_hallmark.html";</script>`
   Local preview resolves relative paths automatically when `AAO_SITE` is empty.
8. Add a **thank-you funnel step** and paste `05-thanks.html` (or redirect to the hosted page below).
9. Preferred thank-you URLs:
   - Hosted: `https://YOUR-DOMAIN/landing/pages/membership-thanks.html?paid=1`
   - SPA fallback: `https://YOUR-DOMAIN/landing/AAO_Website_hallmark.html#membership?paid=1`

Optional: also paste `ghl-membership.css` into Custom CSS if you prefer one shared stylesheet and want to strip the `<style data-aao-mem>` blocks from the HTML snippets.

## Notes

- Each HTML snippet includes fonts + CSS inline so sections are not blank/unstyled when pasted alone.
- Logo URL is the CDN mark used on the AAO site.
- Preview locally: open `full-preview.html` or `../membership.html`.
- Source design: `../membership.html` (uses `membership-standalone.css`).
