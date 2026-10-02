package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

const CookieName = "sc_session"

var (
	ErrSessionInvalid = errors.New("session invalid")
	ErrSessionExpired = errors.New("session expired")
)

type Session struct {
	Exp   int64  `json:"exp"`
	Iat   int64  `json:"iat"`
	Nonce string `json:"nonce"`
}

func (s Session) ExpiresAt() time.Time { return time.Unix(s.Exp, 0) }

var b64 = base64.RawURLEncoding

// Sign tạo giá trị cookie "<payload>.<hmac>"; không có trạng thái ở server, đổi SESSION_SECRET là thu hồi mọi phiên.
func Sign(now time.Time, ttl time.Duration, secret []byte) (string, Session) {
	var nonce [12]byte
	_, _ = rand.Read(nonce[:])
	s := Session{Exp: now.Add(ttl).Unix(), Iat: now.Unix(), Nonce: b64.EncodeToString(nonce[:])}
	payload, _ := json.Marshal(s)
	p := b64.EncodeToString(payload)
	return p + "." + b64.EncodeToString(mac(p, secret)), s
}

func Verify(raw string, now time.Time, secret []byte) (Session, error) {
	p, sig, ok := strings.Cut(raw, ".")
	if !ok || p == "" || sig == "" {
		return Session{}, ErrSessionInvalid
	}
	gotSig, err := b64.DecodeString(sig)
	if err != nil || !hmac.Equal(gotSig, mac(p, secret)) {
		return Session{}, ErrSessionInvalid
	}
	payload, err := b64.DecodeString(p)
	if err != nil {
		return Session{}, ErrSessionInvalid
	}
	var s Session
	if err := json.Unmarshal(payload, &s); err != nil || s.Exp == 0 {
		return Session{}, ErrSessionInvalid
	}
	if now.Unix() >= s.Exp {
		return Session{}, ErrSessionExpired
	}
	return s, nil
}

func mac(payload string, secret []byte) []byte {
	h := hmac.New(sha256.New, secret)
	h.Write([]byte(payload))
	return h.Sum(nil)
}
