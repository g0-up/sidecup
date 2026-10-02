package reports

import (
	"context"
	"errors"
	"slices"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"sidecup/api/internal/features/partners"
	"sidecup/api/internal/platform/apperr"
	"sidecup/api/internal/platform/clock"
)

const defaultFunnelDays = 7

type Service struct {
	db    *gorm.DB
	clock clock.Clock
}

func NewService(db *gorm.DB, clk clock.Clock) *Service { return &Service{db: db, clock: clk} }

// Commission tính theo quán. Với period=current|previous mỗi quán dùng kỳ trả của chính nó (tuần hoặc tháng),
// nên báo cáo "tất cả quán" có thể gồm các khoảng ngày khác nhau; mỗi dòng ghi rõ from/to.
func (s *Service) Commission(ctx context.Context, q Query) (CommissionReport, error) {
	ps, err := s.partners(ctx, q.PartnerID)
	if err != nil {
		return CommissionReport{}, err
	}
	ranges := map[Range][]uuid.UUID{}
	if q.Period != "" {
		if q.Period != PeriodCurrent && q.Period != PeriodPrevious {
			return CommissionReport{}, apperr.Field("period", "Giá trị phải là current hoặc previous")
		}
		for _, p := range ps {
			r := Resolve(p.PayoutPeriod, q.Period, s.clock.Now(), s.clock.Location())
			ranges[r] = append(ranges[r], p.ID)
		}
	} else {
		r, err := ParseRange(q.From, q.To, s.clock.Location())
		if err != nil {
			return CommissionReport{}, err
		}
		for _, p := range ps {
			ranges[r] = append(ranges[r], p.ID)
		}
	}

	report := CommissionReport{Rows: []CommissionLine{}}
	for r, ids := range ranges {
		from, to := r.Bounds()
		rows, err := commission(ctx, s.db, ids, from, to)
		if err != nil {
			return CommissionReport{}, err
		}
		for _, row := range rows {
			empty := row.PaidCount == 0 && row.FailedCount == 0 && row.AdjustmentsCount == 0
			if !row.Active && empty && q.PartnerID == nil {
				continue
			}
			rate, _ := row.CommissionRate.Float64()
			line := CommissionLine{
				PartnerID: row.PartnerID, PartnerName: row.PartnerName, CommissionRate: rate, PayoutPeriod: row.PayoutPeriod,
				From: r.From.Format(time.DateOnly), To: r.To.Format(time.DateOnly),
				PaidCount: row.PaidCount, Revenue: row.Revenue, FailedCount: row.FailedCount, Commission: row.Commission,
				AdjustmentsTotal: row.AdjustmentsTotal, AdjustmentsCount: row.AdjustmentsCount,
				Net: row.Commission + row.AdjustmentsTotal,
			}
			report.Rows = append(report.Rows, line)
			t := &report.Total
			t.PaidCount += line.PaidCount
			t.Revenue += line.Revenue
			t.FailedCount += line.FailedCount
			t.Commission += line.Commission
			t.AdjustmentsTotal += line.AdjustmentsTotal
			t.Net += line.Net
		}
	}
	slices.SortStableFunc(report.Rows, func(a, b CommissionLine) int { return strings.Compare(a.PartnerName, b.PartnerName) })
	return report, nil
}

// Export trả bản text cho đúng một quán.
func (s *Service) Export(ctx context.Context, q Query) (string, CommissionLine, error) {
	if q.PartnerID == nil {
		return "", CommissionLine{}, apperr.Field("partner_id", "Chọn một quán để xuất báo cáo")
	}
	rep, err := s.Commission(ctx, q)
	if err != nil {
		return "", CommissionLine{}, err
	}
	if len(rep.Rows) != 1 {
		return "", CommissionLine{}, partners.ErrNotFound
	}
	line := rep.Rows[0]
	return ExportText(line, q.Period != ""), line, nil
}

func (s *Service) Funnel(ctx context.Context, q Query) (FunnelReport, error) {
	var r Range
	if q.From == "" && q.To == "" {
		today := clock.TodayIn(s.clock.Now(), s.clock.Location())
		r = Range{From: today.AddDate(0, 0, -(defaultFunnelDays - 1)), To: today}
	} else {
		var err error
		if r, err = ParseRange(q.From, q.To, s.clock.Location()); err != nil {
			return FunnelReport{}, err
		}
	}
	rows, err := funnel(ctx, s.db, r, s.clock.Location().String(), q.PartnerID)
	if err != nil {
		return FunnelReport{}, err
	}
	out := FunnelReport{From: r.From.Format(time.DateOnly), To: r.To.Format(time.DateOnly), Rows: make([]FunnelLine, len(rows))}
	for i, row := range rows {
		out.Rows[i] = FunnelLine{PartnerID: row.PartnerID, PartnerName: row.PartnerName, Day: row.Day.Format(time.DateOnly),
			Views: row.Views, Orders: row.Orders, Paid: row.Paid}
	}
	return out, nil
}

func (s *Service) ListAdjustments(ctx context.Context, q Query) ([]AdjustmentView, error) {
	var r Range
	if q.From == "" && q.To == "" && q.Period == "" {
		today := clock.TodayIn(s.clock.Now(), s.clock.Location())
		r = Range{From: today.AddDate(0, 0, -90), To: today}
	} else if q.Period != "" {
		if q.PartnerID == nil {
			return nil, apperr.Field("partner_id", "Chọn quán khi lọc theo kỳ")
		}
		p, err := s.partner(ctx, *q.PartnerID)
		if err != nil {
			return nil, err
		}
		r = Resolve(p.PayoutPeriod, q.Period, s.clock.Now(), s.clock.Location())
	} else {
		var err error
		if r, err = ParseRange(q.From, q.To, s.clock.Location()); err != nil {
			return nil, err
		}
	}
	from, to := r.Bounds()
	rows, err := listAdjustments(ctx, s.db, q.PartnerID, from, to)
	if err != nil {
		return nil, err
	}
	out := make([]AdjustmentView, len(rows))
	for i, row := range rows {
		out[i] = AdjustmentView{ID: row.ID, PartnerID: row.PartnerID, PartnerName: row.PartnerName, OrderID: row.OrderID,
			OrderCode: row.OrderCode, Amount: row.Amount, Reason: row.Reason, CreatedBy: row.CreatedBy, CreatedAt: row.CreatedAt}
	}
	return out, nil
}

func (s *Service) CreateAdjustment(ctx context.Context, req CreateAdjustmentReq) (AdjustmentView, error) {
	reason := strings.TrimSpace(req.Reason)
	if reason == "" {
		return AdjustmentView{}, apperr.Field("reason", "Không được để trống")
	}
	p, err := s.partner(ctx, req.PartnerID)
	if err != nil {
		return AdjustmentView{}, err
	}
	adj := Adjustment{PartnerID: p.ID, Amount: req.Amount, Reason: reason, CreatedBy: "seller", CreatedAt: s.clock.Now()}
	var code *string
	if c := strings.ToUpper(strings.TrimSpace(req.OrderCode)); c != "" {
		var row struct {
			ID        uuid.UUID
			PartnerID uuid.UUID
		}
		res := s.db.WithContext(ctx).Table("orders").Select("id, partner_id").Where("code = ?", c).Scan(&row)
		if res.Error != nil {
			return AdjustmentView{}, res.Error
		}
		if res.RowsAffected == 0 {
			return AdjustmentView{}, apperr.Field("order_code", "Không tìm thấy đơn với mã này")
		}
		if row.PartnerID != p.ID {
			return AdjustmentView{}, apperr.Field("order_code", "Đơn này thuộc quán khác")
		}
		adj.OrderID, code = &row.ID, &c
	}
	if err := s.db.WithContext(ctx).Create(&adj).Error; err != nil {
		return AdjustmentView{}, err
	}
	return AdjustmentView{ID: adj.ID, PartnerID: adj.PartnerID, PartnerName: p.Name, OrderID: adj.OrderID, OrderCode: code,
		Amount: adj.Amount, Reason: adj.Reason, CreatedBy: adj.CreatedBy, CreatedAt: adj.CreatedAt}, nil
}

func (s *Service) partners(ctx context.Context, id *uuid.UUID) ([]partners.Partner, error) {
	if id != nil {
		p, err := s.partner(ctx, *id)
		return []partners.Partner{p}, err
	}
	var ps []partners.Partner
	err := s.db.WithContext(ctx).Order("name").Find(&ps).Error
	return ps, err
}

func (s *Service) partner(ctx context.Context, id uuid.UUID) (partners.Partner, error) {
	var p partners.Partner
	err := s.db.WithContext(ctx).First(&p, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return p, partners.ErrNotFound
	}
	return p, err
}
