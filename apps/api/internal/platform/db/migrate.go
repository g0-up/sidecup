package db

import (
	"database/sql"
	"errors"
	"fmt"

	"github.com/golang-migrate/migrate/v4"
	pgxmigrate "github.com/golang-migrate/migrate/v4/database/pgx/v5"
	"github.com/golang-migrate/migrate/v4/source/iofs"
	_ "github.com/jackc/pgx/v5/stdlib" // driver "pgx" cho database/sql

	"sidecup/api/migrations"
)

type Direction string

const (
	Up   Direction = "up"
	Down Direction = "down"
)

// Migrate dùng một *sql.DB riêng vì driver của golang-migrate đóng DB khi Close.
// golang-migrate giữ advisory lock nên hai tiến trình cùng migrate không giẫm nhau.
func Migrate(databaseURL string, dir Direction) error {
	m, closeFn, err := newMigrator(databaseURL)
	if err != nil {
		return err
	}
	defer closeFn()

	switch dir {
	case Up:
		err = m.Up()
	case Down:
		err = m.Down()
	default:
		return fmt.Errorf("migrate: hướng không hợp lệ %q", dir)
	}
	if errors.Is(err, migrate.ErrNoChange) {
		return nil
	}
	return err
}

func Version(databaseURL string) (version uint, dirty bool, err error) {
	m, closeFn, err := newMigrator(databaseURL)
	if err != nil {
		return 0, false, err
	}
	defer closeFn()
	version, dirty, err = m.Version()
	if errors.Is(err, migrate.ErrNilVersion) {
		return 0, false, nil
	}
	return version, dirty, err
}

func newMigrator(databaseURL string) (*migrate.Migrate, func(), error) {
	src, err := iofs.New(migrations.FS, ".")
	if err != nil {
		return nil, nil, fmt.Errorf("migrate source: %w", err)
	}
	sqlDB, err := sql.Open("pgx", databaseURL)
	if err != nil {
		return nil, nil, fmt.Errorf("migrate open: %w", err)
	}
	driver, err := pgxmigrate.WithInstance(sqlDB, &pgxmigrate.Config{})
	if err != nil {
		_ = sqlDB.Close()
		return nil, nil, fmt.Errorf("migrate driver: %w", err)
	}
	m, err := migrate.NewWithInstance("iofs", src, "pgx5", driver)
	if err != nil {
		_ = sqlDB.Close()
		return nil, nil, fmt.Errorf("migrate init: %w", err)
	}
	return m, func() { _, _ = m.Close() }, nil
}
