package httpx

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"reflect"
	"strings"
	"sync"

	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
	"github.com/google/uuid"

	"sidecup/api/internal/platform/apperr"
)

const maxBodyBytes = 64 << 10

var errBodyTooLarge = errors.New("body too large")

var (
	validateOnce sync.Once
	validate     *validator.Validate
)

func validatorInstance() *validator.Validate {
	validateOnce.Do(func() {
		validate = validator.New(validator.WithRequiredStructEnabled())
		// Báo lỗi theo tên field JSON để web map thẳng vào ô nhập.
		validate.RegisterTagNameFunc(func(f reflect.StructField) string {
			name, _, _ := strings.Cut(f.Tag.Get("json"), ",")
			if name == "-" {
				return ""
			}
			return name
		})
	})
	return validate
}

// BindJSON đọc body JSON (tối đa 64 KB), từ chối field lạ và validate theo tag `validate`.
// Lỗi trả về là *apperr.Error 400/422 sẵn để render.
func BindJSON(c *gin.Context, dst any) error {
	body := http.MaxBytesReader(c.Writer, c.Request.Body, maxBodyBytes)
	dec := json.NewDecoder(body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		var maxErr *http.MaxBytesError
		switch {
		case errors.As(err, &maxErr):
			return errBodyTooLarge
		case errors.Is(err, io.EOF):
			return apperr.BadRequest("INVALID_JSON", "Thiếu dữ liệu gửi lên")
		default:
			var typeErr *json.UnmarshalTypeError
			if errors.As(err, &typeErr) && typeErr.Field != "" {
				return apperr.Field(typeErr.Field, "Sai kiểu dữ liệu")
			}
			return apperr.BadRequest("INVALID_JSON", "Dữ liệu gửi lên không đúng định dạng")
		}
	}
	return Validate(dst)
}

// Validate chạy validator trên struct đã decode.
func Validate(v any) error {
	err := validatorInstance().Struct(v)
	if err == nil {
		return nil
	}
	var verrs validator.ValidationErrors
	if !errors.As(err, &verrs) {
		return err
	}
	fields := make(map[string]string, len(verrs))
	for _, fe := range verrs {
		fields[fieldPath(fe)] = message(fe)
	}
	return apperr.Validation(fields)
}

// fieldPath bỏ tên struct gốc: "createReq.items[0].qty" → "items[0].qty".
func fieldPath(fe validator.FieldError) string {
	ns := fe.Namespace()
	if _, rest, ok := strings.Cut(ns, "."); ok {
		return rest
	}
	return fe.Field()
}

func message(fe validator.FieldError) string {
	p := fe.Param()
	isString := fe.Kind() == reflect.String
	switch fe.Tag() {
	case "required":
		return "Không được để trống"
	case "min":
		if isString {
			return fmt.Sprintf("Tối thiểu %s ký tự", p)
		}
		if fe.Kind() == reflect.Slice {
			return fmt.Sprintf("Cần ít nhất %s mục", p)
		}
		return fmt.Sprintf("Tối thiểu là %s", p)
	case "max":
		if isString {
			return fmt.Sprintf("Tối đa %s ký tự", p)
		}
		if fe.Kind() == reflect.Slice {
			return fmt.Sprintf("Tối đa %s mục", p)
		}
		return fmt.Sprintf("Tối đa là %s", p)
	case "gte":
		return fmt.Sprintf("Phải lớn hơn hoặc bằng %s", p)
	case "lte":
		return fmt.Sprintf("Phải nhỏ hơn hoặc bằng %s", p)
	case "gt":
		return fmt.Sprintf("Phải lớn hơn %s", p)
	case "len":
		return fmt.Sprintf("Phải đúng %s ký tự", p)
	case "uuid", "uuid4":
		return "Mã không hợp lệ"
	case "oneof":
		return "Giá trị phải là một trong: " + strings.ReplaceAll(p, " ", ", ")
	case "numeric":
		return "Chỉ được chứa chữ số"
	case "url", "http_url":
		return "Đường dẫn không hợp lệ"
	case "ne":
		return fmt.Sprintf("Không được bằng %s", p)
	case "dive":
		return "Danh sách không hợp lệ"
	default:
		return "Không hợp lệ"
	}
}

// ParamUUID đọc path param dạng UUID; sai định dạng coi như không tìm thấy.
func ParamUUID(c *gin.Context, name, notFoundCode, notFoundMsg string) (uuid.UUID, error) {
	id, err := uuid.Parse(c.Param(name))
	if err != nil {
		return uuid.Nil, apperr.NotFound(notFoundCode, notFoundMsg)
	}
	return id, nil
}
