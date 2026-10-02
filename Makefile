COMPOSE      = docker compose -f infra/docker-compose.yml
COMPOSE_PROD = docker compose -f infra/docker-compose.prod.yml --env-file infra/.env
COMPOSE_HOMELAB = docker compose -f infra/docker-compose.prod.yml -f infra/docker-compose.homelab.yml --env-file infra/.env

.PHONY: help dev dev-api dev-web db-up down check-ports migrate-up migrate-down seed test test-api test-web lint build size e2e prod-up prod-down homelab-config homelab-up homelab-down

help:
	@echo "make dev          Postgres (docker) + API (go run) + web (vite); Ctrl-C dừng API/web"
	@echo "make dev-api      chạy lại riêng API (không hot reload: đổi code Go thì chạy lại lệnh này)"
	@echo "make down         dừng Postgres dev"
	@echo "make migrate-up | migrate-down | seed"
	@echo "make test | lint | build | size | e2e"
	@echo "make prod-up | prod-down   (infra/docker-compose.prod.yml + infra/.env)"
	@echo "make homelab-config | homelab-up | homelab-down   (prod + infra/docker-compose.homelab.yml, sau Traefik)"

# Không tự đổi cổng khi bị chiếm: báo rõ tiến trình đang giữ cổng để dừng đúng nó.
check-ports:
	@for p in 8080 5173; do \
		if lsof -nP -iTCP:$$p -sTCP:LISTEN >/dev/null 2>&1; then \
			echo "Cổng $$p đang bị chiếm:"; lsof -nP -iTCP:$$p -sTCP:LISTEN; exit 1; \
		fi; \
	done
	@if lsof -nP -iTCP:5432 -sTCP:LISTEN >/dev/null 2>&1 && ! $(COMPOSE) ps --status running postgres 2>/dev/null | grep -q postgres; then \
		echo "Cổng 5432 đang bị Postgres khác chiếm:"; lsof -nP -iTCP:5432 -sTCP:LISTEN; exit 1; \
	fi

db-up:
	$(COMPOSE) up -d --wait postgres

dev: check-ports db-up migrate-up
	@trap 'kill 0' INT TERM EXIT; \
	 ( cd apps/api && $(MAKE) --no-print-directory run ) & \
	 ( cd apps/web && pnpm dev ) & \
	 wait

dev-api:
	cd apps/api && $(MAKE) --no-print-directory run

dev-web:
	cd apps/web && pnpm dev

down:
	$(COMPOSE) down

migrate-up:
	cd apps/api && $(MAKE) --no-print-directory migrate-up

migrate-down:
	cd apps/api && $(MAKE) --no-print-directory migrate-down

seed:
	cd apps/api && $(MAKE) --no-print-directory seed

test: test-api test-web

test-api:
	cd apps/api && $(MAKE) --no-print-directory test

test-web:
	cd apps/web && pnpm test

lint:
	cd apps/api && $(MAKE) --no-print-directory lint
	cd apps/web && pnpm lint && pnpm typecheck

build:
	docker build -t sidecup-api apps/api
	docker build -t sidecup-web apps/web

size:
	cd apps/web && pnpm exec vite build && pnpm size

# E2E trên stack container (postgres + api + web build) với seed; cần Docker và Node.
e2e:
	$(COMPOSE) --profile full up -d --build --wait
	$(COMPOSE) --profile full exec -T api /api seed
	cd apps/web && E2E_BASE_URL=http://localhost:8081 E2E_DATABASE_URL=postgres://sidecup:sidecup@localhost:5432/sidecup?sslmode=disable pnpm e2e; \
		status=$$?; cd ../.. && $(COMPOSE) --profile full down; exit $$status

prod-up:
	$(COMPOSE_PROD) up -d --build

prod-down:
	$(COMPOSE_PROD) down

homelab-config:
	$(COMPOSE_HOMELAB) config --quiet

homelab-up:
	$(COMPOSE_HOMELAB) up -d --build

homelab-down:
	$(COMPOSE_HOMELAB) down
