package zalo

import (
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestUIDCacheExpiresFoundAndNotFoundEntriesSeparately(t *testing.T) {
	now := time.Date(2026, 10, 2, 8, 0, 0, 0, time.UTC)
	c := newUIDCache(func() time.Time { return now })
	c.put("84900000001", "uid-1", c.generation())
	c.put("84900000002", "", c.generation())

	now = now.Add(59 * time.Minute)
	_, ok := c.get("84900000002")
	require.True(t, ok)

	now = now.Add(time.Minute)
	_, ok = c.get("84900000002")
	require.False(t, ok, "kết quả không tìm thấy chỉ nhớ 1 giờ")
	uid, ok := c.get("84900000001")
	require.True(t, ok)
	require.Equal(t, "uid-1", uid)

	now = now.Add(23 * time.Hour)
	_, ok = c.get("84900000001")
	require.False(t, ok, "uid tìm thấy nhớ 24 giờ")
}

func TestUIDCacheEvictsTheOldestEntryWhenFull(t *testing.T) {
	now := time.Date(2026, 10, 2, 8, 0, 0, 0, time.UTC)
	c := newUIDCache(func() time.Time { return now })
	for i := range uidCacheMaxEntries {
		c.put(fmt.Sprintf("p%d", i), "uid", c.generation())
		now = now.Add(time.Second)
	}
	c.put("new", "uid", c.generation())

	require.Len(t, c.entries, uidCacheMaxEntries)
	_, ok := c.get("p0")
	require.False(t, ok, "mục cũ nhất bị bỏ")
	_, ok = c.get("new")
	require.True(t, ok)
}

func TestUIDCacheDropsALookupThatStartedBeforeAReset(t *testing.T) {
	c := newUIDCache(time.Now)
	gen := c.generation()
	c.reset()
	c.put("84900000001", "uid-cũ", gen)
	_, ok := c.get("84900000001")
	require.False(t, ok)
}
