package orders

import (
	"fmt"
	"slices"
	"strings"

	"github.com/google/uuid"

	"sidecup/api/internal/platform/apperr"
)

const (
	MaxQtyPerLine = 20
	DefaultSweet  = "medium"
	DefaultIce    = "normal"
)

// LineReq là một dòng khách gửi lên; giá luôn do server tra.
type LineReq struct {
	ProductID uuid.UUID `json:"product_id" validate:"required"`
	Qty       int       `json:"qty" validate:"gte=1,lte=20"`
	Sweet     *string   `json:"sweet" validate:"omitempty,oneof=less medium sweet"`
	Ice       *string   `json:"ice" validate:"omitempty,oneof=none less normal"`
}

// Priced là món đã lọc theo quán (món ẩn không có trong map).
type Priced struct {
	ID        uuid.UUID
	Name      string
	Price     int64
	HasSweet  bool
	HasIce    bool
	Available bool
}

// MergeLines kiểm món, gán tuỳ chọn mặc định, gộp dòng cùng (món, ngọt, đá) và tính tiền.
// Món không có (ẩn, không tồn tại) hoặc hết được gom hết vào một lỗi PRODUCT_UNAVAILABLE.
func MergeLines(lines []LineReq, products map[uuid.UUID]Priced) (OrderItems, int64, error) {
	var unavailable []string
	for _, l := range lines {
		p, ok := products[l.ProductID]
		if (!ok || !p.Available) && !slices.Contains(unavailable, l.ProductID.String()) {
			unavailable = append(unavailable, l.ProductID.String())
		}
	}
	if len(unavailable) > 0 {
		return nil, 0, apperr.Conflict("PRODUCT_UNAVAILABLE", "Có món vừa hết, vui lòng bỏ khỏi giỏ").
			With("product_ids", unavailable)
	}

	fields := map[string]string{}
	type key struct {
		id         uuid.UUID
		sweet, ice string
	}
	index := map[key]int{}
	var items OrderItems
	for i, l := range lines {
		p := products[l.ProductID]
		sweet, err := option(p.HasSweet, l.Sweet, DefaultSweet)
		if err != nil {
			fields[fmt.Sprintf("items[%d].sweet", i)] = "Món này không có tuỳ chọn độ ngọt"
		}
		ice, err := option(p.HasIce, l.Ice, DefaultIce)
		if err != nil {
			fields[fmt.Sprintf("items[%d].ice", i)] = "Món này không có tuỳ chọn đá"
		}
		k := key{id: p.ID, sweet: deref(sweet), ice: deref(ice)}
		if at, ok := index[k]; ok {
			items[at].Qty += l.Qty
			if items[at].Qty > MaxQtyPerLine {
				fields[fmt.Sprintf("items[%d].qty", i)] = fmt.Sprintf("Tối đa %d ly mỗi món", MaxQtyPerLine)
			}
			continue
		}
		index[k] = len(items)
		items = append(items, OrderItem{ProductID: p.ID, Name: p.Name, UnitPrice: p.Price, Qty: l.Qty, Sweet: sweet, Ice: ice})
	}
	if len(fields) > 0 {
		return nil, 0, apperr.Validation(fields)
	}
	var total int64
	for i := range items {
		items[i].LineTotal = items[i].UnitPrice * int64(items[i].Qty)
		total += items[i].LineTotal
	}
	return items, total, nil
}

func option(supported bool, v *string, def string) (*string, error) {
	if !supported {
		if v != nil {
			return nil, fmt.Errorf("unsupported")
		}
		return nil, nil
	}
	if v == nil {
		return &def, nil
	}
	return v, nil
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

var sweetLabels = map[string]string{"less": "ít ngọt", "medium": "", "sweet": "ngọt"}
var iceLabels = map[string]string{"none": "không đá", "less": "ít đá", "normal": ""}

// Summary là một dòng ngắn cho tin Zalo: "2 Trà đá (ít ngọt, không đá), 1 Cà phê sữa".
func (it OrderItems) Summary() string {
	parts := make([]string, 0, len(it))
	for _, item := range it {
		var opts []string
		if l := sweetLabels[deref(item.Sweet)]; l != "" {
			opts = append(opts, l)
		}
		if l := iceLabels[deref(item.Ice)]; l != "" {
			opts = append(opts, l)
		}
		s := fmt.Sprintf("%d %s", item.Qty, item.Name)
		if len(opts) > 0 {
			s += " (" + strings.Join(opts, ", ") + ")"
		}
		parts = append(parts, s)
	}
	return strings.Join(parts, ", ")
}
