package zalo

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"sidecup/api/internal/features/zalo/protocol"
	"sidecup/api/internal/platform/secrets"
)

// ExpiredMessage là câu banner đỏ cho người bán khi phiên Zalo chết.
const ExpiredMessage = "Phiên Zalo đã hết hạn — khách không nhận được tin trạng thái đơn. Vào Cài đặt để quét lại mã QR."

// ReloginFunc khôi phục phiên từ credentials đã lưu; production dùng protocol.LoginWithCredentials.
type ReloginFunc func(ctx context.Context, sess *protocol.Session, cred protocol.Credentials) error

// SendFunc gửi tin nhắn văn bản và trả message id; production dùng protocol.SendMessage.
type SendFunc func(ctx context.Context, sess *protocol.Session, toUID, text string) (string, error)

// FindUserFunc tra SĐT (dạng 84…) ra tài khoản Zalo; production dùng protocol.FindUser.
type FindUserFunc func(ctx context.Context, sess *protocol.Session, phones []string) (map[string]protocol.FoundUser, error)

// Options cung cấp những gì Service không tự dựng. Giá trị rỗng dùng protocol Zalo thật —
// đúng cho production và không test nào được dùng.
type Options struct {
	Login    LoginFunc
	Relogin  ReloginFunc
	Send     SendFunc
	FindUser FindUserFunc
	Logger   *slog.Logger
	Link     LinkOptions
	Now      func() time.Time
	// OnStatusChange chạy sau mỗi lần trạng thái liên kết đổi (hết hạn, liên kết, ngắt, hồi phục) để banner
	// cập nhật ngay. Có thể chạy trên goroutine mà ngắt kết nối đang chờ, nên phải nhanh và không chặn.
	OnStatusChange func(ctx context.Context)
}

// AccountStatus là mọi thứ API được nói về liên kết; cố ý không có field nào chứa được credentials.
type AccountStatus struct {
	Linked      bool
	Status      string // StatusLinked hoặc StatusExpired; rỗng khi chưa liên kết
	DisplayName string // chỉ biết khi liên kết bằng QR
	LinkedAt    time.Time
}

// Service là tính năng Zalo: liên kết bằng QR, báo/ngắt liên kết, giữ phiên sống và gửi tin theo SĐT.
type Service struct {
	repo           Repository
	cipher         *secrets.Cipher
	cache          sessionCache
	uids           *uidCache
	links          *linkManager
	relogin        ReloginFunc
	send           SendFunc
	findUser       FindUserFunc
	log            *slog.Logger
	onStatusChange func(ctx context.Context)

	// statusMu gom kiểm tra bộ đếm cache và lần ghi trạng thái liên kết thành một khối, để liên kết lại không
	// chen được vào giữa lúc một login cũ quyết định đánh dấu hết hạn hay hồi phục.
	statusMu sync.Mutex

	probeMu   sync.Mutex
	probeStop context.CancelFunc
	probeDone chan struct{}
}

// NewService dựng service kèm session cache và link manager riêng; gọi Close khi tắt máy.
func NewService(repo Repository, cipher *secrets.Cipher, opts Options) *Service {
	if opts.Logger == nil {
		opts.Logger = slog.Default()
	}
	if opts.Login == nil {
		opts.Login = protocol.LoginQR
	}
	if opts.Relogin == nil {
		opts.Relogin = protocol.LoginWithCredentials
	}
	if opts.Send == nil {
		opts.Send = protocol.SendMessage
	}
	if opts.FindUser == nil {
		opts.FindUser = protocol.FindUser
	}
	if opts.Now == nil {
		opts.Now = time.Now
	}
	if opts.OnStatusChange == nil {
		opts.OnStatusChange = func(context.Context) {}
	}
	svc := &Service{
		repo:           repo,
		cipher:         cipher,
		uids:           newUIDCache(opts.Now),
		relogin:        opts.Relogin,
		send:           opts.Send,
		findUser:       opts.FindUser,
		log:            opts.Logger,
		onStatusChange: opts.OnStatusChange,
	}
	svc.links = newLinkManager(opts.Login, svc.persistLink, opts.Logger, opts.Link)
	return svc
}

// StartHealthProbe kiểm tra phiên định kỳ đến khi ctx bị huỷ hoặc Close; gọi lần hai không làm gì.
func (s *Service) StartHealthProbe(ctx context.Context, opts ProbeOptions) {
	s.probeMu.Lock()
	defer s.probeMu.Unlock()
	if s.probeDone != nil {
		return
	}
	probeCtx, cancel := context.WithCancel(ctx)
	done := make(chan struct{})
	s.probeStop, s.probeDone = cancel, done
	go func() {
		defer close(done)
		runProbe(probeCtx, opts, s.probeOnce)
	}()
}

// Close dừng mọi thứ service đã khởi động — health probe và attempt QR dở dang — và chờ chúng xong.
func (s *Service) Close() {
	s.probeMu.Lock()
	stop, done := s.probeStop, s.probeDone
	s.probeStop, s.probeDone = nil, nil
	s.probeMu.Unlock()
	if stop != nil {
		stop()
		<-done
	}
	s.links.close()
}

// StartLink bắt đầu quét QR và trả link id ngay; theo dõi bằng LinkStatus. consentVersion là bản điều khoản
// người bán đã đồng ý và được lưu cùng tài khoản, nên thiếu thì từ chối trước khi lấy credentials.
func (s *Service) StartLink(consentVersion string) (uuid.UUID, error) {
	if strings.TrimSpace(consentVersion) == "" {
		return uuid.Nil, ErrConsentRequired
	}
	return s.links.begin(consentVersion), nil
}

// CancelLink dừng lần quét QR người bán vừa huỷ, để điện thoại xác nhận muộn không liên kết sau lưng họ. Chờ tới
// khi attempt dừng hẳn: lần quét đã kịp hoàn tất thì vẫn được lưu, và Status đọc sau đó cho biết sự thật.
func (s *Service) CancelLink(linkID uuid.UUID) {
	s.links.cancelAttempt(linkID)
}

func (s *Service) LinkStatus(linkID uuid.UUID) (LinkSnapshot, error) {
	return s.links.status(linkID)
}

// Status chỉ đọc DB, không gọi Zalo, nên trang Cài đặt luôn nhanh kể cả khi Zalo không truy cập được.
func (s *Service) Status(ctx context.Context) (AccountStatus, error) {
	acc, err := s.repo.Get(ctx)
	if errors.Is(err, errAccountNotFound) {
		return AccountStatus{}, nil
	}
	if err != nil {
		return AccountStatus{}, err
	}
	st := AccountStatus{Linked: true, Status: acc.Status, LinkedAt: acc.LinkedAt}
	if acc.DisplayName != nil {
		st.DisplayName = *acc.DisplayName
	}
	return st, nil
}

// SessionHealthy cho heartbeat: chỉ đọc DB. Chưa liên kết vẫn là healthy (không có gì để báo động);
// chỉ hàng có status expired mới bật banner. Lỗi DB không bật banner — heartbeat tự hỏng theo DB rồi.
func (s *Service) SessionHealthy(ctx context.Context) (bool, string) {
	acc, err := s.repo.Get(ctx)
	if err != nil {
		if !errors.Is(err, errAccountNotFound) {
			s.log.Warn("zalo: không đọc được trạng thái liên kết", "err", err)
		}
		return true, ""
	}
	if acc.Status == StatusExpired {
		return false, ExpiredMessage
	}
	return true, ""
}

const unlinkTimeout = 10 * time.Second

// Unlink huỷ attempt đang chạy, bỏ phiên và xoá credentials. Idempotent: bấm hai lần hay retry sau khi mất
// response không thành lỗi người bán không xử lý được.
func (s *Service) Unlink(ctx context.Context) error {
	// cancel chờ lần lưu liên kết đang dở, mà lần lưu đó cần statusMu — nên huỷ trước khi khoá.
	s.links.cancel()

	// cancel có thể mất vài giây chờ một lần quét vừa thành công; người bán đóng tab trong lúc đó vẫn phải
	// được ngắt, nên việc xoá chạy trên context client không huỷ được.
	ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), unlinkTimeout)
	defer cancel()
	s.statusMu.Lock()
	s.cache.evict()
	s.uids.reset()
	err := s.repo.Delete(ctx)
	s.statusMu.Unlock()
	if err != nil && !errors.Is(err, errAccountNotFound) {
		return err
	}
	s.onStatusChange(ctx)
	return nil
}

// localPhone là dạng orders lưu (NormalizePhone): 10 chữ số, bắt đầu bằng 0.
var localPhone = regexp.MustCompile(`^0\d{9}$`)

// SendToPhone gửi tin cho SĐT (dạng 0xxxxxxxxx) bằng tài khoản đã liên kết, kể cả người chưa kết bạn.
// Lỗi: ErrNotLinked / ErrLinkExpired khi không có phiên dùng được; ErrRecipientNotFound khi SĐT không có
// Zalo (vĩnh viễn); lỗi khác là tạm thời. Không bao giờ log SĐT hay uid.
func (s *Service) SendToPhone(ctx context.Context, phone, text string) (string, error) {
	if !localPhone.MatchString(phone) {
		return "", ErrRecipientNotFound
	}
	// Zalo chỉ resolve dạng có mã nước; số 0… nhận câu trả lời rỗng.
	wire := "84" + phone[1:]

	since := s.cache.evictionCount()
	sess, err := s.sessionFor(ctx)
	if err != nil {
		return "", err
	}
	start := time.Now()
	uid, err := s.resolveUID(ctx, sess, wire, since)
	if err != nil {
		return "", err
	}
	msgID, err := s.send(ctx, sess, uid, text)
	if err != nil {
		return "", s.expireIfLoggedOut(ctx, since, "send", err)
	}
	s.log.Info("zalo: đã gửi tin", "duration", time.Since(start))
	return msgID, nil
}

func (s *Service) resolveUID(ctx context.Context, sess *protocol.Session, wire string, since uint64) (string, error) {
	if uid, ok := s.uids.get(wire); ok {
		if uid == "" {
			return "", ErrRecipientNotFound
		}
		return uid, nil
	}
	gen := s.uids.generation()
	found, err := s.findUser(ctx, sess, []string{wire})
	if err != nil {
		return "", s.expireIfLoggedOut(ctx, since, "lookup", err)
	}
	uid := found[wire].UID
	s.uids.put(wire, uid, gen)
	if uid == "" {
		return "", ErrRecipientNotFound
	}
	return uid, nil
}

// expireIfLoggedOut đổi mã "chưa đăng nhập" của Zalo thành ErrLinkExpired và ghi nhận hết hạn; lỗi khác
// đi qua nguyên vẹn. Chỉ lời gọi trên phiên đã cache mới gặp mã này — login mới thì đã hỏng trong restore.
// since là bộ đếm cache trước khi lấy phiên: liên kết lại giữa chừng thì phiên bị từ chối là của tài khoản cũ.
func (s *Service) expireIfLoggedOut(ctx context.Context, since uint64, op string, err error) error {
	var apiErr *protocol.APIError
	if errors.As(err, &apiErr) && apiErr.Code == protocol.ErrCodeNotLoggedIn {
		s.log.Warn("zalo: " + op + " bị từ chối vì phiên đã đăng xuất")
		s.expire(ctx, since)
		return ErrLinkExpired
	}
	return err
}

// VerifyAccount kiểm tra credentials còn được Zalo nhận không và ghi nhận kết quả. Bỏ qua cache có chủ đích:
// phiên trong cache chỉ chứng minh login từng chạy, còn mục đích là biết bây giờ còn chạy không. Phiên cũ vẫn
// phục vụ việc gửi trong lúc kiểm tra và chỉ bị thay khi login mới thành công — hoặc bỏ khi Zalo từ chối thật.
func (s *Service) VerifyAccount(ctx context.Context) error {
	_, err := s.restore(ctx)
	return err
}

// probeOnce kiểm tra cả tài khoản đang expired: login lại được nghĩa là lần hỏng trước do mạng, không do
// credentials, và recordHealthy hồi phục nó — người bán khỏi phải quét lại vì một lần rớt mạng.
func (s *Service) probeOnce(ctx context.Context) {
	if _, err := s.repo.Get(ctx); err != nil {
		if !errors.Is(err, errAccountNotFound) {
			s.log.Error("zalo: không đọc được tài khoản để kiểm tra", "err", err)
		}
		return
	}
	if err := s.VerifyAccount(ctx); err != nil {
		s.log.Warn("zalo: phiên không qua kiểm tra định kỳ", "err", SafeError(err))
	}
}

// sessionFor trả phiên sống, khôi phục từ credentials khi cache trống.
func (s *Service) sessionFor(ctx context.Context) (*protocol.Session, error) {
	if sess, ok := s.cache.get(); ok {
		return sess, nil
	}
	return s.restore(ctx)
}

// restore login lại từ credentials đã lưu và đặt phiên vào cache. Zalo từ chối thật thì credentials đã chết:
// tài khoản bị đánh dấu expired và caller nhận ErrLinkExpired. Không với tới được Zalo thì không nói gì về
// credentials — trả lỗi tạm thời, trạng thái giữ nguyên.
func (s *Service) restore(ctx context.Context) (*protocol.Session, error) {
	// Phần dưới có thể mất vài giây và ngắt kết nối hay liên kết lại có thể chen vào; ghi lại vị trí bộ đếm
	// để bỏ kết quả nếu vậy.
	since := s.cache.evictionCount()

	acc, err := s.repo.Get(ctx)
	if errors.Is(err, errAccountNotFound) {
		return nil, ErrNotLinked
	}
	if err != nil {
		return nil, err
	}

	cred, err := s.openCredentials(acc)
	if err != nil {
		// Không mở được nghĩa là key đã đổi; blob không cứu được, với người bán đó là liên kết phải làm lại.
		s.log.Error("zalo: không mở được credentials đã lưu", "err", err)
		s.expire(ctx, since)
		return nil, ErrLinkExpired
	}

	sess := protocol.NewSession()
	if err := s.relogin(ctx, sess, *cred); err != nil {
		if isTransient(ctx, err) {
			return nil, fmt.Errorf("zalo: tạm thời không login lại được: %w", err)
		}
		s.log.Warn("zalo: phiên đã lưu bị từ chối", "err", SafeError(err))
		s.expire(ctx, since)
		return nil, ErrLinkExpired
	}

	s.statusMu.Lock()
	defer s.statusMu.Unlock()
	if !s.cache.putUnlessEvicted(sess, since) {
		// Đã ngắt kết nối, liên kết lại hoặc bị đánh dấu hết hạn trong lúc login. Phiên là thật và Zalo vẫn
		// nhận, chính vì vậy không được giữ hay trả ra.
		return nil, ErrNotLinked
	}
	s.recordHealthyLocked(ctx, acc)
	return sess, nil
}

// isTransient: lỗi không nói gì về credentials — Zalo không trả lời được, hết giờ, hoặc đang tắt máy. Chỉ lời
// từ chối thật mới được đánh dấu hết hạn; mạng chập chờn mà bật banner đỏ là báo sai cho người bán.
func isTransient(ctx context.Context, err error) bool {
	if ctx.Err() != nil {
		return true
	}
	var netErr net.Error
	return errors.Is(err, protocol.ErrTransport) ||
		errors.Is(err, context.DeadlineExceeded) ||
		errors.Is(err, context.Canceled) ||
		errors.Is(err, io.ErrUnexpectedEOF) ||
		errors.As(err, &netErr)
}

// recordHealthyLocked ghi lần kiểm tra thành công và hồi phục tài khoản đã bị đánh dấu expired. Gọi khi đang
// giữ statusMu, ngay sau khi phiên vào cache.
func (s *Service) recordHealthyLocked(ctx context.Context, acc *Account) {
	if err := s.repo.MarkVerified(ctx); err != nil {
		s.log.Warn("zalo: không ghi được lần kiểm tra thành công", "err", err)
	}
	if acc.Status == StatusLinked {
		return
	}
	if err := s.repo.UpdateStatus(ctx, StatusLinked); err != nil {
		s.log.Warn("zalo: không khôi phục được trạng thái linked", "err", err)
		return
	}
	s.onStatusChange(ctx)
}

// expire bỏ phiên và đánh dấu tài khoản để banner báo đúng sự thật mà không cần ai thử gửi trước. Bỏ qua khi
// bộ đếm cache đã khác since: tài khoản bị từ chối không còn là tài khoản đang liên kết.
func (s *Service) expire(ctx context.Context, since uint64) {
	s.statusMu.Lock()
	defer s.statusMu.Unlock()
	if !s.cache.evictIfUnchanged(since) {
		return
	}
	if err := s.repo.UpdateStatus(ctx, StatusExpired); err != nil {
		if !errors.Is(err, errAccountNotFound) {
			s.log.Error("zalo: không đánh dấu được tài khoản hết hạn", "err", err)
		}
		return
	}
	s.onStatusChange(ctx)
}

// openCredentials giải mã tài khoản đã lưu. Không lỗi nào mang theo bản rõ: lỗi json trích lại input,
// ở đây chính là cookie của người bán.
func (s *Service) openCredentials(acc *Account) (*protocol.Credentials, error) {
	plain, err := s.cipher.Open(acc.EncryptedCredentials)
	if err != nil {
		return nil, err
	}
	var cred protocol.Credentials
	if json.Unmarshal(plain, &cred) != nil {
		return nil, errors.New("zalo: credentials đã lưu không phải JSON hợp lệ")
	}
	return &cred, nil
}

// persistLink niêm phong phiên vừa có và lưu lại; là hook onLinked của link manager.
func (s *Service) persistLink(ctx context.Context, consentVersion string, sess *protocol.Session, cred *protocol.Credentials) error {
	raw, err := json.Marshal(cred)
	if err != nil {
		return errors.New("zalo: không tuần tự hoá được credentials")
	}
	enc, err := s.cipher.Seal(raw)
	if err != nil {
		return err
	}

	// Phiên sau bắt tay QR chưa từng lấy service map (chỉ login bằng cookie mới lấy) nên không gửi tin được.
	// Login lại từ credentials: vừa chứng minh blob sắp lưu dùng được, vừa có phiên đáng cache.
	live := protocol.NewSession()
	if err := s.relogin(ctx, live, *cred); err != nil {
		return fmt.Errorf("zalo: credentials vừa liên kết bị từ chối ở lần login đầu: %w", err)
	}
	live.DisplayName = sess.DisplayName

	now := time.Now()
	acc := &Account{
		ID:                   accountID,
		EncryptedCredentials: enc,
		Status:               StatusLinked,
		ConsentVersion:       consentVersion,
		ConsentAt:            now,
		LinkedAt:             now,
		LastVerifiedAt:       &now,
	}
	uid := live.UID
	if uid == "" {
		uid = sess.UID
	}
	if uid != "" {
		acc.ZaloUID = &uid
	}
	if sess.DisplayName != "" {
		name := sess.DisplayName
		acc.DisplayName = &name
	}
	s.statusMu.Lock()
	if err := s.repo.Upsert(ctx, acc); err != nil {
		s.statusMu.Unlock()
		return err
	}
	s.cache.replace(live)
	// Tài khoản gửi có thể khác tài khoản trước, uid tra được trước đó không còn đáng tin.
	s.uids.reset()
	s.statusMu.Unlock()
	s.onStatusChange(ctx)
	return nil
}

// SafeError là chuỗi lỗi an toàn để log hoặc lưu: *url.Error in cả URL, mà query chứa params đã mã hoá
// của request — chỉ giữ thao tác và lỗi bên trong.
func SafeError(err error) string {
	if err == nil {
		return ""
	}
	msg := err.Error()
	var uerr *url.Error
	if errors.As(err, &uerr) {
		msg = strings.Replace(msg, uerr.Error(), uerr.Op+" [url]: "+SafeError(uerr.Err), 1)
	}
	return msg
}
