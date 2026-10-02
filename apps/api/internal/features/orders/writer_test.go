package orders

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestUpdateWhereStatusRejectsPaidWithoutTouchingDB(t *testing.T) {
	// tx = nil: nếu Writer chạm DB thì test panic, nên pass nghĩa là không có query nào được gửi.
	o, err := Writer{}.UpdateWhereStatus(context.Background(), nil, uuid.New(), StatusPaid, Set("status", StatusFailed))
	assert.Nil(t, o)
	assert.ErrorIs(t, err, ErrPaidImmutable)
}

func TestSetClauseRejectsColumnsOutsideAllowlist(t *testing.T) {
	for _, col := range []string{"total", "items", "partner_id", "client_id", "customer_phone", "updated_at", "id; DROP TABLE orders"} {
		_, _, err := Set(col, 1).build(uuid.New(), StatusSent)
		assert.Error(t, err, col)
	}
	_, _, err := SetClause{}.build(uuid.New(), StatusSent)
	assert.Error(t, err, "SetClause rỗng")

	_, _, err = Set("status", "accepted").Set("status", "rejected").build(uuid.New(), StatusSent)
	assert.Error(t, err, "set một cột hai lần")
}

func TestSetClauseBuildsConditionalUpdate(t *testing.T) {
	id := uuid.New()
	now := time.Date(2026, 10, 1, 8, 0, 0, 0, time.UTC)
	sql, args, err := Set("status", StatusAccepted).Set("accepted_at", now).build(id, StatusSent)
	require.NoError(t, err)
	assert.Equal(t, "UPDATE orders SET status = ?, accepted_at = ?, updated_at = now() WHERE id = ? AND status = ? RETURNING *", sql)
	assert.Equal(t, []any{StatusAccepted, now, id, "sent"}, args)
}

func TestSetClauseIsImmutable(t *testing.T) {
	base := Set("status", StatusAccepted)
	a := base.Set("accepted_at", time.Now())
	b := base.Set("closed_at", time.Now())
	assert.Len(t, base.entries, 1)
	assert.Equal(t, "accepted_at", a.entries[1].col)
	assert.Equal(t, "closed_at", b.entries[1].col)
}
