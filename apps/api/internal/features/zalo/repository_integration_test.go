//go:build integration

package zalo

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"sidecup/api/internal/platform/db/testdb"
)

func TestRepositoryUpsertReplacesTheSingleAccount(t *testing.T) {
	gdb := testdb.Open(t)
	repo := NewRepository(gdb)
	ctx := context.Background()

	_, err := repo.Get(ctx)
	require.ErrorIs(t, err, errAccountNotFound)

	first := "Máy cũ"
	require.NoError(t, repo.Upsert(ctx, &Account{EncryptedCredentials: []byte{1, 2, 3}, DisplayName: &first, ConsentVersion: testConsentVersion}))
	acc, err := repo.Get(ctx)
	require.NoError(t, err)
	assert.Equal(t, accountID, acc.ID)
	assert.Equal(t, StatusLinked, acc.Status)
	assert.False(t, acc.ConsentAt.IsZero())
	assert.False(t, acc.LinkedAt.IsZero())

	second := "Máy mới"
	require.NoError(t, repo.Upsert(ctx, &Account{EncryptedCredentials: []byte{9}, DisplayName: &second, ConsentVersion: testConsentVersion}))
	acc, err = repo.Get(ctx)
	require.NoError(t, err)
	assert.Equal(t, []byte{9}, acc.EncryptedCredentials)
	assert.Equal(t, "Máy mới", *acc.DisplayName)

	var n int64
	require.NoError(t, gdb.Model(&Account{}).Count(&n).Error)
	assert.EqualValues(t, 1, n)
}

func TestRepositoryUpsertRequiresConsent(t *testing.T) {
	repo := NewRepository(testdb.Open(t))
	assert.ErrorIs(t, repo.Upsert(context.Background(), &Account{EncryptedCredentials: []byte{1}}), ErrConsentRequired)
}

func TestRepositoryStatusAndVerification(t *testing.T) {
	repo := NewRepository(testdb.Open(t))
	ctx := context.Background()

	require.ErrorIs(t, repo.UpdateStatus(ctx, StatusExpired), errAccountNotFound)
	require.ErrorIs(t, repo.MarkVerified(ctx), errAccountNotFound)

	require.NoError(t, repo.Upsert(ctx, &Account{EncryptedCredentials: []byte{1}, ConsentVersion: testConsentVersion}))
	require.NoError(t, repo.UpdateStatus(ctx, StatusExpired))
	require.NoError(t, repo.MarkVerified(ctx))
	acc, err := repo.Get(ctx)
	require.NoError(t, err)
	assert.Equal(t, StatusExpired, acc.Status)
	require.NotNil(t, acc.LastVerifiedAt)
}

func TestRepositoryRejectsAnUnknownStatus(t *testing.T) {
	repo := NewRepository(testdb.Open(t))
	ctx := context.Background()
	require.NoError(t, repo.Upsert(ctx, &Account{EncryptedCredentials: []byte{1}, ConsentVersion: testConsentVersion}))
	assert.Error(t, repo.UpdateStatus(ctx, "paused"))
}

func TestRepositoryDeleteIsHardAndReportsMissingRow(t *testing.T) {
	repo := NewRepository(testdb.Open(t))
	ctx := context.Background()
	require.NoError(t, repo.Upsert(ctx, &Account{EncryptedCredentials: []byte{1}, ConsentVersion: testConsentVersion}))
	require.NoError(t, repo.Delete(ctx))
	_, err := repo.Get(ctx)
	require.ErrorIs(t, err, errAccountNotFound)
	assert.ErrorIs(t, repo.Delete(ctx), errAccountNotFound)
}
