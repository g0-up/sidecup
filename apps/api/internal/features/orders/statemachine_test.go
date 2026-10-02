package orders

import (
	"fmt"
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
)

var allStatuses = []Status{StatusSent, StatusAccepted, StatusDelivering, StatusPaid, StatusRejected, StatusCancelled, StatusFailed}
var allActors = []Actor{ActorCustomer, ActorSeller, ActorSystem}

func TestCanTransitionFullTable(t *testing.T) {
	allowed := map[string]bool{
		"sent>accepted>seller":       true,
		"sent>rejected>seller":       true,
		"sent>cancelled>customer":    true,
		"sent>cancelled>system":      true,
		"accepted>delivering>seller": true,
		"delivering>paid>seller":     true,
		"delivering>failed>seller":   true,
	}
	for _, from := range allStatuses {
		for _, to := range allStatuses {
			for _, a := range allActors {
				key := fmt.Sprintf("%s>%s>%s", from, to, a)
				assert.Equal(t, allowed[key], CanTransition(from, to, a), key)
			}
		}
	}
}

func TestPaidHasNoOutgoingTransition(t *testing.T) {
	for _, to := range allStatuses {
		for _, a := range allActors {
			assert.False(t, CanTransition(StatusPaid, to, a))
		}
	}
}

func TestApplyTransitionColumns(t *testing.T) {
	now := time.Date(2026, 10, 1, 8, 0, 0, 0, time.UTC)
	cols := func(s SetClause) []string {
		var out []string
		for _, e := range s.entries {
			out = append(out, e.col)
		}
		return out
	}
	assert.Equal(t, []string{"status", "accepted_at"}, cols(applyTransition(StatusAccepted, now, TransitionOpts{})))
	assert.Equal(t, []string{"status", "delivering_at"}, cols(applyTransition(StatusDelivering, now, TransitionOpts{})))
	assert.Equal(t, []string{"status", "closed_at", "cancel_reason"}, cols(applyTransition(StatusRejected, now, TransitionOpts{})))
	paid := applyTransition(StatusPaid, now, TransitionOpts{PaymentMethod: PaymentCash, CommissionRate: decimal.RequireFromString("0.15"), Total: 45000})
	assert.Equal(t, []string{"status", "paid_at", "closed_at", "payment_method", "commission_rate", "commission_amount"}, cols(paid))
	assert.Equal(t, int64(6750), paid.entries[5].val)
	// Mọi SetClause sinh ra đều build được (nằm trong allowlist của Writer).
	for _, to := range allStatuses {
		_, _, err := applyTransition(to, now, TransitionOpts{}).build("id", StatusSent)
		assert.NoError(t, err, to)
	}
}

func TestCommissionRounding(t *testing.T) {
	r := decimal.RequireFromString("0.15")
	assert.Equal(t, int64(6750), Commission(45000, r))
	assert.Equal(t, int64(2), Commission(15, r), "2.25 → 2")
	assert.Equal(t, int64(3), Commission(17, decimal.RequireFromString("0.1500")), "2.55 → 3")
	assert.Equal(t, int64(1), Commission(10, decimal.RequireFromString("0.05")), "0.5 → 1 (nửa lên)")
	assert.Equal(t, int64(0), Commission(45000, decimal.Zero))
}

func TestNotifiesCustomer(t *testing.T) {
	assert.True(t, notifiesCustomer(StatusAccepted, ""))
	assert.True(t, notifiesCustomer(StatusCancelled, ReasonTimeout))
	assert.False(t, notifiesCustomer(StatusCancelled, ReasonCustomer))
	assert.False(t, notifiesCustomer(StatusFailed, ReasonCustomerMissing))
}
