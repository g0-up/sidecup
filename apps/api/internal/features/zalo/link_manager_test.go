package zalo

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"sidecup/api/internal/features/zalo/protocol"
)

const testConsentVersion = "2026-10-02"

// recordingLinker thay phần lưu của lần quét thành công để chạy manager không cần DB hay cipher.
type recordingLinker struct {
	mu      sync.Mutex
	calls   int
	consent string
	cred    protocol.Credentials
	name    string
	fail    error
}

func (r *recordingLinker) onLinked(_ context.Context, consentVersion string, sess *protocol.Session, cred *protocol.Credentials) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.calls++
	r.consent = consentVersion
	r.cred = *cred
	r.name = sess.DisplayName
	return r.fail
}

func (r *recordingLinker) snapshot() (calls int, consent string, cred protocol.Credentials, name string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.calls, r.consent, r.cred, r.name
}

func newTestManager(t *testing.T, login LoginFunc, linker *recordingLinker, opts LinkOptions) *linkManager {
	t.Helper()
	m := newLinkManager(login, linker.onLinked, nil, opts)
	t.Cleanup(m.close)
	return m
}

func waitState(t *testing.T, m *linkManager, linkID uuid.UUID, want LinkState) LinkSnapshot {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	last := LinkState("")
	for time.Now().Before(deadline) {
		snap, err := m.status(linkID)
		require.NoError(t, err)
		if snap.State == want {
			return snap
		}
		last = snap.State
		time.Sleep(time.Millisecond)
	}
	t.Fatalf("hết giờ chờ trạng thái %q; lần cuối thấy %q", want, last)
	return LinkSnapshot{}
}

func blockingLogin(ctx context.Context, _ *protocol.Session, cb protocol.QRCallbacks) (*protocol.Credentials, error) {
	cb.OnQR([]byte("png"))
	<-ctx.Done()
	return nil, ctx.Err()
}

func TestLinkManagerAdvancesThroughEveryQRMilestone(t *testing.T) {
	t.Parallel()
	step := make(chan struct{})
	login := func(_ context.Context, sess *protocol.Session, cb protocol.QRCallbacks) (*protocol.Credentials, error) {
		cb.OnQR([]byte("qr-png-bytes"))
		<-step
		cb.OnProgress(protocol.QRStateScanned)
		<-step
		cb.OnProgress(protocol.QRStateConfirmed)
		<-step
		sess.DisplayName = "Quán Cô Ba"
		return &protocol.Credentials{IMEI: "imei-1", UserAgent: "ua"}, nil
	}
	linker := &recordingLinker{}
	m := newTestManager(t, login, linker, LinkOptions{})

	linkID := m.begin(testConsentVersion)
	qr := waitState(t, m, linkID, LinkStateQRReady)
	require.Equal(t, []byte("qr-png-bytes"), qr.QRPNG)

	step <- struct{}{}
	waitState(t, m, linkID, LinkStateScanned)
	step <- struct{}{}
	waitState(t, m, linkID, LinkStateConfirmed)
	step <- struct{}{}

	linked := waitState(t, m, linkID, LinkStateLinked)
	require.Equal(t, "Quán Cô Ba", linked.DisplayName)
	require.Empty(t, linked.QRPNG, "mã đã dùng không phục vụ tiếp")

	calls, consent, cred, name := linker.snapshot()
	require.Equal(t, 1, calls)
	require.Equal(t, testConsentVersion, consent)
	require.Equal(t, "imei-1", cred.IMEI)
	require.Equal(t, "Quán Cô Ba", name)
}

func TestLinkManagerExpiresAnAttemptThatOutlivesItsDeadline(t *testing.T) {
	t.Parallel()
	linker := &recordingLinker{}
	m := newTestManager(t, blockingLogin, linker, LinkOptions{AttemptTTL: 50 * time.Millisecond, Retention: time.Minute})

	linkID := m.begin(testConsentVersion)
	waitState(t, m, linkID, LinkStateExpired)
	calls, _, _, _ := linker.snapshot()
	require.Zero(t, calls)
}

func TestLinkManagerSweepsAFinishedAttemptOnceItsRetentionPasses(t *testing.T) {
	t.Parallel()
	m := newTestManager(t, blockingLogin, &recordingLinker{}, LinkOptions{AttemptTTL: 20 * time.Millisecond, Retention: 100 * time.Millisecond})

	linkID := m.begin(testConsentVersion)
	waitState(t, m, linkID, LinkStateExpired)
	require.Eventually(t, func() bool {
		_, err := m.status(linkID)
		return errors.Is(err, ErrLinkNotFound)
	}, 2*time.Second, 5*time.Millisecond)
}

func TestLinkManagerReportsAFailedLoginWithoutLeakingItsCause(t *testing.T) {
	t.Parallel()
	login := func(context.Context, *protocol.Session, protocol.QRCallbacks) (*protocol.Credentials, error) {
		return nil, errors.New("zalo returned imei=secret-value cookie=zpsid-secret")
	}
	m := newTestManager(t, login, &recordingLinker{}, LinkOptions{})

	snap := waitState(t, m, m.begin(testConsentVersion), LinkStateError)
	require.Equal(t, linkFailureMessage, snap.Failure)
	require.NotContains(t, snap.Failure, "secret-value")
}

func TestLinkManagerReportsAFailedPersistAsAnError(t *testing.T) {
	t.Parallel()
	login := func(context.Context, *protocol.Session, protocol.QRCallbacks) (*protocol.Credentials, error) {
		return &protocol.Credentials{IMEI: "imei", UserAgent: "ua"}, nil
	}
	m := newTestManager(t, login, &recordingLinker{fail: errors.New("database is down")}, LinkOptions{})

	snap := waitState(t, m, m.begin(testConsentVersion), LinkStateError)
	require.NotContains(t, snap.Failure, "database is down")
}

func TestLinkManagerSupersedesThePreviousAttempt(t *testing.T) {
	t.Parallel()
	var mu sync.Mutex
	cancelled := 0
	login := func(ctx context.Context, sess *protocol.Session, cb protocol.QRCallbacks) (*protocol.Credentials, error) {
		_, err := blockingLogin(ctx, sess, cb)
		mu.Lock()
		cancelled++
		mu.Unlock()
		return nil, err
	}
	m := newTestManager(t, login, &recordingLinker{}, LinkOptions{AttemptTTL: 5 * time.Second, Retention: time.Minute})

	first := m.begin(testConsentVersion)
	waitState(t, m, first, LinkStateQRReady)
	second := m.begin(testConsentVersion)
	require.NotEqual(t, first, second)

	require.Eventually(t, func() bool {
		mu.Lock()
		defer mu.Unlock()
		return cancelled == 1
	}, 2*time.Second, 5*time.Millisecond, "attempt cũ phải bị huỷ")
	_, err := m.status(first)
	require.ErrorIs(t, err, ErrLinkNotFound)
	waitState(t, m, second, LinkStateQRReady)
}

func TestLinkManagerRefusesAnUnknownLinkID(t *testing.T) {
	t.Parallel()
	m := newTestManager(t, blockingLogin, &recordingLinker{}, LinkOptions{AttemptTTL: 5 * time.Second})
	waitState(t, m, m.begin(testConsentVersion), LinkStateQRReady)

	_, err := m.status(uuid.New())
	require.ErrorIs(t, err, ErrLinkNotFound)
}

func TestLinkManagerCancelStopsTheAttempt(t *testing.T) {
	t.Parallel()
	m := newTestManager(t, blockingLogin, &recordingLinker{}, LinkOptions{AttemptTTL: 5 * time.Second})
	linkID := m.begin(testConsentVersion)
	waitState(t, m, linkID, LinkStateQRReady)

	m.cancel()
	_, err := m.status(linkID)
	require.ErrorIs(t, err, ErrLinkNotFound)
}

func TestLinkManagerCancelAttemptStopsOnlyThatAttempt(t *testing.T) {
	t.Parallel()
	linker := &recordingLinker{}
	m := newTestManager(t, blockingLogin, linker, LinkOptions{AttemptTTL: 5 * time.Second})
	linkID := m.begin(testConsentVersion)
	waitState(t, m, linkID, LinkStateQRReady)

	m.cancelAttempt(uuid.New())
	waitState(t, m, linkID, LinkStateQRReady)

	m.mu.Lock()
	done := m.active.done
	m.mu.Unlock()
	m.cancelAttempt(linkID)
	select {
	case <-done:
	default:
		t.Fatal("cancelAttempt phải chờ goroutine của attempt return")
	}
	_, err := m.status(linkID)
	require.ErrorIs(t, err, ErrLinkNotFound)
	calls, _, _, _ := linker.snapshot()
	require.Zero(t, calls, "đã huỷ thì điện thoại xác nhận muộn cũng không được lưu")
	m.cancelAttempt(linkID)
}

// Quét đã hoàn tất ngay trước khi người bán bấm Huỷ: liên kết đã lưu là thật, huỷ không xoá nó — client đọc
// lại trạng thái để thấy đúng.
func TestLinkManagerCancelAttemptWaitsForAScanThatAlreadySucceeded(t *testing.T) {
	t.Parallel()
	persisting := make(chan struct{})
	release := make(chan struct{})
	linker := &recordingLinker{}
	onLinked := func(ctx context.Context, consent string, sess *protocol.Session, cred *protocol.Credentials) error {
		close(persisting)
		<-release
		return linker.onLinked(ctx, consent, sess, cred)
	}
	login := func(context.Context, *protocol.Session, protocol.QRCallbacks) (*protocol.Credentials, error) {
		return &protocol.Credentials{IMEI: "imei"}, nil
	}
	m := newLinkManager(login, onLinked, nil, LinkOptions{AttemptTTL: 5 * time.Second})
	t.Cleanup(m.close)
	linkID := m.begin(testConsentVersion)
	<-persisting

	cancelled := make(chan struct{})
	go func() {
		m.cancelAttempt(linkID)
		close(cancelled)
	}()
	select {
	case <-cancelled:
		t.Fatal("cancelAttempt không được trả về khi lần lưu còn dở")
	case <-time.After(20 * time.Millisecond):
	}
	close(release)
	<-cancelled
	calls, _, _, _ := linker.snapshot()
	require.Equal(t, 1, calls)
}

func TestLinkManagerCloseEndsEveryInFlightGoroutine(t *testing.T) {
	t.Parallel()
	m := newLinkManager(blockingLogin, (&recordingLinker{}).onLinked, nil, LinkOptions{AttemptTTL: time.Hour, Retention: time.Hour})

	var done []<-chan struct{}
	for range 3 {
		waitState(t, m, m.begin(testConsentVersion), LinkStateQRReady)
		m.mu.Lock()
		done = append(done, m.active.done)
		m.mu.Unlock()
	}
	m.close()
	for i, ch := range done {
		select {
		case <-ch:
		case <-time.After(2 * time.Second):
			t.Fatalf("attempt %d còn goroutine sau close", i)
		}
	}
}
