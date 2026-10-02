// Package vietqr sinh chuỗi QR chuyển khoản theo chuẩn EMVCo của NAPAS (VietQR), không gọi dịch vụ ngoài.
package vietqr

import (
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

const (
	napasGUID      = "A000000727"
	serviceAccount = "QRIBFTTA" // chuyển nhanh tới số tài khoản
	currencyVND    = "704"
	countryVN      = "VN"
	maxPurposeLen  = 25
)

var (
	binRe     = regexp.MustCompile(`^\d{6}$`)
	accountRe = regexp.MustCompile(`^[0-9A-Za-z]{1,19}$`)
	purposeRe = regexp.MustCompile(`[^0-9A-Za-z ]+`)
)

// Payload trả chuỗi để render thành QR. Amount là VND nguyên; purpose chỉ giữ chữ, số, khoảng trắng
// (app ngân hàng hiển thị không dấu) và cắt còn 25 ký tự.
//
// Cấu trúc: 00 phiên bản, 01=12 QR động (có số tiền), 38 thông tin người nhận
// (00 GUID NAPAS, 01 {00 BIN, 01 số tài khoản}, 02 dịch vụ), 53 tiền tệ, 54 số tiền, 58 quốc gia,
// 62 {08 nội dung}, 63 CRC16-CCITT-FALSE tính trên toàn chuỗi kể cả "6304".
// Trường 52 (MCC) không đưa vào: chuỗi VietQR chuyển khoản cá nhân phổ biến không dùng.
func Payload(bin, account string, amount int64, purpose string) (string, error) {
	if !binRe.MatchString(bin) {
		return "", errors.New("vietqr: BIN phải gồm 6 chữ số")
	}
	if !accountRe.MatchString(account) {
		return "", errors.New("vietqr: số tài khoản không hợp lệ")
	}
	if amount <= 0 {
		return "", errors.New("vietqr: số tiền phải lớn hơn 0")
	}
	purpose = SanitizePurpose(purpose)

	beneficiary := tlv("00", bin) + tlv("01", account)
	merchant := tlv("00", napasGUID) + tlv("01", beneficiary) + tlv("02", serviceAccount)
	var b strings.Builder
	b.WriteString(tlv("00", "01"))
	b.WriteString(tlv("01", "12"))
	b.WriteString(tlv("38", merchant))
	b.WriteString(tlv("53", currencyVND))
	b.WriteString(tlv("54", strconv.FormatInt(amount, 10)))
	b.WriteString(tlv("58", countryVN))
	if purpose != "" {
		b.WriteString(tlv("62", tlv("08", purpose)))
	}
	b.WriteString("6304")
	s := b.String()
	return s + fmt.Sprintf("%04X", CRC16([]byte(s))), nil
}

func SanitizePurpose(s string) string {
	s = strings.TrimSpace(purposeRe.ReplaceAllString(s, " "))
	s = strings.Join(strings.Fields(s), " ")
	if len(s) > maxPurposeLen {
		s = strings.TrimSpace(s[:maxPurposeLen])
	}
	return s
}

func tlv(id, value string) string {
	return fmt.Sprintf("%s%02d%s", id, len(value), value)
}

// CRC16 là CRC-16/CCITT-FALSE: đa thức 0x1021, khởi tạo 0xFFFF, không đảo bit.
func CRC16(data []byte) uint16 {
	crc := uint16(0xFFFF)
	for _, b := range data {
		crc ^= uint16(b) << 8
		for range 8 {
			if crc&0x8000 != 0 {
				crc = crc<<1 ^ 0x1021
			} else {
				crc <<= 1
			}
		}
	}
	return crc
}
