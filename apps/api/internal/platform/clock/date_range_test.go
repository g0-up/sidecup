package clock

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseDateRange(t *testing.T) {
	loc, err := time.LoadLocation("Asia/Ho_Chi_Minh")
	require.NoError(t, err)
	day := func(y int, m time.Month, d int) time.Time { return time.Date(y, m, d, 0, 0, 0, 0, loc) }

	r, err := ParseDateRange("2026-09-28", "2026-10-04", loc)
	require.NoError(t, err)
	from, to := r.Bounds()
	assert.Equal(t, day(2026, 9, 28), from)
	assert.Equal(t, day(2026, 10, 5), to)
	assert.Equal(t, 7, r.Days())

	_, err = ParseDateRange("2026-10-04", "2026-09-28", loc)
	assert.Error(t, err)
	_, err = ParseDateRange("28/09/2026", "2026-10-04", loc)
	assert.Error(t, err)
	_, err = ParseDateRange("2025-01-01", "2026-10-04", loc)
	assert.Error(t, err)
}
