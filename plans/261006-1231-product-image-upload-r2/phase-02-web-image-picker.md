# Phase 2: Web image picker in the product form

Status: completed

## Context

- Form: `apps/web/src/features/admin-products/components/product-form.tsx` (react-hook-form + zod; field `image_url` is a text input today).
- HTTP client: `apps/web/src/shared/api/http.ts` always JSON-encodes `body` and sets `Content-Type: application/json`.
- Existing canvas pattern: `apps/web/src/features/admin-partners/card-image.ts` (`canvas.toBlob`).
- MSW mocks: `apps/web/src/mocks/admin-handlers.ts`; tests: `apps/web/src/features/admin-products/page.test.tsx`.
- UI rules: `docs/design.md` section "Màn người bán" (touch targets, Vietnamese copy tone).

## Requirements

1. `http.ts`: when `opts.body instanceof FormData`, send it as-is and do not set `Content-Type` (the browser adds the multipart boundary). JSON behaviour stays the same.
2. `api.ts`: `uploadProductImage(file: Blob): Promise<string>` posts `FormData{file}` to `/api/seller/products/images` and returns `url`.
3. `image-shrink.ts`: `shrinkImage(file: File, maxEdge = 1200): Promise<Blob>`.
   - Decode with `createImageBitmap(file, { imageOrientation: "from-image" })`; on failure throw `"Không đọc được ảnh này, chọn ảnh JPG hoặc PNG"`.
   - Scale so the long edge is ≤ `maxEdge` (never upscale), draw to a canvas, `toBlob("image/webp", 0.82)`; if the result type is not `image/webp`, re-encode `toBlob("image/jpeg", 0.85)`.
4. `components/product-image-field.tsx` (controlled by the form via `Controller` on `image_url`):
   - Shows a square preview of the current value, or a placeholder with an image icon.
   - Hidden `<input type="file" accept="image/*">`; a button "Chọn ảnh" (or "Đổi ảnh" when a value exists) opens it. On mobile this offers camera and gallery.
   - On pick: shrink → upload → `onChange(url)`. While working, show "Đang tải ảnh…" and report busy to the parent.
   - "Xoá ảnh" sets the value to `""`.
   - Errors (decode, 413, 422, 502, 503, network) show under the field via the existing `FormField` error slot; reset the file input so the same file can be picked again.
   - Touch targets ≥ 44 px; buttons labelled for screen readers ("Chọn ảnh món", "Xoá ảnh món").
5. `product-form.tsx`: replace the URL input with the image field; label "Ảnh (không bắt buộc)"; disable "Lưu" while an upload is in flight. Keep the zod rule on `image_url` (empty or `https://`) so legacy values still validate; 422 `image_url` from the save call still maps to the field.
6. MSW: add `POST /api/seller/products/images` returning `201 {url}` with an https placeholder so `VITE_USE_MOCK=1` dev still works.

## Files

- Modify: `apps/web/src/shared/api/http.ts`, `apps/web/src/features/admin-products/api.ts`, `apps/web/src/features/admin-products/components/product-form.tsx`, `apps/web/src/features/admin-products/page.test.tsx`, `apps/web/src/mocks/admin-handlers.ts`.
- Create: `apps/web/src/features/admin-products/image-shrink.ts`, `apps/web/src/features/admin-products/components/product-image-field.tsx`.
- Tests: `apps/web/src/shared/api/http.test.ts` (extend) for the FormData branch.

## Steps

1. Add the FormData branch to `http.ts` with a test that asserts no JSON content type and the body is passed through.
2. Add `uploadProductImage` and the MSW handler.
3. Write `image-shrink.ts`.
4. Build `product-image-field.tsx` and swap it into the form.
5. Update `page.test.tsx` (mock `image-shrink` with `vi.mock`, since jsdom has no canvas):
   - Pick a file → the upload request is sent → preview shows → "Lưu" sends `image_url` equal to the returned URL.
   - "Lưu" is disabled while the upload is pending.
   - Upload 503 shows "Chưa cấu hình kho ảnh" under the field.
   - "Xoá ảnh" then "Lưu" sends `image_url: null`.
   - Replace the old `ftp://x` client-validation case, since the URL text input is gone.
6. Run the seller audit capture (`apps/web/scripts/capture-seller-audit.mjs`) or a manual check on a 390 px viewport to confirm the dialog layout with and without an image.

## Validation

```bash
cd apps/web && pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm size
```

Manual: `make dev` with real R2 env; on a phone-sized viewport, add a dish with a large photo, check the Network tab shows a WebP/JPEG ≤ 1200 px, save, and confirm the customer menu shows the image.

## Risk

- Safari WebP encoding fallback (handled by the type check).
- The bundle size budget: no new dependency is added.
