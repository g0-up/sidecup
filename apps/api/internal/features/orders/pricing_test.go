package orders

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"sidecup/api/internal/platform/apperr"
)

func ptr(s string) *string { return &s }

var (
	tea    = Priced{ID: uuid.New(), Name: "Trà đá", Price: 15000, HasSweet: true, HasIce: true, Available: true}
	water  = Priced{ID: uuid.New(), Name: "Nước suối", Price: 10000, Available: true}
	soldOu = Priced{ID: uuid.New(), Name: "Sinh tố bơ", Price: 35000, HasSweet: true, HasIce: true}
)

func catalog() map[uuid.UUID]Priced {
	return map[uuid.UUID]Priced{tea.ID: tea, water.ID: water, soldOu.ID: soldOu}
}

func TestMergeLinesMergesSameOptionsAndDefaults(t *testing.T) {
	items, total, err := MergeLines([]LineReq{
		{ProductID: tea.ID, Qty: 1},
		{ProductID: tea.ID, Qty: 2, Sweet: ptr("medium"), Ice: ptr("normal")}, // trùng mặc định → gộp
		{ProductID: tea.ID, Qty: 1, Sweet: ptr("less")},
		{ProductID: water.ID, Qty: 2},
	}, catalog())
	require.NoError(t, err)
	require.Len(t, items, 3)
	assert.Equal(t, 3, items[0].Qty)
	assert.Equal(t, "medium", *items[0].Sweet)
	assert.Equal(t, "normal", *items[0].Ice)
	assert.Equal(t, int64(45000), items[0].LineTotal)
	assert.Equal(t, "less", *items[1].Sweet)
	assert.Nil(t, items[2].Sweet, "món không có tuỳ chọn thì không gán mặc định")
	assert.Equal(t, int64(45000+15000+20000), total)
	assert.Equal(t, "3 Trà đá, 1 Trà đá (ít ngọt), 2 Nước suối", items.Summary())
}

func TestMergeLinesQtyLimitAppliesAfterMerge(t *testing.T) {
	_, _, err := MergeLines([]LineReq{{ProductID: tea.ID, Qty: 15}, {ProductID: tea.ID, Qty: 6}}, catalog())
	e, ok := apperr.As(err)
	require.True(t, ok)
	assert.Equal(t, "VALIDATION", e.Code)
	assert.Contains(t, e.Details["fields"], "items[1].qty")

	_, _, err = MergeLines([]LineReq{{ProductID: tea.ID, Qty: 20}}, catalog())
	assert.NoError(t, err)
}

func TestMergeLinesRejectsOptionsOnUnsupportedProduct(t *testing.T) {
	_, _, err := MergeLines([]LineReq{{ProductID: water.ID, Qty: 1, Ice: ptr("none")}}, catalog())
	e, ok := apperr.As(err)
	require.True(t, ok)
	assert.Equal(t, map[string]string{"items[0].ice": "Món này không có tuỳ chọn đá"}, e.Details["fields"])
}

func TestMergeLinesCollectsAllUnavailable(t *testing.T) {
	hidden := uuid.New()
	_, _, err := MergeLines([]LineReq{
		{ProductID: soldOu.ID, Qty: 1}, {ProductID: tea.ID, Qty: 1}, {ProductID: hidden, Qty: 1}, {ProductID: soldOu.ID, Qty: 2},
	}, catalog())
	e, ok := apperr.As(err)
	require.True(t, ok)
	assert.Equal(t, 409, e.Status)
	assert.Equal(t, "PRODUCT_UNAVAILABLE", e.Code)
	assert.Equal(t, []string{soldOu.ID.String(), hidden.String()}, e.Details["product_ids"])
}
