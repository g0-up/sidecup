package products

import (
	"bytes"
	"context"
	"errors"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"sidecup/api/internal/platform/apperr"
)

func init() { gin.SetMode(gin.TestMode) }

var (
	jpegBytes = append([]byte{0xFF, 0xD8, 0xFF, 0xE0}, make([]byte, 64)...)
	pngBytes  = append([]byte("\x89PNG\r\n\x1a\n"), make([]byte, 64)...)
	webpBytes = append([]byte("RIFF\x00\x00\x00\x00WEBPVP8 "), make([]byte, 64)...)
	gifBytes  = append([]byte("GIF89a"), make([]byte, 64)...)
)

type putCall struct {
	ctx              context.Context
	key, contentType string
	size             int
}

type fakeStore struct {
	calls []putCall
	err   error
}

func (f *fakeStore) Put(ctx context.Context, key, contentType string, body []byte) error {
	f.calls = append(f.calls, putCall{ctx, key, contentType, len(body)})
	return f.err
}

func TestImageUploadSniffsType(t *testing.T) {
	cases := map[string]struct {
		data        []byte
		contentType string
		ext         string
	}{
		"jpeg": {jpegBytes, "image/jpeg", ".jpg"},
		"png":  {pngBytes, "image/png", ".png"},
		"webp": {webpBytes, "image/webp", ".webp"},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			store := &fakeStore{}
			svc := NewImageService(store, "https://img.sidecup.test", "sidecup/products")
			url, err := svc.Upload(context.Background(), tc.data)
			require.NoError(t, err)
			require.Len(t, store.calls, 1)
			call := store.calls[0]
			assert.Regexp(t, `^sidecup/products/[0-9a-f-]{36}\`+tc.ext+`$`, call.key)
			assert.Equal(t, tc.contentType, call.contentType)
			assert.Equal(t, "https://img.sidecup.test/"+call.key, url)
		})
	}
}

func TestImageUploadRejectsNonImages(t *testing.T) {
	for name, data := range map[string][]byte{"text": []byte("hello, not an image"), "gif": gifBytes} {
		t.Run(name, func(t *testing.T) {
			store := &fakeStore{}
			_, err := NewImageService(store, "https://img.sidecup.test", "products").Upload(context.Background(), data)
			e, ok := apperr.As(err)
			require.True(t, ok, "%v", err)
			assert.Equal(t, http.StatusUnprocessableEntity, e.Status)
			assert.Contains(t, e.Details["fields"], "file")
			assert.Empty(t, store.calls)
		})
	}
}

func TestImageUploadHidesStoreError(t *testing.T) {
	store := &fakeStore{err: errors.New("AccessDenied: secret details")}
	_, err := NewImageService(store, "https://img.sidecup.test", "products").Upload(context.Background(), jpegBytes)
	e, ok := apperr.As(err)
	require.True(t, ok)
	assert.Equal(t, http.StatusBadGateway, e.Status)
	assert.NotContains(t, e.Message, "secret")

	w := postMultipart(t, newImageRouter(NewImageService(store, "https://img.sidecup.test", "products")), "file", jpegBytes)
	assert.Equal(t, http.StatusBadGateway, w.Code)
	assert.NotContains(t, w.Body.String(), "secret")
}

func TestImageUploadTimesOut(t *testing.T) {
	store := &fakeStore{}
	_, err := NewImageService(store, "https://img.sidecup.test", "products").Upload(context.Background(), jpegBytes)
	require.NoError(t, err)
	deadline, ok := store.calls[0].ctx.Deadline()
	require.True(t, ok, "Put phải có hạn chót")
	assert.WithinDuration(t, time.Now().Add(putTimeout), deadline, 2*time.Second)
}

func newImageRouter(images *ImageService) *gin.Engine {
	r := gin.New()
	NewHandler(nil, images).RegisterSeller(r.Group("/api/seller"))
	return r
}

func postMultipart(t *testing.T, r *gin.Engine, field string, data []byte) *httptest.ResponseRecorder {
	t.Helper()
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	fw, err := mw.CreateFormFile(field, "photo.bin")
	require.NoError(t, err)
	_, err = fw.Write(data)
	require.NoError(t, err)
	require.NoError(t, mw.Close())
	req := httptest.NewRequest(http.MethodPost, "/api/seller/products/images", &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestUploadImageRoute(t *testing.T) {
	store := &fakeStore{}
	r := newImageRouter(NewImageService(store, "https://img.sidecup.test", "products"))

	w := postMultipart(t, r, "file", webpBytes)
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	assert.Regexp(t, regexp.MustCompile(`^\{"url":"https://img\.sidecup\.test/products/[0-9a-f-]{36}\.webp"\}$`), w.Body.String())
	require.Len(t, store.calls, 1)
	assert.Equal(t, "image/webp", store.calls[0].contentType)

	w = postMultipart(t, r, "file", bytes.Repeat([]byte{0xFF}, maxImageBytes+1))
	assert.Equal(t, http.StatusRequestEntityTooLarge, w.Code)
	assert.Contains(t, w.Body.String(), "FILE_TOO_LARGE")

	w = postMultipart(t, r, "file", append(jpegBytes, make([]byte, maxUploadBody)...))
	assert.Equal(t, http.StatusRequestEntityTooLarge, w.Code, "vượt cả giới hạn body")

	w = postMultipart(t, r, "photo", jpegBytes)
	assert.Equal(t, http.StatusUnprocessableEntity, w.Code)
	assert.Contains(t, w.Body.String(), `"file":"Chọn ảnh"`)

	w = postMultipart(t, r, "file", []byte("plain text"))
	assert.Equal(t, http.StatusUnprocessableEntity, w.Code)
	assert.Contains(t, w.Body.String(), "JPG, PNG hoặc WebP")

	req := httptest.NewRequest(http.MethodPost, "/api/seller/products/images", strings.NewReader(`{}`))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusUnprocessableEntity, w.Code, "không phải multipart")

	req = httptest.NewRequest(http.MethodPost, "/api/seller/products/images",
		strings.NewReader("--x\r\nContent-Disposition: form-data; name=\"file\"; filename=\"a\"\r\n\r\n"+string(jpegBytes)))
	req.Header.Set("Content-Type", "multipart/form-data; boundary=x")
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusBadRequest, w.Code, "body đứt giữa chừng")
	assert.Contains(t, w.Body.String(), "UPLOAD_READ")

	assert.Len(t, store.calls, 1, "chỉ ảnh hợp lệ mới được ghi")
}

func TestUploadImageDisabled(t *testing.T) {
	w := postMultipart(t, newImageRouter(nil), "file", jpegBytes)
	assert.Equal(t, http.StatusServiceUnavailable, w.Code)
	assert.Contains(t, w.Body.String(), "UPLOAD_DISABLED")
}
