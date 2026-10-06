# Product image upload to Cloudflare R2

Status: completed · Branch: master · Mode: auto (standard)

## Contract

- **Outcome:** In the seller "Thêm món" and "Sửa món" dialog, the seller picks a photo (gallery or camera) instead of typing an image URL. The browser shrinks it, the API stores it in Cloudflare R2 under a folder set in env, and the product saves the public R2 URL in `image_url`. The customer menu shows it with no change.
- **Constraints:**
  - Upload goes through the Go API (user decision): seller session required, R2 keys stay server-side, no R2 CORS setup.
  - The browser resizes to at most 1200 px on the long edge and re-encodes to WebP (JPEG fallback) before upload (user decision). The API still caps the body at 5 MB and accepts only sniffed JPEG, PNG or WebP.
  - R2 config lives in env: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL`, `R2_FOLDER`. All empty means the feature is off (endpoint returns 503, same pattern as `ZALO_CREDENTIAL_KEY`); a partial set refuses to start.
  - `products.image_url` and its rules stay as they are (nullable, `https://` only, max 500). No migration. Products with existing external URLs keep displaying and keep saving unchanged.
  - CSP already allows `img-src https:` in Caddy and Traefik; no header change.
- **Non-goals:** Deleting old or orphaned R2 objects (user decision: keep them); presigned direct-to-R2 uploads; server-side image processing; multiple images per product; keeping the URL text input as a fallback.
- **Acceptance:**
  1. `POST /api/seller/products/images` (multipart field `file`) returns `201 {url}` where `url = R2_PUBLIC_BASE_URL + "/" + R2_FOLDER + "/<uuid>.<ext>"`, and the object exists in R2 with the right `Content-Type` and a long immutable `Cache-Control`.
  2. The endpoint returns 401 without a seller session, 413 over 5 MB, 422 `{fields:{file}}` for a missing file or a non JPEG/PNG/WebP body (sniffed, not trusted from the header), and 503 `UPLOAD_DISABLED` when R2 env is empty.
  3. The API refuses to start when only some `R2_*` vars are set, or when `R2_PUBLIC_BASE_URL` is not `https://`.
  4. The form has no URL text box. It shows the current image (or an empty placeholder), "Chọn ảnh"/"Đổi ảnh" and "Xoá ảnh" buttons, an uploading state that disables "Lưu", and a field error when upload or decode fails.
  5. A 4000×3000 phone photo uploads as a ≤ 1200 px WebP or JPEG, typically under 400 KB.
  6. Saving after upload persists the R2 URL; the customer menu renders it; "Xoá ảnh" then "Lưu" sets `image_url` to null.
  7. `make test`, `make lint`, web `typecheck`, `test`, `build` and `size` pass.

## Phases

| # | Phase | Status | Depends on |
|---|-------|--------|-----------|
| 1 | [API upload endpoint and R2 store](phase-01-api-upload-endpoint.md) | completed | — |
| 2 | [Web image picker in the product form](phase-02-web-image-picker.md) | completed | 1 (contract only; can build against MSW) |
| 3 | [Config, infra and docs](phase-03-config-infra-docs.md) | completed | 1 |

## Flow

```text
seller picks file ─▶ shrinkImage() (canvas, ≤1200px, webp|jpeg)
   ─▶ POST /api/seller/products/images (multipart, cookie)
        API: MaxBytes 5MB ─▶ sniff type ─▶ key = R2_FOLDER/<uuid>.<ext> ─▶ PutObject(R2)
   ◀─ 201 {url: R2_PUBLIC_BASE_URL/key}
form sets image_url = url ─▶ "Lưu" ─▶ POST/PUT /api/seller/products (unchanged JSON contract)
```

## Touchpoints

- API: `internal/platform/config/config.go`, new `internal/platform/objectstore/r2.go`, new `internal/features/products/image.go`, `internal/features/products/handler.go`, `internal/app/router.go`, `go.mod`, tests.
- Web: `src/shared/api/http.ts`, `src/features/admin-products/{api.ts, components/product-form.tsx, components/product-image-field.tsx, image-shrink.ts, page.test.tsx}`, `src/mocks/admin-handlers.ts`.
- Infra/docs: `apps/api/.env.example`, `infra/.env.example`, `infra/docker-compose.prod.yml`, `apps/web/nginx.conf`, `docs/api.md`, `docs/runbook.md`.

## Risks

- **Safari canvas WebP:** Safari's `toBlob("image/webp")` silently returns PNG. The shrink helper checks `blob.type` and re-encodes as JPEG when it is not WebP.
- **HEIC on desktop:** iOS converts HEIC to JPEG for `<input type=file accept=image/*>`, but desktop browsers may fail to decode HEIC. The form shows "Không đọc được ảnh này, chọn ảnh JPG/PNG".
- **R2 public access:** the bucket must be exposed via a custom domain (or r2.dev for testing). Without it the URL saves but 404s. The runbook covers setup and a verify step.
- **aws-sdk-go-v2 checksum defaults:** recent SDK versions send CRC32 checksums by default; R2 supports them, but if `PutObject` fails with a checksum error, set `RequestChecksumCalculation: aws.RequestChecksumCalculationWhenRequired`.

## Rollback

Revert the commits. No data migration exists; products saved with R2 URLs keep working while the bucket stays public.
