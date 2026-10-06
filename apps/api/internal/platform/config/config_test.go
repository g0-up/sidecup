package config

import (
	"strings"
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

func TestZaloCredentialKey(t *testing.T) {
	setValidEnv(t)
	cfg, err := Load()
	require.NoError(t, err)
	assert.False(t, cfg.ZaloEnabled(), "rỗng là hợp lệ, tính năng tắt")

	t.Setenv("ZALO_CREDENTIAL_KEY", "short-key")
	_, err = Load()
	assert.ErrorContains(t, err, "ZALO_CREDENTIAL_KEY")

	t.Setenv("ZALO_CREDENTIAL_KEY", "0123456789abcdef0123456789abcdef")
	cfg, err = Load()
	require.NoError(t, err)
	assert.True(t, cfg.ZaloEnabled())
}

func setR2Env(t *testing.T) {
	t.Setenv("R2_ACCOUNT_ID", "0123456789abcdef0123456789abcdef")
	t.Setenv("R2_ACCESS_KEY_ID", "key")
	t.Setenv("R2_SECRET_ACCESS_KEY", "secret")
	t.Setenv("R2_BUCKET", "sidecup")
	t.Setenv("R2_PUBLIC_BASE_URL", "https://img.sidecup.example/")
}

func TestR2Disabled(t *testing.T) {
	setValidEnv(t)
	cfg, err := Load()
	require.NoError(t, err)
	assert.False(t, cfg.R2Enabled(), "rỗng là hợp lệ, tính năng tắt")
	assert.Equal(t, "products", cfg.R2Folder)
}

func TestR2Enabled(t *testing.T) {
	setValidEnv(t)
	setR2Env(t)
	t.Setenv("R2_FOLDER", " /sidecup/products/ ")
	t.Setenv("R2_SECRET_ACCESS_KEY", "secret\r\n")
	cfg, err := Load()
	require.NoError(t, err)
	assert.True(t, cfg.R2Enabled())
	assert.Equal(t, "secret", cfg.R2SecretAccessKey, "bỏ khoảng trắng/CR dán kèm khoá")
	assert.Equal(t, "https://img.sidecup.example", cfg.R2PublicBaseURL)
	assert.Equal(t, "sidecup/products", cfg.R2Folder)

	t.Setenv("R2_FOLDER", "")
	cfg, err = Load()
	require.NoError(t, err)
	assert.Equal(t, "products", cfg.R2Folder, "compose truyền chuỗi rỗng thì dùng mặc định")
}

func TestR2RejectsBadConfig(t *testing.T) {
	cases := map[string]struct {
		key, value, want string
	}{
		"partial":         {"R2_BUCKET", "", "R2_BUCKET"},
		"http base":       {"R2_PUBLIC_BASE_URL", "http://img.sidecup.example", "R2_PUBLIC_BASE_URL"},
		"relative base":   {"R2_PUBLIC_BASE_URL", "img.sidecup.example", "R2_PUBLIC_BASE_URL"},
		"dot dot folder":  {"R2_FOLDER", "products/../x", "R2_FOLDER"},
		"space in folder": {"R2_FOLDER", "my products", "R2_FOLDER"},
		"empty segment":   {"R2_FOLDER", "a//b", "R2_FOLDER"},
		"bad account id":  {"R2_ACCOUNT_ID", "acc123", "R2_ACCOUNT_ID"},
		"url too long":    {"R2_FOLDER", strings.Repeat("a", 460), "quá dài"},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			setValidEnv(t)
			setR2Env(t)
			t.Setenv(tc.key, tc.value)
			_, err := Load()
			assert.ErrorContains(t, err, tc.want)
		})
	}

	t.Run("only one var set", func(t *testing.T) {
		setValidEnv(t)
		t.Setenv("R2_ACCOUNT_ID", "0123456789abcdef0123456789abcdef")
		_, err := Load()
		assert.ErrorContains(t, err, "R2_SECRET_ACCESS_KEY")
	})
}
