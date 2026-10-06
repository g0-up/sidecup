# Phase 1: API upload endpoint and R2 store

Status: completed

## Context

- Products feature: `apps/api/internal/features/products/` (`handler.go` registers seller routes, `service.go` validates `image_url` as https).
- Config: `apps/api/internal/platform/config/config.go` uses `caarlos0/env`; the optional-feature pattern is `ZaloCredentialKey` + `ZaloEnabled()`.
- Wiring: `apps/api/internal/app/router.go` (`app.New(Deps)`); integration harness `internal/app/harness_integration_test.go` builds `config.Config` directly and calls `app.New`.
- JSON bind caps bodies at 64 KB (`httpx.BindJSON`); multipart needs its own cap.

## Requirements

1. Config fields: `R2AccountID`, `R2AccessKeyID`, `R2SecretAccessKey`, `R2Bucket`, `R2PublicBaseURL`, `R2Folder` (envs `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL`, `R2_FOLDER`).
   - `R2Enabled()` is true when all of account, keys, bucket and public URL are set.
   - `validate()`: if any of those five is set but not all, fail naming the missing vars. `R2_PUBLIC_BASE_URL` must parse as `https://host[/path]`; trim the trailing `/`.
   - `R2_FOLDER` is optional, default `products`; trim leading/trailing `/`; reject `..` segments and characters outside `[A-Za-z0-9/_-]`.
2. `internal/platform/objectstore/r2.go`: a small R2 client over `github.com/aws/aws-sdk-go-v2/service/s3` with region `auto`, endpoint `https://<account>.r2.cloudflarestorage.com`, static credentials. Exposes `Put(ctx, key, contentType string, body []byte) error` and sets `CacheControl: "public, max-age=31536000, immutable"`.
3. `internal/features/products/image.go`:
   - `type ObjectStore interface { Put(ctx context.Context, key, contentType string, body []byte) error }`.
   - `ImageService{store, publicBase, folder}` with `Upload(ctx, data []byte) (string, error)`: sniff with `http.DetectContentType`, allow `image/jpeg`→`.jpg`, `image/png`→`.png`, `image/webp`→`.webp`; otherwise `apperr.Field("file", "Chỉ nhận ảnh JPG, PNG hoặc WebP")`. Key = `folder + "/" + uuid.NewString() + ext`. Return `publicBase + "/" + key`.
   - A nil `*ImageService` (feature off) makes the handler return 503 `UPLOAD_DISABLED` "Chưa cấu hình kho ảnh".
4. Handler: `POST /api/seller/products/images` in `RegisterSeller`.
   - Wrap the body in `http.MaxBytesReader` at 5 MB + 64 KB multipart overhead; on overflow return 413 `FILE_TOO_LARGE` "Ảnh tối đa 5 MB".
   - Read form file `file` (missing → 422 `{file: "Chọn ảnh"}`), read it fully (≤ 5 MB), call `Upload`, respond `httpx.Created(c, gin.H{"url": url})`.
   - Storage errors are logged and returned as 502 `UPLOAD_FAILED` "Không tải được ảnh lên, thử lại" (do not leak SDK messages).
5. Wiring: add `Images products.ObjectStore` to `app.Deps`. In `app.New`, when `Deps.Images` is nil and `cfg.R2Enabled()`, build the R2 store; when a store exists, build `ImageService`; pass it to `products.NewHandler`.

## Files

- Modify: `apps/api/internal/platform/config/config.go`, `apps/api/internal/features/products/handler.go`, `apps/api/internal/app/router.go`, `apps/api/go.mod`, `apps/api/go.sum`.
- Create: `apps/api/internal/platform/objectstore/r2.go`, `apps/api/internal/features/products/image.go`.
- Tests: `apps/api/internal/platform/config/config_test.go` (extend), `apps/api/internal/features/products/image_test.go`, `apps/api/internal/app/admin_integration_test.go`.

## Steps

1. `go get github.com/aws/aws-sdk-go-v2/service/s3 github.com/aws/aws-sdk-go-v2/credentials github.com/aws/aws-sdk-go-v2/aws`.
2. Add config fields, `R2Enabled()`, validation and folder normalisation; unit-test all-empty, partial, http base URL, bad folder, default folder.
3. Write `objectstore/r2.go` (no unit test against the network; it is a thin SDK wrapper).
4. Write `image.go` + `image_test.go` with a fake store: JPEG/PNG/WebP magic bytes map to the right ext and content type; text and GIF are rejected; URL and key shape use folder and public base.
5. Add the handler route and the size cap.
6. Wire `Deps.Images`; in the integration test, pass a fake store and cover 201 (fake recorded the key and content type), 401 without cookie, 413, 422 missing/invalid file, and 503 when no store and R2 is off.

## Validation

```bash
cd apps/api && go build ./... && make test && make lint
```

Manual (with real R2 env in `apps/api/.env`): log in, `curl -b cookie -F file=@photo.webp http://localhost:8080/api/seller/products/images`, then open the returned URL.

## Risk

- Reading the whole file into memory is fine at 5 MB and a single seller.
- Logging must not print R2 secrets; log only the bucket, key and error.
