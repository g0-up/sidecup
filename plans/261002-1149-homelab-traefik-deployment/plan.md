# Homelab Traefik deployment

Status: completed · Branch: master

## Contract

- **Outcome:** sidecup can be deployed on the homelab behind the existing Traefik and Cloudflare Tunnel, following the teka `docker-compose.homelab.yml` pattern: production file first, homelab overlay second.
- **Constraints:** Web at `sidecup.cauchuyenlaptrinh.com`, API at `sidecup-api.cauchuyenlaptrinh.com` (user decision, revised from a single hostname). The web bundle gets the API origin at build time (`VITE_API_ORIGIN`; empty keeps same-origin for dev, VPS, E2E); API CORS allows only the web origin with credentials; `PUBLIC_BASE_URL` stays the web origin. `/internal*` stays unreachable; the web host must not proxy `/api`, `/ws` through nginx (shared-network name clash); Caddy's security headers are kept; no host ports for any service, database included; the VPS (Caddy) workflow is unchanged.
- **Non-goals:** Provision DNS, Cloudflare Tunnel routes, Traefik or the `homelab` network; change Traefik static config in `homelab-infras`; change API code; push images to a registry.
- **Acceptance:**
  1. `prod + homelab` renders with only `postgres`, `api`, `web`; Caddy is not started; no service publishes ports.
  2. `api` joins `default` + `homelab`; `postgres` joins only `default`; Traefik labels use entrypoint `web`, network `homelab`, ports 8080 (api) / 80 (web), API healthcheck `/readyz`.
  3. API host serves `/api/*`, `/ws/*` and returns 404 for `/internal*`; web host returns 404 for `/api/*`, `/ws/*`, `/internal/*`; cross-host login, session call and WebSocket work, foreign WebSocket origins get 403, foreign CORS origins get no allow headers.
  4. Security headers equal the Caddyfile headers, with CSP `connect-src` opened for the API host.
  5. `make homelab-config | homelab-up | homelab-down` exist; runbook documents prerequisites, deploy, verify, update, rollback.
  6. Base prod and dev compose render unchanged; production images still build.

## Touchpoints

- `infra/docker-compose.homelab.yml` — new overlay.
- `apps/web/src/shared/api/http.ts`, `apps/web/src/shared/realtime/messages.ts`, `apps/web/Dockerfile` — optional build-time API origin, with tests.
- `Makefile` — homelab targets.
- `infra/.env.example`, `docs/runbook.md`, `docs/README.md`, `README.md` — operator docs.
