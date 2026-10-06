package products

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"sidecup/api/internal/platform/apperr"
)

// maxImageBytes giới hạn ảnh món; web đã thu nhỏ còn vài trăm KB nên 5 MB chỉ để chặn lạm dụng.
const maxImageBytes = 5 << 20

// maxUploadBody chừa thêm chỗ cho phần đầu multipart quanh file.
const maxUploadBody = maxImageBytes + 64<<10

// putTimeout: R2 treo thì trả lỗi để người bán thử lại, không để nút "Lưu" khoá mãi.
const putTimeout = 20 * time.Second

var (
	ErrUploadDisabled = apperr.New(http.StatusServiceUnavailable, "UPLOAD_DISABLED", "Chưa cấu hình kho ảnh")
	errImageTooLarge  = apperr.New(http.StatusRequestEntityTooLarge, "FILE_TOO_LARGE", "Ảnh tối đa 5 MB")
	errUploadFailed   = apperr.New(http.StatusBadGateway, "UPLOAD_FAILED", "Không tải được ảnh lên, thử lại")
	errUploadRead     = apperr.BadRequest("UPLOAD_READ", "Không nhận đủ ảnh gửi lên, thử lại")
	errNoImage        = apperr.Field("file", "Chọn ảnh")
	errImageType      = apperr.Field("file", "Chỉ nhận ảnh JPG, PNG hoặc WebP")
)

// imageExt: loại ảnh nhận được, xác định từ nội dung file chứ không tin Content-Type của trình duyệt.
var imageExt = map[string]string{
	"image/jpeg": ".jpg",
	"image/png":  ".png",
	"image/webp": ".webp",
}

// ObjectStore là kho file công khai (Cloudflare R2 khi chạy thật, bản giả trong test).
type ObjectStore interface {
	Put(ctx context.Context, key, contentType string, body []byte) error
}

type ImageService struct {
	store      ObjectStore
	publicBase string
	folder     string
}

func NewImageService(store ObjectStore, publicBase, folder string) *ImageService {
	return &ImageService{store: store, publicBase: publicBase, folder: folder}
}

// Upload lưu ảnh dưới tên mới (không ghi đè ảnh cũ) và trả URL công khai để gán vào image_url.
// Lỗi của kho bọc errUploadFailed: response chỉ có câu cố định, chi tiết để handler ghi log.
func (s *ImageService) Upload(ctx context.Context, data []byte) (string, error) {
	contentType := http.DetectContentType(data)
	ext, ok := imageExt[contentType]
	if !ok {
		return "", errImageType
	}
	key := s.folder + "/" + uuid.NewString() + ext
	ctx, cancel := context.WithTimeout(ctx, putTimeout)
	defer cancel()
	if err := s.store.Put(ctx, key, contentType, data); err != nil {
		return "", fmt.Errorf("lưu %s: %w: %w", key, errUploadFailed, err)
	}
	return s.publicBase + "/" + key, nil
}

// readImage lấy part "file" của form multipart, tối đa maxImageBytes.
func readImage(c *gin.Context) ([]byte, error) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxUploadBody)
	mr, err := c.Request.MultipartReader()
	if err != nil {
		return nil, errNoImage
	}
	for {
		part, err := mr.NextPart()
		if errors.Is(err, io.EOF) {
			return nil, errNoImage
		}
		if err != nil {
			return nil, readErr(err)
		}
		if part.FormName() != "file" {
			continue
		}
		data, err := io.ReadAll(io.LimitReader(part, maxImageBytes+1))
		switch {
		case err != nil:
			return nil, readErr(err)
		case len(data) > maxImageBytes:
			return nil, errImageTooLarge
		case len(data) == 0:
			return nil, errNoImage
		}
		return data, nil
	}
}

// readErr: body vượt giới hạn là 413; đứt giữa chừng (mạng chập chờn, quá ReadTimeout) thì báo thử lại.
func readErr(err error) error {
	var maxErr *http.MaxBytesError
	if errors.As(err, &maxErr) {
		return errImageTooLarge
	}
	return errUploadRead
}
