---
title: Product image upload to R2 delivered
date: 2026-10-06
summary: Photo picker uploads through the Go API to Cloudflare R2, uncommitted; jsdom FormData and an unbounded R2 call were the traps
---

# Product image upload to R2 delivered

## What happened

Plan `plans/261006-1231-product-image-upload-r2` is implemented and uncommitted.
"Thêm món" / "Sửa món" now has a photo picker instead of the URL box. The browser
shrinks the photo to ≤ 1200 px WebP (JPEG when the canvas cannot make WebP), posts it
to `POST /api/seller/products/images`, and the form saves the returned R2 URL in
`image_url`. The API sniffs the type, caps the body at 5 MB, and writes
`R2_FOLDER/<uuid>.<ext>` with a one-year immutable `Cache-Control`. All `R2_*` empty
turns the feature off (503). A partial set, a non-hex account id, a non-https base URL
or an image URL longer than 500 characters stops startup.

The review found no blockers. Three medium issues were fixed before finishing:

- `PutObject` had no deadline, and neither the server (no `WriteTimeout`) nor the
  browser `fetch` would ever give up. A stalled R2 call would have left "Lưu" disabled
  forever. `Upload` now wraps the put in a 20-second timeout, which surfaces as 502.
- The field label still opened the hidden file input during an upload, and TanStack
  Query runs the options-level `onSuccess` for every mutation. Two uploads could race
  and the older one could win. The input is now disabled while busy.
- `createImageBitmap(file, { imageOrientation: "from-image" })` throws on iOS 15 and
  Chrome before 112, which would reject every photo now that the URL box is gone. It
  retries without options.

## Lessons

- Under jsdom, `FormData` built in the page is not multipart-encoded by Node's fetch,
  so an MSW handler calling `request.formData()` throws. The page test only counts the
  request; the multipart body is checked in `api.test.ts` against a stubbed `fetch`.
- `caarlos0/env` `envDefault` does not apply to a variable set to the empty string,
  and compose passes `${R2_FOLDER:-}` as empty. The folder default lives in `parse()`.
- Local Node 24 breaks existing jsdom tests (undici rejects jsdom's `AbortSignal`).
  Web tests were run in `node:22-bookworm-slim`, matching CI.

## Open

- No real R2 bucket was used. The runbook section "Kho ảnh món (Cloudflare R2)" lists
  the manual check: upload, open the URL, see it on the customer menu.
- WebKit could not launch locally, so the JPEG fallback is covered by unit tests only.
