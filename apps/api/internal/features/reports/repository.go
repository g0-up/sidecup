package reports

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

// Báo cáo dùng SQL tường minh: chỉ SUM cột đã ghi cứng lúc `paid` (commission_amount), không tính lại từ tỷ lệ.

type commissionRow struct {
	PartnerID        uuid.UUID
	PartnerName      string
	CommissionRate   decimal.Decimal
	PayoutPeriod     string
	Active           bool
	PaidCount        int64
	Revenue          int64
	Commission       int64
	FailedCount      int64
	AdjustmentsTotal int64
	AdjustmentsCount int64
}

const commissionSQL = `
SELECT p.id AS partner_id, p.name AS partner_name, p.commission_rate, p.payout_period, p.active,
       COALESCE(paid.paid_count, 0)  AS paid_count,
       COALESCE(paid.revenue, 0)     AS revenue,
       COALESCE(paid.commission, 0)  AS commission,
       COALESCE(f.failed_count, 0)   AS failed_count,
       COALESCE(a.total, 0)          AS adjustments_total,
       COALESCE(a.cnt, 0)            AS adjustments_count
FROM partners p
LEFT JOIN (
    SELECT partner_id, count(*) AS paid_count, sum(total)::bigint AS revenue, sum(commission_amount)::bigint AS commission
    FROM orders WHERE status = 'paid' AND paid_at >= @from AND paid_at < @to
    GROUP BY partner_id
) paid ON paid.partner_id = p.id
LEFT JOIN (
    SELECT partner_id, count(*) AS failed_count
    FROM orders WHERE status = 'failed' AND closed_at >= @from AND closed_at < @to
    GROUP BY partner_id
) f ON f.partner_id = p.id
LEFT JOIN (
    SELECT partner_id, sum(amount)::bigint AS total, count(*) AS cnt
    FROM adjustments WHERE created_at >= @from AND created_at < @to
    GROUP BY partner_id
) a ON a.partner_id = p.id
WHERE p.id IN @ids
ORDER BY p.name`

func commission(ctx context.Context, db *gorm.DB, ids []uuid.UUID, from, to time.Time) ([]commissionRow, error) {
	var rows []commissionRow
	err := db.WithContext(ctx).Raw(commissionSQL, map[string]any{"ids": ids, "from": from, "to": to}).Scan(&rows).Error
	return rows, err
}

type funnelRow struct {
	PartnerID   uuid.UUID
	PartnerName string
	Day         time.Time
	Views       int64
	Orders      int64
	Paid        int64
}

// Phễu theo quán theo ngày (APP_TZ): thiết bị mở trang (distinct client) → đơn tạo → đơn đã thu tiền.
const funnelSQL = `
WITH v AS (
    SELECT q.partner_id, pv.day, count(DISTINCT pv.client_id) AS views
    FROM page_views pv JOIN qr_codes q ON q.token = pv.qr_token
    WHERE pv.day BETWEEN @from_day AND @to_day
    GROUP BY q.partner_id, pv.day
), o AS (
    SELECT partner_id, (created_at AT TIME ZONE @tz)::date AS day,
           count(*) AS orders, count(*) FILTER (WHERE status = 'paid') AS paid
    FROM orders WHERE created_at >= @from AND created_at < @to
    GROUP BY 1, 2
)
SELECT p.id AS partner_id, p.name AS partner_name, COALESCE(v.day, o.day) AS day,
       COALESCE(v.views, 0) AS views, COALESCE(o.orders, 0) AS orders, COALESCE(o.paid, 0) AS paid
FROM v FULL JOIN o ON o.partner_id = v.partner_id AND o.day = v.day
JOIN partners p ON p.id = COALESCE(v.partner_id, o.partner_id)
WHERE (CAST(@partner_id AS uuid) IS NULL OR p.id = CAST(@partner_id AS uuid))
ORDER BY day DESC, p.name`

func funnel(ctx context.Context, db *gorm.DB, r Range, tz string, partnerID *uuid.UUID) ([]funnelRow, error) {
	from, to := r.Bounds()
	var rows []funnelRow
	err := db.WithContext(ctx).Raw(funnelSQL, map[string]any{
		"from_day": r.From.Format(time.DateOnly), "to_day": r.To.Format(time.DateOnly),
		"from": from, "to": to, "tz": tz, "partner_id": partnerID,
	}).Scan(&rows).Error
	return rows, err
}

type adjustmentRow struct {
	Adjustment
	PartnerName string
	OrderCode   *string
}

func listAdjustments(ctx context.Context, db *gorm.DB, partnerID *uuid.UUID, from, to time.Time) ([]adjustmentRow, error) {
	q := db.WithContext(ctx).Table("adjustments a").
		Select("a.*, p.name AS partner_name, o.code AS order_code").
		Joins("JOIN partners p ON p.id = a.partner_id").
		Joins("LEFT JOIN orders o ON o.id = a.order_id").
		Where("a.created_at >= ? AND a.created_at < ?", from, to).
		Order("a.created_at DESC")
	if partnerID != nil {
		q = q.Where("a.partner_id = ?", *partnerID)
	}
	var rows []adjustmentRow
	err := q.Scan(&rows).Error
	return rows, err
}
