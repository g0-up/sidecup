// Package config đọc biến môi trường thành Config và từ chối khởi động khi thiếu hoặc sai.
package config

import (
	"encoding/hex"
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/caarlos0/env/v11"
)

type Config struct {
	AppEnv             string   `env:"APP_ENV" envDefault:"dev"`
	HTTPAddr           string   `env:"HTTP_ADDR" envDefault:":8080"`
	DatabaseURL        string   `env:"DATABASE_URL"`
	AppTZ              string   `env:"APP_TZ" envDefault:"Asia/Ho_Chi_Minh"`
	PublicBaseURL      string   `env:"PUBLIC_BASE_URL"`
	SellerPasswordHash string   `env:"SELLER_PASSWORD_HASH"`
	SessionSecret      string   `env:"SESSION_SECRET"`
	NotifierToken      string   `env:"NOTIFIER_TOKEN"`
	CORSOrigins        []string `env:"CORS_ORIGINS" envSeparator:","`
	LogLevel           string   `env:"LOG_LEVEL" envDefault:"info"`
	MigrateOnStart     bool     `env:"MIGRATE_ON_START" envDefault:"false"`
	// ZaloCredentialKey mã hoá phiên Zalo lưu trong DB; rỗng thì tắt tính năng gửi tin Zalo.
	ZaloCredentialKey string `env:"ZALO_CREDENTIAL_KEY"`
	// R2_* cấu hình kho ảnh món trên Cloudflare R2; để trống hết thì tắt tải ảnh lên.
	R2AccountID       string `env:"R2_ACCOUNT_ID"`
	R2AccessKeyID     string `env:"R2_ACCESS_KEY_ID"`
	R2SecretAccessKey string `env:"R2_SECRET_ACCESS_KEY"`
	R2Bucket          string `env:"R2_BUCKET"`
	R2PublicBaseURL   string `env:"R2_PUBLIC_BASE_URL"`
	R2Folder          string `env:"R2_FOLDER"`

	Location *time.Location `env:"-"`
	// PublicHost là host[:port] của PublicBaseURL, dùng để kiểm Origin khi nâng cấp WebSocket.
	PublicHost string `env:"-"`
}

// IsDev bật các tiện ích chỉ dành cho máy dev (cookie không Secure, seed).
func (c Config) IsDev() bool { return c.AppEnv == "dev" }

// ZaloEnabled: có key mã hoá thì mới liên kết và gửi tin Zalo.
func (c Config) ZaloEnabled() bool { return c.ZaloCredentialKey != "" }

// R2Enabled: đủ tài khoản, khoá, bucket và URL công khai thì mới nhận ảnh món.
func (c Config) R2Enabled() bool {
	return c.R2AccountID != "" && c.R2AccessKeyID != "" && c.R2SecretAccessKey != "" &&
		c.R2Bucket != "" && c.R2PublicBaseURL != ""
}

// SecureCookies quyết định cờ Secure của cookie phiên: chỉ tắt khi chạy trên http (dev, e2e local).
func (c Config) SecureCookies() bool {
	return strings.HasPrefix(c.PublicBaseURL, "https://")
}

// Load đọc env đầy đủ cho tiến trình phục vụ HTTP.
func Load() (Config, error) {
	cfg, err := parse()
	if err != nil {
		return cfg, err
	}
	return cfg, cfg.validate()
}

// LoadDatabase chỉ cần DATABASE_URL; dùng cho lệnh migrate/seed.
func LoadDatabase() (Config, error) {
	cfg, err := parse()
	if err != nil {
		return cfg, err
	}
	if cfg.DatabaseURL == "" {
		return cfg, errors.New("DATABASE_URL là bắt buộc")
	}
	loc, err := time.LoadLocation(cfg.AppTZ)
	if err != nil {
		return cfg, fmt.Errorf("APP_TZ không hợp lệ: %w", err)
	}
	cfg.Location = loc
	return cfg, nil
}

func parse() (Config, error) {
	var cfg Config
	if err := env.Parse(&cfg); err != nil {
		return cfg, fmt.Errorf("đọc env: %w", err)
	}
	cfg.CORSOrigins = compact(cfg.CORSOrigins)
	cfg.SellerPasswordHash = strings.ToLower(strings.TrimSpace(cfg.SellerPasswordHash))
	cfg.PublicBaseURL = strings.TrimRight(strings.TrimSpace(cfg.PublicBaseURL), "/")
	// Khoá dán từ dashboard hay dính khoảng trắng/CR; để nguyên thì chỉ lỗi lúc tải ảnh, không lỗi lúc khởi động.
	for _, v := range []*string{&cfg.R2AccountID, &cfg.R2AccessKeyID, &cfg.R2SecretAccessKey, &cfg.R2Bucket} {
		*v = strings.TrimSpace(*v)
	}
	cfg.R2PublicBaseURL = strings.TrimRight(strings.TrimSpace(cfg.R2PublicBaseURL), "/")
	// compose truyền R2_FOLDER rỗng khi không đặt, nên mặc định ở đây thay vì envDefault.
	if cfg.R2Folder = strings.Trim(strings.TrimSpace(cfg.R2Folder), "/"); cfg.R2Folder == "" {
		cfg.R2Folder = "products"
	}
	return cfg, nil
}

func (c *Config) validate() error {
	var errs []error
	if c.DatabaseURL == "" {
		errs = append(errs, errors.New("DATABASE_URL là bắt buộc"))
	}
	loc, err := time.LoadLocation(c.AppTZ)
	if err != nil {
		errs = append(errs, fmt.Errorf("APP_TZ không hợp lệ: %w", err))
	}
	c.Location = loc

	u, err := url.Parse(c.PublicBaseURL)
	if c.PublicBaseURL == "" || err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		errs = append(errs, errors.New("PUBLIC_BASE_URL phải là URL http(s) đầy đủ"))
	} else {
		c.PublicHost = u.Host
	}

	if len(c.SellerPasswordHash) != 32 {
		errs = append(errs, errors.New("SELLER_PASSWORD_HASH phải là MD5 hex 32 ký tự"))
	} else if _, err := hex.DecodeString(c.SellerPasswordHash); err != nil {
		errs = append(errs, errors.New("SELLER_PASSWORD_HASH phải là MD5 hex 32 ký tự"))
	}
	if len(c.SessionSecret) < 32 {
		errs = append(errs, errors.New("SESSION_SECRET phải dài ít nhất 32 byte"))
	}
	if len(c.NotifierToken) < 16 {
		errs = append(errs, errors.New("NOTIFIER_TOKEN phải dài ít nhất 16 ký tự"))
	}
	if c.ZaloCredentialKey != "" && len(c.ZaloCredentialKey) < 32 {
		errs = append(errs, errors.New("ZALO_CREDENTIAL_KEY phải dài ít nhất 32 byte"))
	}
	errs = append(errs, c.validateR2()...)
	switch c.LogLevel {
	case "debug", "info", "warn", "error":
	default:
		errs = append(errs, fmt.Errorf("LOG_LEVEL không hợp lệ: %q", c.LogLevel))
	}
	return errors.Join(errs...)
}

// r2Folder: chỉ chữ, số, '/', '_', '-' để key trong bucket đoán được và không có "..".
var r2Folder = regexp.MustCompile(`^[A-Za-z0-9_-]+(/[A-Za-z0-9_-]+)*$`)

// r2AccountID: Account ID của Cloudflare là 32 ký tự hex, nằm trong hostname endpoint S3.
var r2AccountID = regexp.MustCompile(`^[0-9a-f]{32}$`)

// r2KeySuffix: "/" + uuid (36) + ".webp" — phần dài nhất API nối sau R2_PUBLIC_BASE_URL/R2_FOLDER.
const r2KeySuffix = 1 + 36 + len(".webp")

// maxImageURL khớp giới hạn image_url của món (products/dto.go); URL ảnh dài hơn thì tải lên được nhưng không lưu được.
const maxImageURL = 500

// validateR2 cho phép tắt hẳn (để trống cả năm biến) nhưng từ chối cấu hình dở dang.
func (c *Config) validateR2() []error {
	vars := []struct{ name, value string }{
		{"R2_ACCOUNT_ID", c.R2AccountID},
		{"R2_ACCESS_KEY_ID", c.R2AccessKeyID},
		{"R2_SECRET_ACCESS_KEY", c.R2SecretAccessKey},
		{"R2_BUCKET", c.R2Bucket},
		{"R2_PUBLIC_BASE_URL", c.R2PublicBaseURL},
	}
	var missing []string
	for _, v := range vars {
		if v.value == "" {
			missing = append(missing, v.name)
		}
	}
	if len(missing) == len(vars) {
		return nil
	}
	var errs []error
	if len(missing) > 0 {
		errs = append(errs, fmt.Errorf("thiếu %s: đặt đủ các biến R2_* hoặc để trống hết để tắt tải ảnh", strings.Join(missing, ", ")))
	}
	if c.R2PublicBaseURL != "" {
		u, err := url.Parse(c.R2PublicBaseURL)
		if err != nil || u.Scheme != "https" || u.Host == "" || u.RawQuery != "" || u.Fragment != "" {
			errs = append(errs, errors.New("R2_PUBLIC_BASE_URL phải là URL https đầy đủ"))
		}
	}
	if c.R2AccountID != "" && !r2AccountID.MatchString(c.R2AccountID) {
		errs = append(errs, errors.New("R2_ACCOUNT_ID phải là 32 ký tự hex (Account ID trong trang R2)"))
	}
	if !r2Folder.MatchString(c.R2Folder) {
		errs = append(errs, errors.New("R2_FOLDER chỉ gồm chữ, số, '/', '_' và '-'"))
	}
	if len(c.R2PublicBaseURL)+1+len(c.R2Folder)+r2KeySuffix > maxImageURL {
		errs = append(errs, fmt.Errorf("R2_PUBLIC_BASE_URL và R2_FOLDER quá dài: URL ảnh phải ≤ %d ký tự", maxImageURL))
	}
	return errs
}

func compact(in []string) []string {
	out := in[:0]
	for _, s := range in {
		if s = strings.TrimSpace(s); s != "" {
			out = append(out, s)
		}
	}
	return out
}
