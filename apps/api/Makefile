# Nạp apps/api/.env (nếu có) cho các lệnh cần DATABASE_URL, SESSION_SECRET...
WITH_ENV = set -a; [ -f .env ] && . ./.env; set +a;

.PHONY: run migrate-up migrate-down migrate-version seed test test-unit test-integration lint fmt bin

run:
	@$(WITH_ENV) go run ./cmd/api serve

migrate-up:
	@$(WITH_ENV) go run ./cmd/api migrate up

migrate-down:
	@$(WITH_ENV) go run ./cmd/api migrate down

migrate-version:
	@$(WITH_ENV) go run ./cmd/api migrate version

seed:
	@$(WITH_ENV) go run ./cmd/api seed

# Unit test luôn chạy; integration test chạy khi có TEST_DATABASE_URL (trong .env hoặc môi trường).
test:
	@$(WITH_ENV) if [ -n "$$TEST_DATABASE_URL" ]; then \
		go test -race -count=1 -tags integration ./...; \
	else \
		echo "TEST_DATABASE_URL chưa đặt: chỉ chạy unit test"; go test -race -count=1 ./...; \
	fi

test-unit:
	go test -race -count=1 ./...

test-integration:
	@$(WITH_ENV) test -n "$$TEST_DATABASE_URL" || { echo "Cần TEST_DATABASE_URL"; exit 1; }; \
	go test -race -count=1 -tags integration ./...

lint:
	go vet ./...
	go vet -tags integration ./...
	golangci-lint run ./...

fmt:
	gofmt -w .

bin:
	CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o bin/api ./cmd/api
