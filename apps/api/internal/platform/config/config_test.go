package config

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setValidEnv(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://u:p@localhost/db")
	t.Setenv("PUBLIC_BASE_URL", "https://sidecup.example/")
	t.Setenv("SELLER_PASSWORD_HASH", "5F4DCC3B5AA765D61D8327DEB882CF99")
	t.Setenv("SESSION_SECRET", "0123456789abcdef0123456789abcdef")
	t.Setenv("NOTIFIER_TOKEN", "notifier-token-123456")
	t.Setenv("CORS_ORIGINS", " http://a.test , ,http://b.test")
}

func TestLoadValid(t *testing.T) {
	setValidEnv(t)
	cfg, err := Load()
	require.NoError(t, err)
	assert.Equal(t, "https://sidecup.example", cfg.PublicBaseURL)
	assert.Equal(t, "sidecup.example", cfg.PublicHost)
	assert.Equal(t, "5f4dcc3b5aa765d61d8327deb882cf99", cfg.SellerPasswordHash)
	assert.Equal(t, []string{"http://a.test", "http://b.test"}, cfg.CORSOrigins)
	assert.Equal(t, "Asia/Ho_Chi_Minh", cfg.Location.String())
	assert.True(t, cfg.SecureCookies())
}

func TestLoadRejectsWeakSecrets(t *testing.T) {
	cases := map[string][2]string{
		"short secret":   {"SESSION_SECRET", "too-short"},
		"bad hash":       {"SELLER_PASSWORD_HASH", "not-hex-not-hex-not-hex-not-hex!"},
		"bcrypt hash":    {"SELLER_PASSWORD_HASH", "$2a$10$abcdefghijklmnopqrstuv"},
		"no base url":    {"PUBLIC_BASE_URL", ""},
		"relative url":   {"PUBLIC_BASE_URL", "/t"},
		"bad tz":         {"APP_TZ", "Mars/Olympus"},
		"short notifier": {"NOTIFIER_TOKEN", "abc"},
		"no database":    {"DATABASE_URL", ""},
	}
	for name, kv := range cases {
		t.Run(name, func(t *testing.T) {
			setValidEnv(t)
			t.Setenv(kv[0], kv[1])
			_, err := Load()
			assert.Error(t, err)
		})
	}
}
