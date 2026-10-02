---
phase: 5
title: "Discovery surfaces and document head"
status: pending
priority: P1
effort: "3.5h"
dependencies: [2]
---

# Phase 5: Discovery surfaces and document head

## Goal

The goals of this phase:
- Crawlers get a real `robots.txt` and `sitemap.xml`.
- Token and seller routes send `X-Robots-Tag: noindex, nofollow`, visible without
  JavaScript.
- Shared links render a branded Open Graph card.
- The browser chrome carries the navy brand colour.
- The first paint shows a static shell instead of a blank screen.

This covers P4, P9 (theme-color), P12 and P13 (shell).

## Context

- `apps/web/nginx.conf`: `location /` uses `try_files $uri /index.html`, so
  `/robots.txt` and `/sitemap.xml` return HTML with status 200. No `X-Robots-Tag`
  is set anywhere.
- Production fronts:
  - The VPS uses Caddy (`infra/caddy/Caddyfile`, `reverse_proxy web:80`, whose
    `header` block sets and does not strip).
  - The homelab uses a Traefik `sidecup-headers` middleware
    (`infra/docker-compose.homelab.yml:69-77`).
  - Both pass the upstream response headers through.
- The CSP is `script-src 'self'` and `style-src 'self' 'unsafe-inline'`. The static
  shell may use inline `<style>` or `style=""`, but **no inline script**.
- `index.html`:
  - `theme-color` is `#ffffff`.
  - There is no description and no OG tags.
  - `#root` is empty.
- The hostname differs per deploy: `DOMAIN` on the VPS, and on the homelab
  `DOMAIN=sidecup.cauchuyenlaptrinh.com` (`infra/.env.example:2`). Absolute URLs must
  therefore come from configuration, not be hard-coded.
- User decision: the brand image is generated from tokens. It is generic and
  non-personal: no seller name, table or order.

## Requirements

- **robots and sitemap (P4)**, served by nginx with the request host:
  - `location = /robots.txt`: `default_type text/plain`; return `User-agent: *`,
    `Allow: /` and `Sitemap: https://$host/sitemap.xml`.
  - `location = /sitemap.xml`: `default_type application/xml`; a `urlset` with
    only `https://$host/`.
  - Do **not** `Disallow` `/t/` or `/o/`, so that crawlers can see the `noindex`.
- **`X-Robots-Tag` (P4)**:
  - Routes `^/(t/|o/|seller(/|$)|revoked$)`. Use a regex location that repeats
    `Cache-Control: no-cache` and `try_files $uri /index.html`, because nginx
    `add_header` does not inherit into a location that sets its own.
  - Header: `X-Robots-Tag: noindex, nofollow` (`always`).
  - `/` and `/assets/` must **not** carry it.
- **React fallback:** `useDocumentHead({ noindex: true })` is already wired in
  phases 3 and 4.
- **Head (P9, P12)** in `index.html`:
  - `theme-color` `#233c65`;
  - `<meta name="description">`, a generic one-sentence description in Vietnamese;
  - `og:type=website`, `og:title`, `og:description`, `og:locale=vi_VN`;
  - `twitter:card=summary_large_image`.
  - Absolute `og:image`, `og:url` and `<link rel="canonical">` (pointing at `/`)
    come from a new build variable `VITE_PUBLIC_ORIGIN`. Inject them with a small
    `transformIndexHtml` plugin in `vite.config.ts`, and omit them when the
    variable is empty (dev and E2E).
  - Thread the variable through:
    - `apps/web/Dockerfile` (ARG and ENV);
    - `infra/docker-compose.prod.yml` (`VITE_PUBLIC_ORIGIN: https://${DOMAIN}`);
    - `apps/web/.env.example`.
- **OG image (P12):**
  - `apps/web/public/og-image.png`, 1200×630, under 150 KB.
  - Content: navy background, the orange→crimson accent bar, "Gọi nước tại bàn"
    and "Quét QR · Đặt nước · Trả tiền khi nhận" in Inter Tight.
  - It is rendered by `apps/web/scripts/render-og-image.mjs` using the existing
    `@playwright/test` Chromium and an inline HTML template. Commit both the
    script and the PNG.
- **Static shell (P13):**
  - Inside `<div id="root">`, a centred block using inline styles only:
    - a text brand mark, "Gọi nước tại bàn", in navy;
    - the line "Đang mở menu…";
    - a white background;
    - the system font stack, so it needs no font load.
  - React `createRoot().render` replaces it.
  - The shell has no animation.

## Files

- Modify: `apps/web/nginx.conf`
- Modify: `apps/web/index.html`
- Modify: `apps/web/vite.config.ts` (`transformIndexHtml` plugin for OG and canonical)
- Modify: `apps/web/src/vite-env.d.ts` (`VITE_PUBLIC_ORIGIN` type)
- Modify: `apps/web/Dockerfile`, `apps/web/.env.example`
- Modify: `infra/docker-compose.prod.yml` (web build arg)
- Create: `apps/web/scripts/render-og-image.mjs`, `apps/web/public/og-image.png`
- Modify: `docs/runbook.md` (one paragraph: `VITE_PUBLIC_ORIGIN`, robots, sitemap and the `noindex` routes, and how to regenerate the OG image)

## Steps

1. Add the nginx locations. Validate with `docker run --rm -v $PWD/apps/web/nginx.conf:/etc/nginx/conf.d/default.conf:ro nginx:1.27-alpine nginx -t`.
   The `api` upstream may fail to resolve in `nginx -t`. If so, run the full test
   via the `full` compose profile in phase 7.
2. Update the `index.html` head and the static shell.
3. Add the Vite plugin. The tag must be absent in dev and in the build when the
   variable is empty, and present with absolute URLs when it is set.
4. Thread `VITE_PUBLIC_ORIGIN` through the Dockerfile, compose and `.env.example`.
5. Write and run `render-og-image.mjs`, check the PNG size and dimensions, and
   commit both.
6. Update `docs/runbook.md`.

## Todo

- [x] Serve `robots.txt` and `sitemap.xml` from nginx with the request host
- [x] Send `X-Robots-Tag` on `/t/`, `/o/`, `/seller` and `/revoked` only
- [x] Add theme-color, description, OG and Twitter tags, and the canonical
- [x] Add a `VITE_PUBLIC_ORIGIN` build variable and inject the absolute URLs
- [x] Generate and commit the OG image and its script
- [x] Add the inline static shell (no script)
- [x] Update the runbook

## Verification

Against the `full` compose web on `:8081` (built with
`VITE_PUBLIC_ORIGIN=http://localhost:8081` for the check):
- `curl -sI localhost:8081/t/DEVTEST001 | grep -i x-robots-tag` gives
  `noindex, nofollow`.
- `curl -sI localhost:8081/ | grep -ci x-robots-tag` gives `0`.
- `curl -sI localhost:8081/robots.txt` shows `Content-Type: text/plain`, and the
  body has an absolute `Sitemap:`.
- `curl -s localhost:8081/ | grep og:image` shows an absolute URL, and fetching it
  returns 200 `image/png`.
- `node scripts/check-discovery-surfaces.mjs http://localhost:8081` (the
  `ak-enhance-ux-ax` skill script) reports no robots, sitemap, description or OG
  errors.
- `pnpm exec vite build && pnpm size` passes. `index.html` is not counted as JS, so
  the shell is outside the budget.

## Risks

- **`add_header` inheritance** drops `Cache-Control` in the new location. Repeat
  it explicitly; the verification covers it.
- **The regex location catches `/assets/`.** Anchor the regex to the exact prefixes
  above.
- **The shell flashes on fast loads.** That is acceptable: it is static, has the
  same background, and React replaces it in the same frame budget.
- **Zalo's preview cache** keeps old cards. It is outside our control; the runbook
  should mention it.
