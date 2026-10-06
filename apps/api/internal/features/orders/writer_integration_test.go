//go:build integration

package orders

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	"sidecup/api/internal/platform/db"
	"sidecup/api/internal/platform/db/testdb"
)

func insertSentOrder(t *testing.T, gdb *gorm.DB, partnerID uuid.UUID, key string) *Order {
	t.Helper()
	phone := "0901234567"
	var out *Order
	require.NoError(t, db.WithTx(context.Background(), gdb, func(tx *gorm.DB) error {
		o, inserted, err := Writer{}.Insert(context.Background(), tx, &Order{
			QRToken: "TESTTOKEN1", PartnerID: partnerID, PartnerName: "Quán test", TableLabel: "Bàn 1",
			Items:         OrderItems{{ProductID: uuid.New(), Name: "Trà đá", UnitPrice: 15000, Qty: 3, LineTotal: 45000}},
			Total:         45000,
			CustomerPhone: &phone, ClientID: uuid.NewString(), IdempotencyKey: key,
			CreatedAt: time.Now(),
		})
		if err != nil {
			return err
		}
		require.True(t, inserted)
		out = o
		return nil
	}))
	return out
}

func moveToPaid(t *testing.T, gdb *gorm.DB, id uuid.UUID) *Order {
	t.Helper()
	ctx := context.Background()
	now := time.Now()
	w := Writer{}
	_, err := w.UpdateWhereStatus(ctx, gdb, id, StatusSent, Set("status", StatusAccepted).Set("accepted_at", now))
	require.NoError(t, err)
	_, err = w.UpdateWhereStatus(ctx, gdb, id, StatusAccepted, Set("status", StatusDelivering).Set("delivering_at", now))
	require.NoError(t, err)
	paid, err := w.UpdateWhereStatus(ctx, gdb, id, StatusDelivering, Set("status", StatusPaid).
		Set("payment_method", PaymentCash).Set("paid_at", now).Set("closed_at", now).
		Set("commission_rate", decimal.RequireFromString("0.15")).Set("commission_amount", int64(6750)))
	require.NoError(t, err)
	return paid
}

func TestWriterInsertIsIdempotent(t *testing.T) {
	gdb := testdb.Open(t)
	pid := testdb.SeedPartner(t, gdb, testdb.PartnerOpts{})
	first := insertSentOrder(t, gdb, pid, "key-1")
	assert.Equal(t, StatusSent, first.Status)
	assert.Len(t, first.Code, 6)
	assert.Equal(t, int64(45000), first.Items[0].LineTotal)

	require.NoError(t, db.WithTx(context.Background(), gdb, func(tx *gorm.DB) error {
		o, inserted, err := Writer{}.Insert(context.Background(), tx, &Order{
			QRToken: "TESTTOKEN1", PartnerID: pid, PartnerName: "x", TableLabel: "y", Items: OrderItems{},
			ClientID: "c", IdempotencyKey: "key-1", CreatedAt: time.Now(),
		})
		assert.False(t, inserted)
		assert.Nil(t, o)
		return err
	}))
	var n int64
	require.NoError(t, gdb.Model(&Order{}).Count(&n).Error)
	assert.Equal(t, int64(1), n)
}

func TestPaidOrderCannotBeChangedThroughWriterOrORM(t *testing.T) {
	gdb := testdb.Open(t)
	ctx := context.Background()
	pid := testdb.SeedPartner(t, gdb, testdb.PartnerOpts{})
	o := insertSentOrder(t, gdb, pid, "key-paid")
	paid := moveToPaid(t, gdb, o.ID)
	require.Equal(t, StatusPaid, paid.Status)
	assert.True(t, paid.UpdatedAt.After(o.UpdatedAt) || paid.UpdatedAt.Equal(o.UpdatedAt))

	w := Writer{}
	// Qua Writer: from=paid bị chặn trước khi chạm DB; from khác không khớp đơn paid.
	_, err := w.UpdateWhereStatus(ctx, gdb, o.ID, StatusPaid, Set("status", StatusFailed))
	assert.ErrorIs(t, err, ErrPaidImmutable)
	for _, from := range []Status{StatusSent, StatusAccepted, StatusDelivering} {
		_, err = w.UpdateWhereStatus(ctx, gdb, o.ID, from, Set("status", StatusFailed))
		assert.ErrorIs(t, err, ErrNotFound, from)
	}

	// Qua GORM: hook chặn mọi đường ghi.
	assert.ErrorIs(t, gdb.Model(&Order{}).Where("id = ?", o.ID).Updates(map[string]any{"total": 1}).Error, ErrUseOrderWriter)
	assert.ErrorIs(t, gdb.Model(&Order{}).Where("id = ?", o.ID).Update("status", "failed").Error, ErrUseOrderWriter)
	assert.ErrorIs(t, gdb.Delete(&Order{ID: o.ID}).Error, ErrUseOrderWriter)
	clone := *paid
	clone.Total = 1
	assert.ErrorIs(t, gdb.Save(&clone).Error, ErrUseOrderWriter)
	assert.ErrorIs(t, gdb.Create(&Order{ID: uuid.New()}).Error, ErrUseOrderWriter)

	var after Order
	require.NoError(t, gdb.First(&after, "id = ?", o.ID).Error)
	assert.Equal(t, StatusPaid, after.Status)
	assert.Equal(t, int64(45000), after.Total)
	assert.Equal(t, int64(6750), *after.CommissionAmount)
	assert.Equal(t, paid.UpdatedAt.UTC(), after.UpdatedAt.UTC())
}

func TestClearCustomerPhoneTouchesOnlyPhone(t *testing.T) {
	gdb := testdb.Open(t)
	ctx := context.Background()
	pid := testdb.SeedPartner(t, gdb, testdb.PartnerOpts{})
	old := insertSentOrder(t, gdb, pid, "key-old")
	paid := moveToPaid(t, gdb, old.ID)
	fresh := insertSentOrder(t, gdb, pid, "key-fresh")

	time.Sleep(10 * time.Millisecond)
	n, err := Writer{}.ClearCustomerPhone(ctx, gdb, time.Now())
	require.NoError(t, err)
	assert.Equal(t, int64(2), n)

	var after Order
	require.NoError(t, gdb.First(&after, "id = ?", old.ID).Error)
	assert.Nil(t, after.CustomerPhone)
	assert.Equal(t, StatusPaid, after.Status)
	assert.Equal(t, paid.Total, after.Total)
	assert.True(t, after.UpdatedAt.After(paid.UpdatedAt))

	// Mốc trong quá khứ: không đơn nào đủ cũ.
	_, err = Writer{}.ClearCustomerPhone(ctx, gdb, fresh.CreatedAt.Add(-time.Hour))
	require.NoError(t, err)
}

func TestConcurrentTransitionOnlyOneWins(t *testing.T) {
	gdb := testdb.Open(t)
	pid := testdb.SeedPartner(t, gdb, testdb.PartnerOpts{})
	o := insertSentOrder(t, gdb, pid, "key-race")
	ctx := context.Background()
	_, err1 := Writer{}.UpdateWhereStatus(ctx, gdb, o.ID, StatusSent, Set("status", StatusAccepted))
	_, err2 := Writer{}.UpdateWhereStatus(ctx, gdb, o.ID, StatusSent, Set("status", StatusRejected))
	assert.NoError(t, err1)
	assert.ErrorIs(t, err2, ErrNotFound)
}
