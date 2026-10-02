// Package secrets niêm phong giá trị phải lưu lâu dài nhưng không được đọc được từ một hàng DB bị lộ:
// AES-256-GCM với một key cho cả process, nonce ngẫu nhiên mới mỗi lần Seal, không log thứ gì nó chạm vào.
package secrets

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"errors"
	"fmt"
)

// MinKeyLen là độ dài key tối thiểu (byte), khớp key AES-256.
const MinKeyLen = 32

var (
	ErrKeyTooShort        = errors.New("secrets: key must be at least 32 bytes")
	ErrCiphertextTooShort = errors.New("secrets: ciphertext is shorter than the nonce")
)

// Cipher an toàn khi dùng đồng thời; dựng một lần lúc khởi động từ key cấu hình.
type Cipher struct {
	aead cipher.AEAD
}

// New nhận key thô ≥ MinKeyLen byte. Key AES là SHA-256 của key thô: người vận hành có thể đặt hex,
// base64 hay chuỗi dài, băm vẫn ổn định qua các lần khởi động và giữ entropy của key dài hơn 32 byte.
func New(key []byte) (*Cipher, error) {
	if len(key) < MinKeyLen {
		return nil, ErrKeyTooShort
	}
	derived := sha256.Sum256(key)
	block, err := aes.NewCipher(derived[:])
	if err != nil {
		return nil, fmt.Errorf("secrets: build aes cipher: %w", err)
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("secrets: build gcm: %w", err)
	}
	return &Cipher{aead: aead}, nil
}

// Seal trả nonce || ciphertext || tag. Nonce lấy mới từ crypto/rand mỗi lần: dùng lại nonce dưới cùng key là phá GCM.
func (c *Cipher) Seal(plaintext []byte) ([]byte, error) {
	nonce := make([]byte, c.aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, fmt.Errorf("secrets: read nonce: %w", err)
	}
	return c.aead.Seal(nonce, nonce, plaintext, nil), nil
}

// Open đảo Seal; giá trị bị cắt, sửa hay niêm phong bằng key khác đều lỗi. Lỗi không chứa ciphertext.
func (c *Cipher) Open(sealed []byte) ([]byte, error) {
	nonceSize := c.aead.NonceSize()
	if len(sealed) <= nonceSize {
		return nil, ErrCiphertextTooShort
	}
	plaintext, err := c.aead.Open(nil, sealed[:nonceSize], sealed[nonceSize:], nil)
	if err != nil {
		return nil, errors.New("secrets: open failed: ciphertext is not authentic for this key")
	}
	return plaintext, nil
}
