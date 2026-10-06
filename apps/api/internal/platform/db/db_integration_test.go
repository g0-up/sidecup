//go:build integration

package db_test

import (
	"sort"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm/schema"

	"sidecup/api/internal/features/menu"
	"sidecup/api/internal/features/notifications"
	"sidecup/api/internal/features/orders"
	"sidecup/api/internal/features/partners"
	"sidecup/api/internal/features/products"
	"sidecup/api/internal/features/qrcodes"
	"sidecup/api/internal/features/reports"
	"sidecup/api/internal/features/settings"
	"sidecup/api/internal/features/zalo"
	"sidecup/api/internal/platform/db"
	"sidecup/api/internal/platform/db/testdb"
)

func TestMigrateRoundTrip(t *testing.T) {
	testdb.Open(t)
	url := testdb.URL()
	require.NoError(t, db.Migrate(url, db.Down))
	v, dirty, err := db.Version(url)
	require.NoError(t, err)
	assert.Equal(t, uint(0), v)
	assert.False(t, dirty)
	require.NoError(t, db.Migrate(url, db.Up))
	v, _, err = db.Version(url)
	require.NoError(t, err)
	assert.Equal(t, uint(4), v)
}

func TestSchemaHasNoTriggersOrFunctions(t *testing.T) {
	gdb := testdb.Open(t)
	var triggers, functions int64
	require.NoError(t, gdb.Raw(`SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal`).Scan(&triggers).Error)
	require.NoError(t, gdb.Raw(`SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
		WHERE n.nspname = 'public'`).Scan(&functions).Error)
	assert.Zero(t, triggers)
	assert.Zero(t, functions)
}

// TestModelsMatchSchema bắt lệch giữa struct GORM và migration (không dùng AutoMigrate).
func TestModelsMatchSchema(t *testing.T) {
	gdb := testdb.Open(t)
	models := []any{
		&partners.Partner{}, &partners.HiddenProduct{}, &products.Product{}, &qrcodes.QRCode{},
		&orders.Order{}, &orders.Event{}, &reports.Adjustment{}, &menu.PageView{},
		&settings.Settings{}, &notifications.Outbox{}, &notifications.Heartbeat{}, &zalo.Account{},
	}
	cache := &sync.Map{}
	for _, m := range models {
		s, err := schema.Parse(m, cache, gdb.NamingStrategy)
		require.NoError(t, err)
		t.Run(s.Table, func(t *testing.T) {
			cols, err := gdb.Migrator().ColumnTypes(m)
			require.NoError(t, err)
			var dbCols []string
			for _, c := range cols {
				dbCols = append(dbCols, c.Name())
			}
			var modelCols []string
			for _, f := range s.Fields {
				if f.DBName != "" {
					modelCols = append(modelCols, f.DBName)
				}
			}
			sort.Strings(dbCols)
			sort.Strings(modelCols)
			assert.Equal(t, dbCols, modelCols)

			if f := s.LookUpField("updated_at"); f != nil {
				assert.NotZero(t, f.AutoUpdateTime, "updated_at phải có autoUpdateTime")
			}
		})
	}
}

func TestGORMUpdatesBumpUpdatedAt(t *testing.T) {
	gdb := testdb.Open(t)
	id := testdb.SeedPartner(t, gdb, testdb.PartnerOpts{})
	var before partners.Partner
	require.NoError(t, gdb.First(&before, "id = ?", id).Error)
	time.Sleep(10 * time.Millisecond)
	require.NoError(t, gdb.Model(&partners.Partner{}).Where("id = ?", id).Updates(map[string]any{"name": "Quán mới"}).Error)
	var after partners.Partner
	require.NoError(t, gdb.First(&after, "id = ?", id).Error)
	assert.True(t, after.UpdatedAt.After(before.UpdatedAt))
	assert.True(t, after.CommissionRate.Equal(before.CommissionRate))
}
