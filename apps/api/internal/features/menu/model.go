package menu

import "time"

// PageView đếm thiết bị mở trang menu, mỗi (mã QR, ngày theo APP_TZ, client_id) một dòng.
type PageView struct {
	QRToken     string    `gorm:"column:qr_token;primaryKey"`
	Day         time.Time `gorm:"column:day;type:date;primaryKey"`
	ClientID    string    `gorm:"column:client_id;primaryKey"`
	FirstSeenAt time.Time `gorm:"column:first_seen_at"`
}

func (PageView) TableName() string { return "page_views" }
