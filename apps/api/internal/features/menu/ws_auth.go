package menu

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"sidecup/api/internal/platform/realtime"
)

var errForbidden = errors.New("customer websocket forbidden")

// CustomerAuthorizer quyết định trang khách được nghe topic nào:
// token phải còn hiệu lực; đơn phải tồn tại và thuộc đúng client_id.
// Mọi phần được yêu cầu đều phải hợp lệ, nếu không thì từ chối cả kết nối.
type CustomerAuthorizer struct{ db *gorm.DB }

func NewCustomerAuthorizer(db *gorm.DB) CustomerAuthorizer { return CustomerAuthorizer{db: db} }

func (a CustomerAuthorizer) CustomerTopics(ctx context.Context, clientID, orderID, token string) ([]string, error) {
	cid, err := uuid.Parse(clientID)
	if err != nil || (orderID == "" && token == "") {
		return nil, errForbidden
	}
	var topics []string
	if token != "" {
		var n int64
		if err := a.db.WithContext(ctx).Table("qr_codes").Where("token = ? AND active", token).Count(&n).Error; err != nil {
			return nil, err
		}
		if n == 0 {
			return nil, errForbidden
		}
		topics = append(topics, realtime.TopicMenu(token))
	}
	if orderID != "" {
		oid, err := uuid.Parse(orderID)
		if err != nil {
			return nil, errForbidden
		}
		var n int64
		if err := a.db.WithContext(ctx).Table("orders").Where("id = ? AND client_id = ?", oid, cid.String()).Count(&n).Error; err != nil {
			return nil, err
		}
		if n == 0 {
			return nil, errForbidden
		}
		topics = append(topics, realtime.TopicOrder(oid.String()))
	}
	return topics, nil
}
