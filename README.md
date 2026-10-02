# Gọi nước tại bàn qua mã QR

Monorepo `apps/api` (Go) + `apps/web` (React) + `infra/` (Docker, Caddy hoặc Traefik ở homelab).

- Chạy dev, cấu trúc, lệnh: [docs/README.md](docs/README.md)
- API: [docs/api.md](docs/api.md)
- Vận hành: [docs/runbook.md](docs/runbook.md)
- Nghiệm thu P0: [docs/acceptance-p0.md](docs/acceptance-p0.md)

```sh
make dev     # Postgres + API :8080 + web :5173
make test
```
