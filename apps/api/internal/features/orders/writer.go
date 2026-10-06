package orders

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"gorm.io/gorm"

	"sidecup/api/internal/platform/ids"
)

// Writer là đường ghi duy nhất vào bảng orders (không có trigger ở DB).
//
// Bất biến đơn `paid` nằm ở đây: không có DELETE, mọi UPDATE kèm `WHERE status = $from`
// và `$from` không bao giờ là `paid`, nên không câu lệnh nào của ứng dụng chạm được đơn đã thu tiền.
// Ngoại lệ duy nhất là ClearCustomerContact (xoá SĐT và địa chỉ sau 90 ngày), chỉ set đúng hai cột đó.
// Quy ước review: chỉ file này được chứa `INSERT INTO orders` / `UPDATE orders`.
type Writer struct{}

const maxCodeAttempts = 3

// updatableColumns là các cột chuyển trạng thái được phép đổi. total, items, partner_*, client_id… bất biến sau khi tạo.
var updatableColumns = []string{
	"status", "cancel_reason", "payment_method", "commission_rate", "commission_amount",
	"accepted_at", "delivering_at", "paid_at", "closed_at",
}

type setEntry struct {
	col string
	val any
}

// SetClause gom các cột cần đổi; cột ngoài allowlist bị từ chối khi build câu lệnh.
type SetClause struct{ entries []setEntry }

func Set(col string, val any) SetClause { return SetClause{}.Set(col, val) }

func (s SetClause) Set(col string, val any) SetClause {
	return SetClause{entries: append(slices.Clone(s.entries), setEntry{col: col, val: val})}
}

func (s SetClause) build(id any, from Status) (string, []any, error) {
	if len(s.entries) == 0 {
		return "", nil, errors.New("orders.Writer: SetClause rỗng")
	}
	parts := make([]string, 0, len(s.entries)+1)
	args := make([]any, 0, len(s.entries)+2)
	seen := map[string]bool{}
	for _, e := range s.entries {
		if !slices.Contains(updatableColumns, e.col) {
			return "", nil, fmt.Errorf("orders.Writer: cột %q không được phép cập nhật", e.col)
		}
		if seen[e.col] {
			return "", nil, fmt.Errorf("orders.Writer: cột %q bị set hai lần", e.col)
		}
		seen[e.col] = true
		parts = append(parts, e.col+" = ?")
		args = append(args, e.val)
	}
	parts = append(parts, "updated_at = now()")
	args = append(args, id, string(from))
	sql := "UPDATE orders SET " + strings.Join(parts, ", ") + " WHERE id = ? AND status = ? RETURNING *"
	return sql, args, nil
}

// Insert tạo đơn mới ở trạng thái `sent`. Trùng idempotency_key thì không ghi gì và trả inserted=false;
// caller tự SELECT lại đơn đã có. Mã đơn trùng (hiếm) thì sinh mã khác, tối đa 3 lần, trong savepoint
// để không làm hỏng transaction bao ngoài.
func (Writer) Insert(ctx context.Context, tx *gorm.DB, o *Order) (*Order, bool, error) {
	tx = tx.WithContext(ctx)
	const sql = `INSERT INTO orders (
		code, qr_token, partner_id, partner_name, table_label, items, note, recipient_address, total, discount_total,
		status, customer_phone, client_id, idempotency_key, created_at, updated_at
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'sent', ?, ?, ?, ?, ?)
	ON CONFLICT (idempotency_key) DO NOTHING
	RETURNING *`

	for attempt := 1; ; attempt++ {
		code := ids.NewOrderCode()
		if err := tx.SavePoint("order_insert").Error; err != nil {
			return nil, false, err
		}
		var out Order
		res := tx.Raw(sql, code, o.QRToken, o.PartnerID, o.PartnerName, o.TableLabel, o.Items, o.Note, o.RecipientAddress, o.Total,
			o.CustomerPhone, o.ClientID, o.IdempotencyKey, o.CreatedAt, o.CreatedAt).Scan(&out)
		if res.Error != nil {
			if isUniqueViolation(res.Error, "orders_code_key") && attempt < maxCodeAttempts {
				if err := tx.RollbackTo("order_insert").Error; err != nil {
					return nil, false, err
				}
				continue
			}
			return nil, false, res.Error
		}
		if res.RowsAffected == 0 {
			return nil, false, nil
		}
		return &out, true, nil
	}
}

// UpdateWhereStatus là conditional UPDATE: chỉ ghi khi đơn vẫn ở trạng thái `from`.
// 0 dòng (đơn không tồn tại hoặc đã bị người khác đổi) → ErrNotFound.
func (Writer) UpdateWhereStatus(ctx context.Context, tx *gorm.DB, id any, from Status, set SetClause) (*Order, error) {
	if from == StatusPaid {
		return nil, ErrPaidImmutable
	}
	sql, args, err := set.build(id, from)
	if err != nil {
		return nil, err
	}
	var out Order
	res := tx.WithContext(ctx).Raw(sql, args...).Scan(&out)
	if res.Error != nil {
		return nil, res.Error
	}
	if res.RowsAffected == 0 {
		return nil, ErrNotFound
	}
	return &out, nil
}

// ClearCustomerContact xoá SĐT và địa chỉ người nhận của đơn đã đóng (hoặc tạo) trước mốc closedBefore,
// kể cả đơn `paid`.
func (Writer) ClearCustomerContact(ctx context.Context, tx *gorm.DB, closedBefore time.Time) (int64, error) {
	res := tx.WithContext(ctx).Exec(`UPDATE orders SET customer_phone = NULL, recipient_address = NULL, updated_at = now()
		WHERE (customer_phone IS NOT NULL OR recipient_address IS NOT NULL) AND COALESCE(closed_at, created_at) < ?`, closedBefore)
	return res.RowsAffected, res.Error
}

func isUniqueViolation(err error, constraint string) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505" && pgErr.ConstraintName == constraint
}
