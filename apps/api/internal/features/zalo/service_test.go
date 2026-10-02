package zalo

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"sidecup/api/internal/features/zalo/protocol"
	"sidecup/api/internal/platform/secrets"
)

// Key test không bảo vệ gì thật.
var testCredKey = []byte("unit-test-zalo-credential-key-32b")

type fakeRepo struct {
	mu       sync.Mutex
	acc      *Account
	upserts  int
	statuses []string
	verified int
}

func (f *fakeRepo) Get(context.Context) (*Account, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.acc == nil {
		return nil, errAccountNotFound
	}
	cp := *f.acc
	return &cp, nil
}

func (f *fakeRepo) Upsert(_ context.Context, acc *Account) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.upserts++
	cp := *acc
	f.acc = &cp
	return nil
}

func (f *fakeRepo) Delete(context.Context) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.acc == nil {
		return errAccountNotFound
	}
	f.acc = nil
	return nil
}

func (f *fakeRepo) UpdateStatus(_ context.Context, status string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.acc == nil {
		return errAccountNotFound
	}
	f.acc.Status = status
	f.statuses = append(f.statuses, status)
	return nil
}

func (f *fakeRepo) MarkVerified(context.Context) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.acc == nil {
		return errAccountNotFound
	}
	now := time.Now()
	f.acc.LastVerifiedAt = &now
	f.verified++
	return nil
}

func (f *fakeRepo) stored(t *testing.T) Account {
	t.Helper()
	f.mu.Lock()
	defer f.mu.Unlock()
	require.NotNil(t, f.acc, "chưa có tài khoản được lưu")
	return *f.acc
}

func (f *fakeRepo) hasAccount() bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.acc != nil
}

func testCipher(t *testing.T) *secrets.Cipher {
	t.Helper()
	c, err := secrets.New(testCredKey)
	require.NoError(t, err)
	return c
}

func sealCredentials(t *testing.T, c *secrets.Cipher, cred protocol.Credentials) []byte {
	t.Helper()
	raw, err := json.Marshal(cred)
	require.NoError(t, err)
	out, err := c.Seal(raw)
	require.NoError(t, err)
	return out
}

// linkedRepo là repo đã có tài khoản với credentials niêm phong bằng testCredKey.
func linkedRepo(t *testing.T, status string) *fakeRepo {
	t.Helper()
	return &fakeRepo{acc: &Account{
		ID:                   accountID,
		EncryptedCredentials: sealCredentials(t, testCipher(t), protocol.Credentials{IMEI: "imei", UserAgent: "ua"}),
		Status:               status,
		ConsentVersion:       testConsentVersion,
		LinkedAt:             time.Date(2026, 10, 1, 9, 0, 0, 0, time.UTC),
	}}
}

type reloginSpy struct {
	calls atomic.Int32
	err   error
}

func (r *reloginSpy) relogin(_ context.Context, sess *protocol.Session, _ protocol.Credentials) error {
	r.calls.Add(1)
	if r.err != nil {
		return r.err
	}
	sess.UID = "zalo-uid"
	// Login bằng cookie luôn có service map, bắt tay QR thì không — spy giữ đúng đảm bảo đó.
	sess.LoginInfo = &protocol.LoginInfo{ZpwServiceMapV3: protocol.ZpwServiceMapV3{Chat: []string{"https://chat.example"}}}
	return nil
}

type statusChanges struct{ n atomic.Int32 }

func (s *statusChanges) hook(context.Context) { s.n.Add(1) }

func newTestService(t *testing.T, repo Repository, opts Options) *Service {
	t.Helper()
	svc := NewService(repo, testCipher(t), opts)
	t.Cleanup(svc.Close)
	return svc
}

func TestSessionForServesTheCachedSessionWithoutContactingZalo(t *testing.T) {
	t.Parallel()
	spy := &reloginSpy{}
	svc := newTestService(t, linkedRepo(t, StatusLinked), Options{Relogin: spy.relogin})
	cached := protocol.NewSession()
	svc.cache.replace(cached)

	got, err := svc.sessionFor(context.Background())
	require.NoError(t, err)
	require.Same(t, cached, got)
	require.Zero(t, spy.calls.Load())
}

func TestSessionForRelogsInFromStoredCredentialsAndCachesTheResult(t *testing.T) {
	t.Parallel()
	repo := linkedRepo(t, StatusLinked)
	spy := &reloginSpy{}
	svc := newTestService(t, repo, Options{Relogin: spy.relogin})

	first, err := svc.sessionFor(context.Background())
	require.NoError(t, err)
	second, err := svc.sessionFor(context.Background())
	require.NoError(t, err)
	require.Same(t, first, second)
	require.EqualValues(t, 1, spy.calls.Load())
	require.Equal(t, 1, repo.verified)
}

func TestSessionForMarksTheAccountExpiredWhenZaloRejectsTheCredentials(t *testing.T) {
	t.Parallel()
	repo := linkedRepo(t, StatusLinked)
	changes := &statusChanges{}
	svc := newTestService(t, repo, Options{Relogin: (&reloginSpy{err: errors.New("rejected")}).relogin, OnStatusChange: changes.hook})

	_, err := svc.sessionFor(context.Background())
	require.ErrorIs(t, err, ErrLinkExpired)
	require.Equal(t, StatusExpired, repo.stored(t).Status)
	require.EqualValues(t, 1, changes.n.Load(), "banner phải được báo ngay")
	_, cached := svc.cache.get()
	require.False(t, cached)
}

func TestSessionForReportsNotLinked(t *testing.T) {
	t.Parallel()
	svc := newTestService(t, &fakeRepo{}, Options{Relogin: (&reloginSpy{}).relogin})
	_, err := svc.sessionFor(context.Background())
	require.ErrorIs(t, err, ErrNotLinked)
}

func TestSessionForTreatsUndecryptableCredentialsAsExpired(t *testing.T) {
	t.Parallel()
	repo := linkedRepo(t, StatusLinked)
	other, err := secrets.New([]byte("another-zalo-credential-key-of-32b"))
	require.NoError(t, err)
	spy := &reloginSpy{}
	svc := NewService(repo, other, Options{Relogin: spy.relogin})
	t.Cleanup(svc.Close)

	_, err = svc.sessionFor(context.Background())
	require.ErrorIs(t, err, ErrLinkExpired)
	require.Equal(t, StatusExpired, repo.stored(t).Status)
	require.Zero(t, spy.calls.Load(), "không mở được thì không có gì để login")
}

func TestSessionForRestoresLinkedStatusWhenAnExpiredAccountLogsInAgain(t *testing.T) {
	t.Parallel()
	repo := linkedRepo(t, StatusExpired)
	changes := &statusChanges{}
	svc := newTestService(t, repo, Options{Relogin: (&reloginSpy{}).relogin, OnStatusChange: changes.hook})

	_, err := svc.sessionFor(context.Background())
	require.NoError(t, err)
	require.Equal(t, StatusLinked, repo.stored(t).Status)
	require.EqualValues(t, 1, changes.n.Load())
}

func TestStatusReportsTheLinkWithoutTouchingZalo(t *testing.T) {
	t.Parallel()
	spy := &reloginSpy{}
	svc := newTestService(t, &fakeRepo{}, Options{Relogin: spy.relogin})
	st, err := svc.Status(context.Background())
	require.NoError(t, err)
	require.False(t, st.Linked)

	repo := linkedRepo(t, StatusExpired)
	name := "Quán Cô Ba"
	repo.acc.DisplayName = &name
	svc = newTestService(t, repo, Options{Relogin: spy.relogin})
	st, err = svc.Status(context.Background())
	require.NoError(t, err)
	require.Equal(t, AccountStatus{Linked: true, Status: StatusExpired, DisplayName: name, LinkedAt: repo.acc.LinkedAt}, st)
	require.Zero(t, spy.calls.Load())
}

func TestSessionHealthyIsFalseOnlyForAnExpiredAccount(t *testing.T) {
	t.Parallel()
	ok, msg := newTestService(t, &fakeRepo{}, Options{}).SessionHealthy(context.Background())
	require.True(t, ok, "chưa liên kết không phải sự cố")
	require.Empty(t, msg)

	ok, _ = newTestService(t, linkedRepo(t, StatusLinked), Options{}).SessionHealthy(context.Background())
	require.True(t, ok)

	ok, msg = newTestService(t, linkedRepo(t, StatusExpired), Options{}).SessionHealthy(context.Background())
	require.False(t, ok)
	require.Equal(t, ExpiredMessage, msg)
}

func TestUnlinkEvictsTheSessionAndRemovesTheRow(t *testing.T) {
	t.Parallel()
	repo := linkedRepo(t, StatusLinked)
	changes := &statusChanges{}
	svc := newTestService(t, repo, Options{Relogin: (&reloginSpy{}).relogin, OnStatusChange: changes.hook})
	svc.cache.replace(protocol.NewSession())
	svc.uids.put("84901234567", "uid-1", svc.uids.generation())

	require.NoError(t, svc.Unlink(context.Background()))
	require.False(t, repo.hasAccount())
	_, cached := svc.cache.get()
	require.False(t, cached)
	_, known := svc.uids.get("84901234567")
	require.False(t, known, "uid tra bằng tài khoản cũ không còn đáng tin")
	require.EqualValues(t, 1, changes.n.Load())

	require.NoError(t, svc.Unlink(context.Background()), "ngắt lần hai vẫn thành công")
}

func TestStartLinkRequiresAConsentVersion(t *testing.T) {
	t.Parallel()
	svc := newTestService(t, &fakeRepo{}, Options{})
	_, err := svc.StartLink("  ")
	require.ErrorIs(t, err, ErrConsentRequired)
}

func TestStartLinkSealsTheCredentialsItPersistsAndCachesTheSession(t *testing.T) {
	t.Parallel()
	cred := protocol.Credentials{IMEI: "fresh-imei-secret", UserAgent: "ua"}
	var qrSess *protocol.Session
	login := func(_ context.Context, sess *protocol.Session, cb protocol.QRCallbacks) (*protocol.Credentials, error) {
		cb.OnQR([]byte("png"))
		sess.UID = "qr-session-uid"
		sess.DisplayName = "Quán Cô Ba"
		qrSess = sess
		return &cred, nil
	}
	repo := &fakeRepo{}
	spy := &reloginSpy{}
	changes := &statusChanges{}
	svc := newTestService(t, repo, Options{Login: login, Relogin: spy.relogin, OnStatusChange: changes.hook})
	svc.uids.put("84901234567", "uid-cũ", svc.uids.generation())

	linkID, err := svc.StartLink(testConsentVersion)
	require.NoError(t, err)
	require.Eventually(t, func() bool {
		snap, err := svc.LinkStatus(linkID)
		return err == nil && snap.State == LinkStateLinked
	}, 2*time.Second, 5*time.Millisecond)

	acc := repo.stored(t)
	require.Equal(t, accountID, acc.ID)
	require.Equal(t, testConsentVersion, acc.ConsentVersion)
	require.Equal(t, StatusLinked, acc.Status)
	require.Equal(t, "Quán Cô Ba", *acc.DisplayName)
	require.Equal(t, "zalo-uid", *acc.ZaloUID, "uid từ login bằng credentials thắng uid của phiên QR")
	require.NotContains(t, string(acc.EncryptedCredentials), cred.IMEI, "credentials không bao giờ lưu bản rõ")

	plain, err := testCipher(t).Open(acc.EncryptedCredentials)
	require.NoError(t, err)
	var back protocol.Credentials
	require.NoError(t, json.Unmarshal(plain, &back))
	require.Equal(t, cred, back)

	cachedSess, cached := svc.cache.get()
	require.True(t, cached)
	require.NotSame(t, qrSess, cachedSess, "phiên QR không có service map nên không gửi tin được")
	require.NotEmpty(t, protocol.ServiceURL(cachedSess, "chat"))
	require.EqualValues(t, 1, spy.calls.Load())
	require.EqualValues(t, 1, changes.n.Load())
	_, known := svc.uids.get("84901234567")
	require.False(t, known, "liên kết mới xoá cache uid")
}

func TestStartLinkFailsWhenTheCredentialsCannotLogIn(t *testing.T) {
	t.Parallel()
	login := func(_ context.Context, _ *protocol.Session, cb protocol.QRCallbacks) (*protocol.Credentials, error) {
		cb.OnQR([]byte("png"))
		return &protocol.Credentials{IMEI: "imei", UserAgent: "ua"}, nil
	}
	repo := &fakeRepo{}
	svc := newTestService(t, repo, Options{Login: login, Relogin: (&reloginSpy{err: errors.New("no")}).relogin})

	linkID, err := svc.StartLink(testConsentVersion)
	require.NoError(t, err)
	require.Eventually(t, func() bool {
		snap, err := svc.LinkStatus(linkID)
		return err == nil && snap.State == LinkStateError
	}, 2*time.Second, 5*time.Millisecond)
	require.Zero(t, repo.upserts)
	_, cached := svc.cache.get()
	require.False(t, cached)
}

// Rút đồng ý phải là cuối cùng: lần quét dở ở tab khác có thể xong bất cứ lúc nào, và việc ghi sau khi quét
// cố ý bỏ qua huỷ. Ngắt kết nối vì vậy phải chờ việc ghi đó xong chứ không chạy đua với nó.
func TestUnlinkOutlastsAScanThatLandsWhileItRuns(t *testing.T) {
	t.Parallel()
	holding := make(chan struct{})
	release := make(chan struct{})
	login := func(_ context.Context, sess *protocol.Session, cb protocol.QRCallbacks) (*protocol.Credentials, error) {
		cb.OnQR([]byte("png"))
		close(holding)
		<-release
		sess.DisplayName = "Quán Cô Ba"
		return &protocol.Credentials{IMEI: "imei", UserAgent: "ua"}, nil
	}
	repo := linkedRepo(t, StatusLinked)
	svc := newTestService(t, repo, Options{Login: login, Relogin: (&reloginSpy{}).relogin})
	_, err := svc.StartLink(testConsentVersion)
	require.NoError(t, err)
	<-holding

	go func() {
		time.Sleep(50 * time.Millisecond)
		close(release)
	}()
	require.NoError(t, svc.Unlink(context.Background()))

	require.Never(t, repo.hasAccount, time.Second, 10*time.Millisecond, "lần quét không được khôi phục hàng vừa xoá")
	_, cached := svc.cache.get()
	require.False(t, cached)
}

func TestUnlinkOutlastsASupersededScanThatLandsWhileItRuns(t *testing.T) {
	t.Parallel()
	scanned := make(chan struct{})
	release := make(chan struct{})
	var attempts atomic.Int32
	login := func(ctx context.Context, sess *protocol.Session, cb protocol.QRCallbacks) (*protocol.Credentials, error) {
		if attempts.Add(1) > 1 {
			return blockingLogin(ctx, sess, cb)
		}
		cb.OnQR([]byte("png"))
		close(scanned)
		<-release
		return &protocol.Credentials{IMEI: "imei", UserAgent: "ua"}, nil
	}
	repo := linkedRepo(t, StatusLinked)
	svc := newTestService(t, repo, Options{Login: login, Relogin: (&reloginSpy{}).relogin})
	_, err := svc.StartLink(testConsentVersion)
	require.NoError(t, err)
	<-scanned
	_, err = svc.StartLink(testConsentVersion)
	require.NoError(t, err)

	go func() {
		time.Sleep(50 * time.Millisecond)
		close(release)
	}()
	require.NoError(t, svc.Unlink(context.Background()))

	require.Never(t, repo.hasAccount, time.Second, 10*time.Millisecond)
	_, cached := svc.cache.get()
	require.False(t, cached)
}

// Xoá hàng không thu hồi gì phía Zalo, nên một lần login bắt đầu trước khi ngắt có thể quay về với phiên
// còn dùng được — phiên đó không được giữ.
func TestUnlinkDuringReloginLeavesNoUsableSession(t *testing.T) {
	t.Parallel()
	entered := make(chan struct{})
	release := make(chan struct{})
	relogin := func(_ context.Context, sess *protocol.Session, _ protocol.Credentials) error {
		close(entered)
		<-release
		sess.UID = "zalo-uid"
		return nil
	}
	repo := linkedRepo(t, StatusLinked)
	svc := newTestService(t, repo, Options{Relogin: relogin})

	result := make(chan error, 1)
	go func() { result <- svc.VerifyAccount(context.Background()) }()
	<-entered
	require.NoError(t, svc.Unlink(context.Background()))
	close(release)

	require.ErrorIs(t, <-result, ErrNotLinked)
	require.False(t, repo.hasAccount())
	_, cached := svc.cache.get()
	require.False(t, cached)
}

func TestVerifyAccountIgnoresTheCacheAndLogsInAgain(t *testing.T) {
	t.Parallel()
	spy := &reloginSpy{}
	svc := newTestService(t, linkedRepo(t, StatusLinked), Options{Relogin: spy.relogin})
	stale := protocol.NewSession()
	svc.cache.replace(stale)

	require.NoError(t, svc.VerifyAccount(context.Background()))
	require.EqualValues(t, 1, spy.calls.Load())
	fresh, ok := svc.cache.get()
	require.True(t, ok)
	require.NotSame(t, stale, fresh)
}

// Health probe login lại mỗi 15–20 phút; một lần mạng chập chờn mà đánh dấu hết hạn thì banner đỏ báo sai
// và việc gửi dừng tới lần probe sau. Chỉ lời từ chối thật mới là hết hạn.
func TestReloginThatCannotReachZaloKeepsTheAccountAndTheWorkingSession(t *testing.T) {
	t.Parallel()
	failures := map[string]error{
		"transport": fmt.Errorf("zalo_personal: login: %w", fmt.Errorf("%w: GET https://wpa.chat.zalo.me: HTTP 502", protocol.ErrTransport)),
		"timeout":   fmt.Errorf("zalo_personal: server info: %w", context.DeadlineExceeded),
	}
	for name, failure := range failures {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			for _, status := range []string{StatusLinked, StatusExpired} {
				repo := linkedRepo(t, status)
				changes := &statusChanges{}
				svc := newTestService(t, repo, Options{Relogin: (&reloginSpy{err: failure}).relogin, OnStatusChange: changes.hook})
				working := protocol.NewSession()
				svc.cache.replace(working)

				err := svc.VerifyAccount(context.Background())
				require.Error(t, err)
				require.NotErrorIs(t, err, ErrLinkExpired)
				require.Equal(t, status, repo.stored(t).Status)
				require.Empty(t, repo.statuses)
				require.Zero(t, changes.n.Load(), "không đổi trạng thái thì không báo banner")
				got, ok := svc.cache.get()
				require.True(t, ok, "phiên đang chạy vẫn phục vụ việc gửi")
				require.Same(t, working, got)
			}
		})
	}
}

func TestReloginCancelledByShutdownDoesNotExpireTheAccount(t *testing.T) {
	t.Parallel()
	repo := linkedRepo(t, StatusLinked)
	svc := newTestService(t, repo, Options{Relogin: (&reloginSpy{err: errors.New("bất kỳ lỗi nào")}).relogin})
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, err := svc.sessionFor(ctx)
	require.Error(t, err)
	require.NotErrorIs(t, err, ErrLinkExpired)
	require.Equal(t, StatusLinked, repo.stored(t).Status)
}

// relinkRace chạy một lần login bằng credentials cũ bị giữ lại giữa chừng, liên kết lại tài khoản mới trong lúc
// đó, rồi thả login cũ với kết quả oldResult. Trả lỗi của login cũ.
func relinkRace(t *testing.T, repo *fakeRepo, oldResult error) (*Service, error) {
	t.Helper()
	entered := make(chan struct{})
	release := make(chan struct{})
	relogin := func(_ context.Context, sess *protocol.Session, cred protocol.Credentials) error {
		if cred.IMEI == "imei" {
			close(entered)
			<-release
			sess.UID = "old-uid"
			return oldResult
		}
		sess.UID = "new-uid"
		return nil
	}
	svc := newTestService(t, repo, Options{Relogin: relogin})

	result := make(chan error, 1)
	go func() {
		_, err := svc.sessionFor(context.Background())
		result <- err
	}()
	<-entered
	require.NoError(t, svc.persistLink(context.Background(), testConsentVersion, protocol.NewSession(),
		&protocol.Credentials{IMEI: "new-imei", UserAgent: "ua"}))
	close(release)
	return svc, <-result
}

func TestRelinkDuringReloginIsNotMarkedExpiredByTheOldCredentials(t *testing.T) {
	t.Parallel()
	repo := linkedRepo(t, StatusLinked)
	svc, err := relinkRace(t, repo, errors.New("rejected"))

	require.ErrorIs(t, err, ErrLinkExpired)
	require.Equal(t, StatusLinked, repo.stored(t).Status, "hàng mới vừa quét không được bị đánh dấu hết hạn")
	require.Empty(t, repo.statuses)
	got, ok := svc.cache.get()
	require.True(t, ok)
	require.Equal(t, "new-uid", got.UID)
}

func TestRelinkDuringReloginIsNotOverwrittenByTheOldSession(t *testing.T) {
	t.Parallel()
	repo := linkedRepo(t, StatusLinked)
	svc, err := relinkRace(t, repo, nil)

	require.ErrorIs(t, err, ErrNotLinked)
	got, ok := svc.cache.get()
	require.True(t, ok)
	require.Equal(t, "new-uid", got.UID, "tin phải đi từ tài khoản vừa liên kết")
}

func TestProbeOnceVerifiesEvenAnExpiredAccountAndSkipsWhenUnlinked(t *testing.T) {
	t.Parallel()
	spy := &reloginSpy{}
	newTestService(t, &fakeRepo{}, Options{Relogin: spy.relogin}).probeOnce(context.Background())
	require.Zero(t, spy.calls.Load())

	repo := linkedRepo(t, StatusExpired)
	newTestService(t, repo, Options{Relogin: spy.relogin}).probeOnce(context.Background())
	require.EqualValues(t, 1, spy.calls.Load())
	require.Equal(t, StatusLinked, repo.stored(t).Status, "login lại được thì lần hỏng trước là do mạng")
}

func TestStartHealthProbeSweepsAndCloseStopsIt(t *testing.T) {
	t.Parallel()
	spy := &reloginSpy{}
	svc := NewService(linkedRepo(t, StatusLinked), testCipher(t), Options{Relogin: spy.relogin})
	svc.StartHealthProbe(context.Background(), ProbeOptions{Interval: 5 * time.Millisecond, Jitter: time.Millisecond})
	svc.StartHealthProbe(context.Background(), ProbeOptions{Interval: time.Hour})

	require.Eventually(t, func() bool { return spy.calls.Load() >= 2 }, 2*time.Second, 5*time.Millisecond)
	svc.Close()
	after := spy.calls.Load()
	time.Sleep(30 * time.Millisecond)
	require.Equal(t, after, spy.calls.Load(), "Close phải dừng probe")
	svc.Close()
}

// sendHarness ghi lại mọi lần tra/gửi để test kiểm chứng SĐT đi ra đúng dạng.
type sendHarness struct {
	mu      sync.Mutex
	lookups [][]string
	sends   []string
	found   map[string]protocol.FoundUser
	findErr error
	sendErr error
}

func (h *sendHarness) findUser(_ context.Context, _ *protocol.Session, phones []string) (map[string]protocol.FoundUser, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.lookups = append(h.lookups, phones)
	if h.findErr != nil {
		return nil, h.findErr
	}
	out := map[string]protocol.FoundUser{}
	for _, p := range phones {
		if u, ok := h.found[p]; ok {
			out[p] = u
		}
	}
	return out, nil
}

func (h *sendHarness) send(_ context.Context, _ *protocol.Session, toUID, _ string) (string, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.sends = append(h.sends, toUID)
	if h.sendErr != nil {
		return "", h.sendErr
	}
	return "msg-1", nil
}

func newSendService(t *testing.T, repo *fakeRepo, h *sendHarness, changes *statusChanges) *Service {
	t.Helper()
	opts := Options{Relogin: (&reloginSpy{}).relogin, FindUser: h.findUser, Send: h.send}
	if changes != nil {
		opts.OnStatusChange = changes.hook
	}
	return newTestService(t, repo, opts)
}

func TestSendToPhoneResolvesTheCountryCodeFormAndSends(t *testing.T) {
	t.Parallel()
	h := &sendHarness{found: map[string]protocol.FoundUser{"84901234567": {UID: "uid-khach"}}}
	svc := newSendService(t, linkedRepo(t, StatusLinked), h, nil)

	msgID, err := svc.SendToPhone(context.Background(), "0901234567", "Đơn #A1: Đang pha")
	require.NoError(t, err)
	require.Equal(t, "msg-1", msgID)
	_, err = svc.SendToPhone(context.Background(), "0901234567", "Đơn #A1: Đang mang ra")
	require.NoError(t, err)

	require.Equal(t, [][]string{{"84901234567"}}, h.lookups, "lần hai dùng uid đã cache")
	require.Equal(t, []string{"uid-khach", "uid-khach"}, h.sends)
}

func TestSendToPhoneCachesARecipientThatHasNoZalo(t *testing.T) {
	t.Parallel()
	h := &sendHarness{}
	svc := newSendService(t, linkedRepo(t, StatusLinked), h, nil)

	_, err := svc.SendToPhone(context.Background(), "0901234567", "x")
	require.ErrorIs(t, err, ErrRecipientNotFound)
	_, err = svc.SendToPhone(context.Background(), "0901234567", "x")
	require.ErrorIs(t, err, ErrRecipientNotFound)
	require.Len(t, h.lookups, 1, "kết quả không tìm thấy được nhớ, không tra lại")
	require.Empty(t, h.sends)
}

func TestSendToPhoneRejectsAMalformedPhoneWithoutContactingZalo(t *testing.T) {
	t.Parallel()
	h := &sendHarness{}
	spy := &reloginSpy{}
	svc := newTestService(t, linkedRepo(t, StatusLinked), Options{Relogin: spy.relogin, FindUser: h.findUser, Send: h.send})

	_, err := svc.SendToPhone(context.Background(), "+84901234567", "x")
	require.ErrorIs(t, err, ErrRecipientNotFound)
	require.Zero(t, spy.calls.Load())
	require.Empty(t, h.lookups)
}

func TestSendToPhoneTreatsANotLoggedInSendAsExpired(t *testing.T) {
	t.Parallel()
	repo := linkedRepo(t, StatusLinked)
	changes := &statusChanges{}
	h := &sendHarness{
		found:   map[string]protocol.FoundUser{"84901234567": {UID: "uid-khach"}},
		sendErr: &protocol.APIError{Op: "send", Code: protocol.ErrCodeNotLoggedIn},
	}
	svc := newSendService(t, repo, h, changes)

	_, err := svc.SendToPhone(context.Background(), "0901234567", "x")
	require.ErrorIs(t, err, ErrLinkExpired)
	require.Equal(t, StatusExpired, repo.stored(t).Status)
	require.EqualValues(t, 1, changes.n.Load())
	_, cached := svc.cache.get()
	require.False(t, cached)
}

func TestSendToPhoneTreatsANotLoggedInLookupAsExpired(t *testing.T) {
	t.Parallel()
	repo := linkedRepo(t, StatusLinked)
	h := &sendHarness{findErr: &protocol.APIError{Op: "lookup", Code: protocol.ErrCodeNotLoggedIn}}
	svc := newSendService(t, repo, h, nil)

	_, err := svc.SendToPhone(context.Background(), "0901234567", "x")
	require.ErrorIs(t, err, ErrLinkExpired)
	require.Equal(t, StatusExpired, repo.stored(t).Status)
}

func TestSendToPhonePassesOtherFailuresThroughWithoutExpiring(t *testing.T) {
	t.Parallel()
	repo := linkedRepo(t, StatusLinked)
	refused := &protocol.APIError{Op: "send", Code: 114}
	h := &sendHarness{found: map[string]protocol.FoundUser{"84901234567": {UID: "uid-khach"}}, sendErr: refused}
	svc := newSendService(t, repo, h, nil)

	_, err := svc.SendToPhone(context.Background(), "0901234567", "x")
	require.ErrorIs(t, err, refused)
	require.Equal(t, StatusLinked, repo.stored(t).Status)
}

func TestSendToPhoneReportsNotLinked(t *testing.T) {
	t.Parallel()
	svc := newSendService(t, &fakeRepo{}, &sendHarness{}, nil)
	_, err := svc.SendToPhone(context.Background(), "0901234567", "x")
	require.ErrorIs(t, err, ErrNotLinked)
}

func TestSafeErrorDropsTheRequestURL(t *testing.T) {
	t.Parallel()
	inner := &url.Error{Op: "Get", URL: "https://tt-friend.example/api?params=SECRET-PARAMS", Err: errors.New("i/o timeout")}
	err := errors.Join(errors.New("zalo_personal: find user"), inner)

	got := SafeError(err)
	require.NotContains(t, got, "SECRET-PARAMS")
	require.Contains(t, got, "i/o timeout")
	require.Empty(t, SafeError(nil))
}
