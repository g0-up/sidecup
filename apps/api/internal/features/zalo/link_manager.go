package zalo

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"github.com/google/uuid"

	"sidecup/api/internal/features/zalo/protocol"
)

// LinkState là giai đoạn của một lần quét QR, đúng như người bán đang chờ nhìn thấy.
type LinkState string

const (
	LinkStatePending   LinkState = "pending"   // đã bắt đầu, Zalo chưa trả ảnh QR
	LinkStateQRReady   LinkState = "qr_ready"  // có ảnh QR để hiển thị
	LinkStateScanned   LinkState = "scanned"   // app Zalo đã quét, chờ xác nhận trên điện thoại
	LinkStateConfirmed LinkState = "confirmed" // đã xác nhận, đang hoàn tất phiên
	LinkStateLinked    LinkState = "linked"    // credentials đã lưu, phiên đã cache
	LinkStateExpired   LinkState = "expired"   // hết giờ hoặc bị huỷ; chỉ cần bắt đầu lại
	LinkStateError     LinkState = "error"     // thất bại vì lý do thử lại chưa chắc hết
)

const (
	// QR của Zalo sống khoảng 100 giây; dư thêm để login kịp xong thay vì bị cắt giữa chừng.
	defaultAttemptTTL = 105 * time.Second
	// Giữ bản ghi đã xong thêm một lúc để lần poll đến muộn vẫn biết kết quả thay vì "không tìm thấy".
	defaultRetention = 2 * time.Minute
	// persistTimeout giới hạn phần việc sau khi quét thành công: login thử credentials rồi ghi DB.
	persistTimeout = 10 * time.Second
)

// linkFailureMessage là tất cả những gì client biết về lần thất bại. Lỗi gốc do Zalo viết, có thể trích
// lại request, và người bán cũng không làm gì được với nó — chỉ ghi log.
const linkFailureMessage = "Không hoàn tất được đăng nhập Zalo, vui lòng thử lại"

// LoginFunc là đăng nhập QR; production dùng protocol.LoginQR, test truyền bản giả.
type LoginFunc func(ctx context.Context, sess *protocol.Session, cb protocol.QRCallbacks) (*protocol.Credentials, error)

// onLinked lưu lần quét thành công. Chạy trên goroutine của attempt trước khi chuyển sang linked, nên trả
// lỗi là attempt thất bại chứ không báo một liên kết chưa từng được lưu. Chỉ chạy khi attempt còn là hiện
// hành, và cancel chờ nó xong — nên ngắt kết nối không thể chen vào giữa lúc ghi.
type onLinked func(ctx context.Context, consentVersion string, sess *protocol.Session, cred *protocol.Credentials) error

// LinkOptions chỉnh thời gian sống; giá trị rỗng là cấu hình production, test rút ngắn.
type LinkOptions struct {
	AttemptTTL time.Duration
	Retention  time.Duration
}

// LinkSnapshot là góc nhìn không chứa bí mật của một attempt. Ảnh QR là thử thách đăng nhập, không phải bí mật.
type LinkSnapshot struct {
	LinkID      uuid.UUID
	State       LinkState
	QRPNG       []byte
	DisplayName string
	Failure     string
}

type linkRecord struct {
	id             uuid.UUID
	consentVersion string

	state       LinkState
	qrPNG       []byte
	displayName string
	failure     string

	cancel    context.CancelFunc
	expiresAt time.Time
	done      chan struct{}
}

func (r *linkRecord) snapshot() LinkSnapshot {
	snap := LinkSnapshot{LinkID: r.id, State: r.state, DisplayName: r.displayName, Failure: r.failure}
	if len(r.qrPNG) > 0 {
		snap.QRPNG = append([]byte(nil), r.qrPNG...)
	}
	return snap
}

// linkManager chạy đăng nhập QR nền và cho poll trạng thái. Chỉ một attempt hiện hành: bắt đầu cái mới thì
// huỷ cái cũ, nên số long-poll tới Zalo luôn bị chặn. Bản ghi chỉ nằm trong bộ nhớ — restart làm mất
// attempt dở dang, đúng vì goroutine chạy nó cũng mất; người bán chỉ cần quét lại.
type linkManager struct {
	mu     sync.Mutex
	active *linkRecord
	// live gồm mọi attempt có goroutine còn chạy, kể cả cái active không còn trỏ tới. Bị thay thế không
	// làm goroutine dừng ngay, và chỉ goroutine đã thực sự return mới chắc chắn không ghi nữa.
	live map[*linkRecord]struct{}

	login     LoginFunc
	onLinked  onLinked
	log       *slog.Logger
	ttl       time.Duration
	retention time.Duration

	// baseCtx là vòng đời của manager, không của request nào: close huỷ được tất cả khi tắt máy.
	baseCtx    context.Context
	baseCancel context.CancelFunc
}

func newLinkManager(login LoginFunc, linked onLinked, log *slog.Logger, opts LinkOptions) *linkManager {
	if log == nil {
		log = slog.Default()
	}
	if opts.AttemptTTL <= 0 {
		opts.AttemptTTL = defaultAttemptTTL
	}
	if opts.Retention <= 0 {
		opts.Retention = defaultRetention
	}
	ctx, cancel := context.WithCancel(context.Background())
	return &linkManager{
		live:       make(map[*linkRecord]struct{}),
		login:      login,
		onLinked:   linked,
		log:        log,
		ttl:        opts.AttemptTTL,
		retention:  opts.Retention,
		baseCtx:    ctx,
		baseCancel: cancel,
	}
}

// begin bắt đầu attempt và trả link id ngay; đăng nhập chạy nền. Attempt cũ bị huỷ và id của nó hết hiệu lực.
func (m *linkManager) begin(consentVersion string) uuid.UUID {
	ctx, cancel := context.WithTimeout(m.baseCtx, m.ttl)
	rec := &linkRecord{
		id:             uuid.New(),
		consentVersion: consentVersion,
		state:          LinkStatePending,
		cancel:         cancel,
		expiresAt:      time.Now().Add(m.ttl),
		done:           make(chan struct{}),
	}

	m.mu.Lock()
	m.sweepLocked(time.Now())
	if m.active != nil {
		m.active.cancel()
	}
	m.active = rec
	m.live[rec] = struct{}{}
	m.mu.Unlock()

	go m.run(ctx, rec)
	return rec.id
}

func (m *linkManager) status(linkID uuid.UUID) (LinkSnapshot, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.sweepLocked(time.Now())
	if m.active == nil || m.active.id != linkID {
		return LinkSnapshot{}, ErrLinkNotFound
	}
	return m.active.snapshot(), nil
}

// cancel dừng mọi attempt đang chạy — cả cái hiện hành lẫn cái bị thay thế do mở lại modal — và chỉ return
// khi tất cả đã dừng. Ngắt kết nối gọi nó để một mã QR còn mở ở tab khác không liên kết lại sau lưng người bán.
//
// Lần quét đã thành công được lưu trên context sống sót qua huỷ (để DB chậm không làm mất liên kết người bán
// vừa hoàn tất), nên return trước khi goroutine đó xong sẽ để lần ghi rơi xuống sau khi caller đã xoá tài khoản.
// Thời gian chờ bị chặn bởi hạn của từng attempt và persistTimeout.
func (m *linkManager) cancel() {
	m.mu.Lock()
	m.active = nil
	pending := m.liveLocked()
	m.mu.Unlock()

	for _, rec := range pending {
		rec.cancel()
		<-rec.done
	}
}

// cancelAttempt dừng attempt linkID khi nó còn là hiện hành và chờ goroutine của nó return: lúc trả về, lần quét
// vừa kịp thành công (nếu có) đã lưu xong, nên trạng thái tài khoản đọc sau đó là cuối cùng. id cũ hay lạ thì
// không làm gì — huỷ là idempotent và không được dừng attempt mà tab khác vừa mở.
func (m *linkManager) cancelAttempt(linkID uuid.UUID) {
	m.mu.Lock()
	rec := m.active
	if rec == nil || rec.id != linkID {
		m.mu.Unlock()
		return
	}
	m.active = nil
	m.mu.Unlock()

	rec.cancel()
	<-rec.done
}

// close huỷ mọi attempt và chờ goroutine của chúng return; gọi nhiều lần vẫn an toàn.
func (m *linkManager) close() {
	m.baseCancel()
	m.cancel()
}

func (m *linkManager) liveLocked() []*linkRecord {
	out := make([]*linkRecord, 0, len(m.live))
	for rec := range m.live {
		out = append(out, rec)
	}
	return out
}

func (m *linkManager) run(ctx context.Context, rec *linkRecord) {
	// Báo goroutine đã xong là việc cuối cùng, nên ai thấy nó trong live và chờ done đều biết nó hết ghi.
	defer m.retire(rec)
	defer rec.cancel()

	sess := protocol.NewSession()
	cb := protocol.QRCallbacks{
		OnQR: func(png []byte) {
			m.update(rec, func(r *linkRecord) {
				r.state = LinkStateQRReady
				r.qrPNG = png
			})
		},
		OnProgress: func(state protocol.QRState) {
			m.update(rec, func(r *linkRecord) {
				switch state {
				case protocol.QRStateScanned:
					r.state = LinkStateScanned
				case protocol.QRStateConfirmed:
					r.state = LinkStateConfirmed
				}
			})
		},
	}

	cred, err := m.login(ctx, sess, cb)
	if err != nil {
		m.fail(rec, ctx.Err() != nil, "zalo: đăng nhập QR thất bại", err)
		return
	}

	// Lần quét của attempt đã bị thay thế/huỷ thì không lưu: người bán có thể vừa ngắt kết nối, và ghi lúc
	// này sẽ đưa tài khoản trở lại với credentials dùng được trong khi mọi màn hình báo đã ngắt.
	if !m.isCurrent(rec) {
		return
	}

	// Hạn của attempt là thời gian cho phép quét; nó không được cắt ngang việc ghi làm lần quét có hiệu lực.
	persistCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), persistTimeout)
	defer cancel()
	if err := m.onLinked(persistCtx, rec.consentVersion, sess, cred); err != nil {
		m.fail(rec, false, "zalo: lưu liên kết thất bại", err)
		return
	}

	m.update(rec, func(r *linkRecord) {
		r.state = LinkStateLinked
		r.displayName = sess.DisplayName
		r.qrPNG = nil // mã đã dùng, không phục vụ tiếp
	})
}

func (m *linkManager) fail(rec *linkRecord, timedOut bool, msg string, err error) {
	if timedOut {
		m.update(rec, func(r *linkRecord) {
			r.state = LinkStateExpired
			r.qrPNG = nil
		})
		return
	}
	m.log.Warn(msg, "err", SafeError(err))
	m.update(rec, func(r *linkRecord) {
		r.state = LinkStateError
		r.failure = linkFailureMessage
		r.qrPNG = nil
	})
}

func (m *linkManager) isCurrent(rec *linkRecord) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.active == rec
}

func (m *linkManager) retire(rec *linkRecord) {
	m.mu.Lock()
	delete(m.live, rec)
	m.mu.Unlock()
	close(rec.done)
}

// update chỉ áp thay đổi khi bản ghi còn là attempt hiện hành, nên attempt bị thay thế chưa kịp nhận ra
// không thể ghi đè lên cái mới.
func (m *linkManager) update(rec *linkRecord, mutate func(*linkRecord)) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.active != rec {
		return
	}
	mutate(rec)
}

// sweepLocked bỏ bản ghi đã hết ích; làm mỗi lần đọc/bắt đầu nên không cần goroutine dọn riêng.
func (m *linkManager) sweepLocked(now time.Time) {
	if m.active != nil && now.After(m.active.expiresAt.Add(m.retention)) {
		m.active.cancel()
		m.active = nil
	}
}
