# Phase 3: Config, infra and docs

Status: completed

## Context

- Env examples: `apps/api/.env.example`, `infra/.env.example`.
- Production compose passes env to `api` explicitly: `infra/docker-compose.prod.yml` (the homelab overlay inherits it).
- `apps/web/nginx.conf` proxies `/api/` in the "full" compose; nginx's default `client_max_body_size` is 1 MB. Caddy and Traefik have no default body limit; Cloudflare allows 100 MB.
- Docs: `docs/api.md` seller table, `docs/runbook.md` (pattern: the "Zalo gửi tin cho khách" section).

## Requirements

1. Add the six `R2_*` vars to both env examples with Vietnamese comments: leaving them empty turns off image upload; `R2_FOLDER` example `sidecup/products`; `R2_PUBLIC_BASE_URL` is the bucket's custom domain (https).
2. `infra/docker-compose.prod.yml` `api.environment`: pass each `R2_*` with `${R2_X:-}` defaults.
3. `apps/web/nginx.conf` `location /api/`: `client_max_body_size 6m;`.
4. `docs/api.md`: add the `POST /api/seller/products/images` row (multipart `file`, ≤ 5 MB, JPG/PNG/WebP → `201 {url}`; 413/422/502/503 codes) and note that `image_url` is normally the returned URL.
5. `docs/runbook.md`: new section "Kho ảnh món (Cloudflare R2)":
   - Create the bucket; connect a custom domain for public reads (r2.dev only for testing).
   - Create an R2 API token with Object Read & Write scoped to that bucket; set the env vars; restart `api`.
   - Verify: upload a photo in "Thêm món", open the image URL, check it on the customer menu.
   - Changing `R2_FOLDER` affects new uploads only; old URLs keep working. Old images are not deleted when replaced.

## Files

- Modify: `apps/api/.env.example`, `infra/.env.example`, `infra/docker-compose.prod.yml`, `apps/web/nginx.conf`, `docs/api.md`, `docs/runbook.md`.

## Validation

```bash
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.example config >/dev/null
make homelab-config >/dev/null   # overlay still renders
```

Re-read the docs against the final handler: route, limits, error codes and env names must match the code.

## Risk

- Real credentials must go only in the untracked `infra/.env` / `apps/api/.env`; never in examples or commits.
