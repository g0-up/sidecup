package zalo

import (
	"context"
	"crypto/rand"
	"math/big"
	"time"
)

// Mỗi lần kiểm tra là một lần login thật với Zalo; login dày đặc là thứ khiến tài khoản trông như bot,
// nên chu kỳ cố ý dài.
const defaultProbeInterval = 15 * time.Minute

// ProbeOptions chỉnh chu kỳ kiểm tra; giá trị rỗng là cấu hình production.
type ProbeOptions struct {
	Interval time.Duration
	// Jitter là độ trễ thêm tối đa mỗi chu kỳ; mặc định một phần ba Interval để không thành nhịp cố định.
	Jitter time.Duration
}

func (o ProbeOptions) withDefaults() ProbeOptions {
	if o.Interval <= 0 {
		o.Interval = defaultProbeInterval
	}
	if o.Jitter <= 0 {
		o.Jitter = o.Interval / 3
	}
	return o
}

// runProbe gọi check theo chu kỳ đến khi ctx bị huỷ. Kết quả do check tự ghi nhận (đánh dấu hết hạn,
// bỏ phiên), ở đây chỉ việc lặp.
func runProbe(ctx context.Context, opts ProbeOptions, check func(ctx context.Context)) {
	opts = opts.withDefaults()
	for {
		timer := time.NewTimer(probeWait(opts))
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-timer.C:
			check(ctx)
		}
	}
}

// probeWait dùng crypto/rand để khỏi phải bàn chuyện "random không an toàn"; vài lần mỗi giờ nên chi phí không đáng kể.
func probeWait(opts ProbeOptions) time.Duration {
	n, err := rand.Int(rand.Reader, big.NewInt(int64(opts.Jitter)))
	if err != nil {
		return opts.Interval
	}
	return opts.Interval + time.Duration(n.Int64())
}
