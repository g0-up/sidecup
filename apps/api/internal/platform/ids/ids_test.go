package ids

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestTokensUseAlphabetAndLength(t *testing.T) {
	seen := map[string]bool{}
	for range 500 {
		tok := NewQRToken()
		assert.Len(t, tok, QRTokenLength)
		for _, r := range tok {
			assert.True(t, strings.ContainsRune(Alphabet, r), "ký tự ngoài bảng chữ: %q", r)
		}
		assert.False(t, seen[tok], "token trùng")
		seen[tok] = true
	}
	code := NewOrderCode()
	assert.Len(t, code, OrderCodeLength)
	assert.NotContains(t, Alphabet, "0")
	assert.NotContains(t, Alphabet, "O")
	assert.NotContains(t, Alphabet, "I")
	assert.NotContains(t, Alphabet, "1")
}
