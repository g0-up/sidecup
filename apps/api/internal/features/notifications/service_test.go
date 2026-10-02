package notifications

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestBackoffDoublesFrom30Seconds(t *testing.T) {
	assert.Equal(t, 30*time.Second, Backoff(1))
	assert.Equal(t, 60*time.Second, Backoff(2))
	assert.Equal(t, 120*time.Second, Backoff(3))
	assert.Equal(t, 30*time.Second, Backoff(0))
}

func TestStatusAlert(t *testing.T) {
	assert.False(t, Status{Healthy: true}.Alert())
	assert.True(t, Status{Healthy: false}.Alert())
	assert.True(t, Status{Healthy: true, FailedLastHour: 1}.Alert())
}

func TestTruncateCountsRunes(t *testing.T) {
	assert.Equal(t, "Không", truncate("Không gửi được", 5))
	assert.Equal(t, "ok", truncate("ok", 5))
}
