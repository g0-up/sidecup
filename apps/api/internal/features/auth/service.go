package auth

import (
	"net/http"
	"time"

	"sidecup/api/internal/platform/apperr"
	"sidecup/api/internal/platform/clock"
)

const SessionTTL = 30 * 24 * time.Hour

var errWrongPassword = apperr.New(http.StatusUnauthorized, "INVALID_PASSWORD", "Mật khẩu không đúng")

type Service struct {
	passwordHash string
	secret       []byte
	clock        clock.Clock
}

func NewService(passwordHash, sessionSecret string, clk clock.Clock) *Service {
	return &Service{passwordHash: passwordHash, secret: []byte(sessionSecret), clock: clk}
}

func (s *Service) Login(password string) (string, Session, error) {
	if !VerifyPassword(s.passwordHash, password) {
		return "", Session{}, errWrongPassword
	}
	token, sess := Sign(s.clock.Now(), SessionTTL, s.secret)
	return token, sess, nil
}

func (s *Service) Verify(raw string) (Session, error) {
	return Verify(raw, s.clock.Now(), s.secret)
}

// VerifyCookie khớp chữ ký của middleware.SellerAuth.
func (s *Service) VerifyCookie(raw string) error {
	_, err := s.Verify(raw)
	return err
}
