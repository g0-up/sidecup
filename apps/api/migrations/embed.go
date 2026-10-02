// Package migrations nhúng file SQL để binary tự chạy migrate, không cần mang thư mục theo.
package migrations

import "embed"

//go:embed *.sql
var FS embed.FS
