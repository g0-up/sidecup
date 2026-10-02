package vietqr

import (
	"fmt"
	"strconv"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCRC16StandardVector(t *testing.T) {
	assert.Equal(t, uint16(0x29B1), CRC16([]byte("123456789")))
}

// parseTLV tách chuỗi EMVCo thành map id → value để kiểm cấu trúc độc lập với code sinh.
func parseTLV(t *testing.T, s string) map[string]string {
	t.Helper()
	out := map[string]string{}
	for len(s) > 0 {
		require.GreaterOrEqual(t, len(s), 4, "TLV cụt: %q", s)
		n, err := strconv.Atoi(s[2:4])
		require.NoError(t, err)
		require.GreaterOrEqual(t, len(s), 4+n)
		out[s[:2]] = s[4 : 4+n]
		s = s[4+n:]
	}
	return out
}

func TestPayloadStructure(t *testing.T) {
	p, err := Payload("970415", "0123456789", 45000, "AB12CD")
	require.NoError(t, err)
	assert.True(t, strings.HasPrefix(p, "000201010212"))

	top := parseTLV(t, p)
	assert.Equal(t, "01", top["00"])
	assert.Equal(t, "12", top["01"])
	assert.Equal(t, "704", top["53"])
	assert.Equal(t, "45000", top["54"])
	assert.Equal(t, "VN", top["58"])
	assert.Equal(t, map[string]string{"08": "AB12CD"}, parseTLV(t, top["62"]))

	merchant := parseTLV(t, top["38"])
	assert.Equal(t, "A000000727", merchant["00"])
	assert.Equal(t, "QRIBFTTA", merchant["02"])
	assert.Equal(t, map[string]string{"00": "970415", "01": "0123456789"}, parseTLV(t, merchant["01"]))

	// CRC là 4 ký tự cuối và tính trên mọi thứ phía trước, kể cả "6304".
	body := p[:len(p)-4]
	assert.True(t, strings.HasSuffix(body, "6304"))
	assert.Equal(t, fmt.Sprintf("%04X", CRC16([]byte(body))), p[len(p)-4:])
}

// Vector cố định: chặn mọi thay đổi vô ý ở định dạng. Đổi vector chỉ sau khi đã quét thử bằng app ngân hàng thật.
func TestPayloadGoldenVector(t *testing.T) {
	p, err := Payload("970415", "0123456789", 45000, "AB12CD")
	require.NoError(t, err)
	const want = "00020101021238540010A00000072701240006970415011001234567890208QRIBFTTA5303704540545000" +
		"5802VN62100806AB12CD6304"
	assert.Equal(t, want, p[:len(p)-4])
	assert.Len(t, p, len(want)+4)
}

func TestPayloadValidatesInput(t *testing.T) {
	_, err := Payload("97041", "0123456789", 1000, "x")
	assert.Error(t, err)
	_, err = Payload("970415", "", 1000, "x")
	assert.Error(t, err)
	_, err = Payload("970415", "0123456789", 0, "x")
	assert.Error(t, err)
}

func TestSanitizePurpose(t *testing.T) {
	assert.Equal(t, "AB12CD", SanitizePurpose("AB12CD"))
	assert.Equal(t, "Tra a b n 3", SanitizePurpose("Tra đa: bàn 3!"), "ký tự ngoài ASCII bị bỏ")
	assert.Len(t, SanitizePurpose(strings.Repeat("A", 40)), maxPurposeLen)
	assert.Equal(t, "", SanitizePurpose("###"))
}
