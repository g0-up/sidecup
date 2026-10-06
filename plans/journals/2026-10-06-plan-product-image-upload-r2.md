# Plan: product image upload to Cloudflare R2

Date: 2026-10-06 · Plan: `plans/261006-1231-product-image-upload-r2/`

The seller's "Thêm món" and "Sửa món" dialog asks for an image URL today. The plan replaces it with a photo picker that uploads to Cloudflare R2, with the R2 folder set in env.

## Decisions

- Uploads go through the Go API, not presigned URLs. The API checks the seller session, the size and the real image type, and the R2 keys never reach the browser. R2 needs no CORS setup.
- The browser shrinks photos to at most 1200 px and re-encodes them as WebP, falling back to JPEG because Safari's canvas cannot encode WebP. The API still caps uploads at 5 MB.
- Old images stay in R2 when replaced. Storage is cheap at this size, so cleanup is out of scope.
- `products.image_url` is unchanged, so there is no migration, the customer menu needs no change, and existing external URLs keep working.
- Image upload is optional, like Zalo. With every `R2_*` var empty, the endpoint returns 503. A partial set stops the API from starting.

## Things to watch

- nginx's default 1 MB body limit on `/api/` needs raising for the "full" compose.
- Safari's WebP fallback and desktop HEIC decode failures must show a clear error instead of failing silently.
