package zalo

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func init() { gin.SetMode(gin.TestMode) }

func newTestRouter(svc *Service) *gin.Engine {
	r := gin.New()
	NewHandler(svc).RegisterSeller(r.Group("/api/seller"))
	return r
}

func serve(r *gin.Engine, method, path, body string) *httptest.ResponseRecorder {
	var req *http.Request
	if body == "" {
		req = httptest.NewRequest(method, path, nil)
	} else {
		req = httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestHandlerWithoutKeyReportsNotConfigured(t *testing.T) {
	r := newTestRouter(nil)

	w := serve(r, http.MethodGet, "/api/seller/zalo", "")
	require.Equal(t, http.StatusOK, w.Code)
	assert.JSONEq(t, `{"configured":false,"linked":false,"status":"","display_name":"","linked_at":null}`, w.Body.String())

	for _, tc := range []struct{ method, path, body string }{
		{http.MethodDelete, "/api/seller/zalo", ""},
		{http.MethodPost, "/api/seller/zalo/link", `{"consent_version":"` + testConsentVersion + `"}`},
		{http.MethodGet, "/api/seller/zalo/link/" + uuid.NewString(), ""},
	} {
		w := serve(r, tc.method, tc.path, tc.body)
		assert.Equal(t, http.StatusServiceUnavailable, w.Code, tc.method+" "+tc.path)
		assert.Contains(t, w.Body.String(), "ZALO_NOT_CONFIGURED")
	}
}

func TestHandlerStatusNeverExposesCredentials(t *testing.T) {
	repo := linkedRepo(t, StatusLinked)
	name := "Quán Sidecup"
	repo.acc.DisplayName = &name
	r := newTestRouter(newTestService(t, repo, Options{}))

	w := serve(r, http.MethodGet, "/api/seller/zalo", "")
	require.Equal(t, http.StatusOK, w.Code)
	assert.JSONEq(t, `{"configured":true,"linked":true,"status":"linked","display_name":"Quán Sidecup","linked_at":"2026-10-01T09:00:00Z"}`, w.Body.String())
	assert.NotContains(t, w.Body.String(), "credentials")
	assert.NotContains(t, w.Body.String(), "imei")
}

func TestHandlerStartLinkRequiresConsent(t *testing.T) {
	r := newTestRouter(newTestService(t, &fakeRepo{}, Options{}))

	w := serve(r, http.MethodPost, "/api/seller/zalo/link", `{}`)
	assert.Equal(t, http.StatusUnprocessableEntity, w.Code)
	assert.Contains(t, w.Body.String(), "consent_version")
}

func TestHandlerLinkStatusTreatsUnknownIDsAsNotFound(t *testing.T) {
	r := newTestRouter(newTestService(t, &fakeRepo{}, Options{}))

	for _, id := range []string{"khong-phai-uuid", uuid.NewString()} {
		w := serve(r, http.MethodGet, "/api/seller/zalo/link/"+id, "")
		assert.Equal(t, http.StatusNotFound, w.Code, id)
		assert.Contains(t, w.Body.String(), "ZALO_LINK_NOT_FOUND")
	}
}

func TestHandlerUnlinkIsIdempotent(t *testing.T) {
	repo := linkedRepo(t, StatusLinked)
	r := newTestRouter(newTestService(t, repo, Options{}))

	assert.Equal(t, http.StatusNoContent, serve(r, http.MethodDelete, "/api/seller/zalo", "").Code)
	assert.False(t, repo.hasAccount())
	assert.Equal(t, http.StatusNoContent, serve(r, http.MethodDelete, "/api/seller/zalo", "").Code)
}

func TestHandlerCancelLinkStopsTheAttemptAndIsIdempotent(t *testing.T) {
	svc := newTestService(t, &fakeRepo{}, Options{Login: blockingLogin})
	r := newTestRouter(svc)
	linkID, err := svc.StartLink(testConsentVersion)
	require.NoError(t, err)
	waitState(t, svc.links, linkID, LinkStateQRReady)

	path := "/api/seller/zalo/link/" + linkID.String()
	assert.Equal(t, http.StatusNoContent, serve(r, http.MethodDelete, path, "").Code)
	assert.Equal(t, http.StatusNotFound, serve(r, http.MethodGet, path, "").Code)
	assert.Equal(t, http.StatusNoContent, serve(r, http.MethodDelete, path, "").Code)
	assert.Equal(t, http.StatusNotFound, serve(r, http.MethodDelete, "/api/seller/zalo/link/khong-phai-uuid", "").Code)
}
