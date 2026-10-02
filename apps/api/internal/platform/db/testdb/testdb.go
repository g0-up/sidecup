// Package testdb cấp database thật cho integration test (build tag `integration`).
// Mỗi test binary (mỗi package) có database riêng tạo từ TEST_DATABASE_URL, nên `go test ./...`
// chạy song song giữa các package mà không giẫm dữ liệu của nhau.
package testdb

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"testing"

	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	"sidecup/api/internal/platform/db"
)

var (
	once    sync.Once
	shared  *gorm.DB
	dsn     string
	initErr error
)

// Open trả DB đã migrate và đã xoá sạch dữ liệu; skip test nếu chưa đặt TEST_DATABASE_URL.
func Open(t testing.TB) *gorm.DB {
	t.Helper()
	base := os.Getenv("TEST_DATABASE_URL")
	if base == "" {
		t.Skip("TEST_DATABASE_URL chưa đặt; bỏ qua integration test")
	}
	once.Do(func() { shared, dsn, initErr = setup(base) })
	require.NoError(t, initErr)
	Reset(t, shared)
	return shared
}

// URL trả DSN của database riêng của package (dùng khi test cần mở kết nối riêng).
func URL() string { return dsn }

var appTables = []string{
	"notification_outbox", "order_events", "adjustments", "orders", "page_views",
	"qr_codes", "partner_hidden_products", "products", "partners", "settings", "notifier_heartbeat",
}

func Reset(t testing.TB, gdb *gorm.DB) {
	t.Helper()
	require.NoError(t, gdb.Exec("TRUNCATE "+strings.Join(appTables, ", ")+" RESTART IDENTITY CASCADE").Error)
	require.NoError(t, gdb.Exec("INSERT INTO settings (id) VALUES (1)").Error)
	require.NoError(t, gdb.Exec("INSERT INTO notifier_heartbeat (id) VALUES (1)").Error)
}

var nonIdent = regexp.MustCompile(`[^a-z0-9_]+`)

func setup(base string) (*gorm.DB, string, error) {
	u, err := url.Parse(base)
	if err != nil {
		return nil, "", fmt.Errorf("TEST_DATABASE_URL: %w", err)
	}
	pkg := strings.TrimSuffix(filepath.Base(os.Args[0]), ".test")
	name := strings.TrimPrefix(u.Path, "/") + "_" + nonIdent.ReplaceAllString(strings.ToLower(pkg), "_")

	admin, err := db.Open(base, "warn")
	if err != nil {
		return nil, "", err
	}
	defer func() { _ = db.Close(admin) }()
	ctx := context.Background()
	if err := admin.WithContext(ctx).Exec(fmt.Sprintf(`DROP DATABASE IF EXISTS %q WITH (FORCE)`, name)).Error; err != nil {
		return nil, "", fmt.Errorf("drop test db: %w", err)
	}
	if err := admin.WithContext(ctx).Exec(fmt.Sprintf(`CREATE DATABASE %q`, name)).Error; err != nil {
		return nil, "", fmt.Errorf("create test db: %w", err)
	}

	u.Path = "/" + name
	pkgURL := u.String()
	if err := db.Migrate(pkgURL, db.Up); err != nil {
		return nil, "", fmt.Errorf("migrate test db: %w", err)
	}
	gdb, err := db.Open(pkgURL, "warn")
	return gdb, pkgURL, err
}
