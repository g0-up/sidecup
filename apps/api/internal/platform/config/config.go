// Package config đọc biến môi trường thành Config và từ chối khởi động khi thiếu hoặc sai.
package config

import (
	"encoding/hex"
	"errors"
	"fmt"
	"net/url"
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

	Location *time.Location `env:"-"`
	// PublicHost là host[:port] của PublicBaseURL, dùng để kiểm Origin khi nâng cấp WebSocket.
	PublicHost string `env:"-"`
}

// IsDev bật các tiện ích chỉ dành cho máy dev (cookie không Secure, seed).
func (c Config) IsDev() bool { return c.AppEnv == "dev" }

// ZaloEnabled: có key mã hoá thì mới liên kết và gửi tin Zalo.
func (c Config) ZaloEnabled() bool { return c.ZaloCredentialKey != "" }

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
	switch c.LogLevel {
	case "debug", "info", "warn", "error":
	default:
		errs = append(errs, fmt.Errorf("LOG_LEVEL không hợp lệ: %q", c.LogLevel))
	}
	return errors.Join(errs...)
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
