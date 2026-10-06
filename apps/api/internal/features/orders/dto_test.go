package orders

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestToPublicEscapesMenuPathAndHidesPrivateFields(t *testing.T) {
	phone := "0901234567"
	o := Order{QRToken: "ab/c d?", CustomerPhone: &phone, ClientID: "client-123"}

	v := ToPublic(o, 7, true)
	assert.Equal(t, "/t/ab%2Fc%20d%3F", v.MenuPath)
	assert.Equal(t, 7, v.EtaMinutes)
	assert.True(t, v.NotifyZalo)

	body, err := json.Marshal(v)
	require.NoError(t, err)
	var fields map[string]any
	require.NoError(t, json.Unmarshal(body, &fields))
	for _, key := range []string{"customer_phone", "client_id", "qr_token"} {
		assert.NotContains(t, fields, key)
	}
	assert.NotContains(t, string(body), phone)
	assert.Equal(t, "/t/ab%2Fc%20d%3F", fields["menu_path"])
}

func TestSellerViewHasNoCustomerOnlyFields(t *testing.T) {
	body, err := json.Marshal(ToSeller(Order{QRToken: "TOK1"}))
	require.NoError(t, err)
	var fields map[string]any
	require.NoError(t, json.Unmarshal(body, &fields))
	assert.Equal(t, "/t/TOK1", fields["menu_path"])
	assert.NotContains(t, fields, "eta_minutes")
	assert.NotContains(t, fields, "notify_zalo")
}

func TestNotifiesZaloNeedsPhoneAndLiveLink(t *testing.T) {
	phone := "0901234567"
	empty := ""
	linked := func(context.Context) bool { return true }
	unlinked := func(context.Context) bool { return false }

	cases := []struct {
		name  string
		phone *string
		zalo  ZaloLinked
		want  bool
	}{
		{"phone and linked", &phone, linked, true},
		{"phone but link expired or missing", &phone, unlinked, false},
		{"phone but Zalo disabled", &phone, nil, false},
		{"no phone", nil, linked, false},
		{"phone purged to empty", &empty, linked, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s := &Service{zalo: tc.zalo}
			assert.Equal(t, tc.want, s.publicView(context.Background(), &Order{CustomerPhone: tc.phone}, 5).NotifyZalo)
		})
	}
}
