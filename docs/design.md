# Thiết kế giao diện khách

Quy tắc cho mọi màn khách (`/`, `/t/:token`, `/o/:id`, `/revoked`, 404). Màn người bán dùng chung token và component nhưng không bắt buộc theo phần "Giọng văn" và "Thương hiệu"; quy tắc riêng của chúng ở [Màn người bán](#màn-người-bán). Giá trị token chỉ nằm trong code; tài liệu này nói **khi nào dùng cái gì**.

| Nguồn | Nội dung |
|-------|----------|
| [`apps/web/src/index.css`](../apps/web/src/index.css) | Bảng màu UpNext, gradient, bo góc, bóng, font, token chuyển động, luật giảm chuyển động, hiệu ứng sheet và số ly |
| [`apps/web/src/shared/ui/button.tsx`](../apps/web/src/shared/ui/button.tsx) | Biến thể nút, gồm `cta` (gradient) |
| [`apps/web/src/shared/ui/bottom-sheet.tsx`](../apps/web/src/shared/ui/bottom-sheet.tsx) | Sheet `<dialog>` gốc |
| [`apps/web/src/shared/layout/customer-brand.tsx`](../apps/web/src/shared/layout/customer-brand.tsx) | Dòng thương hiệu |
| [`apps/web/src/shared/hooks/use-document-head.ts`](../apps/web/src/shared/hooks/use-document-head.ts) | Tiêu đề tab và `noindex` |
| [`apps/web/index.html`](../apps/web/index.html) | `theme-color`, mô tả, thẻ Open Graph, khung tĩnh trước khi JS chạy |

## Màu và hình khối

- Navy (`--primary`) là màu chính: chữ đậm, nút thường, viền focus, dòng thương hiệu.
- Gradient cam → đỏ (`--gradient-accent`) chỉ dành cho **một** nút hành động chính mỗi màn, qua `<Button variant="cta">` (hoặc `buttonVariants({ variant: "cta" })` cho `<Link>`). Ví dụ: "Đặt nước" trong giỏ, "Gọi thêm nước" khi đơn đã đóng. Không dùng gradient cho nền, chữ hay hành động phụ; khi màn đã có CTA thì hành động khác dùng `default` hoặc `outline`.
- Chấm gradient nhỏ trong dòng thương hiệu là ngoại lệ duy nhất, vì nó là dấu nhận diện chứ không phải nút.
- Chữ phụ dùng `text-muted-foreground`; token này đã được nâng lên đạt AA (lý do ghi ngay trong `index.css`). Không tự đặt màu xám nhạt hơn.
- Góc gần vuông cho thẻ và sheet; chỉ nút là hình viên thuốc (`rounded-full`).
- Hành động huỷ hoặc nguy hiểm dùng `outline` + `text-destructive` ở bước đầu; nút đỏ đặc chỉ xuất hiện ở bước xác nhận. Ở bước xác nhận, nút giữ nguyên (vd. "Không huỷ") nằm đúng chỗ nút vừa bấm và nhận focus, để chạm đúp hay Enter hai lần chỉ quay lại chứ không xác nhận.

## Kích thước chạm và chữ

- **Mọi điều khiển trên màn khách ≥ 44 × 44 px.** Dùng `size-11`, `h-11` hoặc `min-h-11` (và `min-w-11` cho nút chỉ có icon). Nút `size="lg"` cần thêm `min-h-11`; CTA đã cao 48 px.
- Liên kết trong danh sách (ví dụ "Đơn của bạn hôm nay") cũng phải đạt 44 px chiều cao, bằng `min-h-11 py-3`.
- **Chữ trong ô nhập luôn 16 px ở mọi bề rộng** (`text-base` trong `Input` và `Textarea`, không có `md:text-sm`). Dưới 16 px thì Safari iOS tự phóng to trang khi chạm vào ô.
- Nhãn chọn (độ ngọt, đá) không được gãy hay bị cắt ở bất kỳ bề rộng nào: ô rộng theo chữ (`flex-wrap`, `flex-auto`, `whitespace-nowrap`), hết chỗ thì cả ô xuống hàng. Ô đang chọn là nền navy đặc, chữ trắng đậm, có dấu tích; một lớp ẩn giữ sẵn chỗ cho dấu tích để chọn ô không làm ô đổi cỡ.
- Tiêu đề trạng thái đơn là H1 cỡ `text-2xl`; mã đơn là dòng phụ, không phải tiêu đề.

## Chuyển động

- Chỉ dùng hai thời lượng `--duration-fast` (đổi màu, trạng thái nhỏ) và `--duration-base` (sheet, nhịp nảy), với easing `--ease-out`. Không đặt số ms rời trong component.
- Chỉ animate `transform` và `opacity`. Không animate kích thước, vị trí layout hay bóng.
- Luật giảm chuyển động toàn cục nằm trong `@layer base` của `index.css`: khi người dùng bật `prefers-reduced-motion`, mọi `animation` và `transition` (kể cả `::backdrop`) bị tắt. Hiệu ứng mới không cần tự viết guard, nhưng **không được** dùng `!important` hay inline style để vượt qua luật đó.
- Hiệu ứng lặp (`animate-pulse` trên bước đang chạy) viết là `motion-safe:animate-pulse`.
- Phản hồi khi thêm món: số ly trên thanh giỏ nảy một nhịp (`.count-bump`) và một vùng `role="status"` ẩn đọc "Đã thêm … vào giỏ" cho trình đọc màn hình. Không dùng toast.

## Bottom sheet

- Sheet trên màn khách là `<dialog>` gốc mở bằng `showModal()`: trình duyệt lo focus trap, Esc và backdrop. **Không dùng Radix Dialog hay thư viện overlay trên route khách**, vì ngân sách JS route khách là 120 KB gzip (`make size`).
- Sheet chỉ mount khi mở. Khi đóng (Esc, bấm nền, nút Đóng) sheet trượt xuống rồi mới báo `onOpenChange(false)`; khi giảm chuyển động thì đóng ngay. Trong lúc trượt, nội dung là `inert` nên không bấm thêm được. Đóng xong, focus trở về nút đã mở sheet.
- Mỗi sheet có tiêu đề (`aria-labelledby`), nút Đóng 44 px có `aria-label`.

## Thương hiệu

- Dòng thương hiệu (`CustomerBrand`) đứng đầu mọi màn khách: chấm gradient, tên người bán màu navy, kèm nơi đang ngồi (quán · bàn) nếu có. Tên lấy từ `VITE_SELLER_NAME` lúc build ([`seller.ts`](../apps/web/src/shared/lib/seller.ts)); chưa có logo nên đây là dấu chữ.
- `theme-color` trong `index.html` là navy `--navy-700`; đổi màu chính thì đổi cả hai chỗ.
- Thẻ chia sẻ (`public/og-image.png`, 1200 × 630) được vẽ từ HTML bằng [`scripts/render-og-image.mjs`](../apps/web/scripts/render-og-image.mjs); cách chạy lại ở [runbook](./runbook.md#bot-tìm-kiếm-và-thẻ-chia-sẻ).
- `index.html` có khung tĩnh trong `#root` (inline style, không inline script vì CSP `script-src 'self'`) để lần vẽ đầu không trắng.

## Tiêu đề tab và lập chỉ mục

- Mỗi route và mỗi trạng thái (đang tải, lỗi, có dữ liệu) có tiêu đề riêng qua `useDocumentHead`. Chỉ **page** gọi hook và tự tính tiêu đề cho mọi trạng thái; component con không gọi, vì effect của con chạy trước cha và sẽ bị ghi đè.
- Route theo token (`/t/`, `/o/`, `/revoked`) truyền `noindex: true`. Đây là lớp dự phòng; lớp chính là header `X-Robots-Tag` từ nginx (xem [review.md](./review.md#không-lập-chỉ-mục-route-theo-token)).

## Giọng văn

Tiếng Việt ngắn, thân thiện, nói kết quả trước, xưng "bạn" với khách và "quán" cho bên pha.

| Thay vì | Viết |
|---------|------|
| "Đã nhận" | "Quán đang pha, nước tới khoảng 10:17" |
| "Số điện thoại (không bắt buộc) để nhận thông báo…" | "Nhận tin Zalo khi nước sắp tới. Bỏ trống nếu không cần." |
| "Không tìm thấy" | "Quét lại mã QR trên bàn" |

- Mỗi màn lỗi hoặc ngõ cụt phải có bước tiếp theo: một hành động ("Thử lại", "Gọi thêm nước") hoặc một chỉ dẫn ("Quét mã QR trên bàn").
- Không hứa một giờ đã qua: quá giờ dự kiến mà quán chưa mang ra thì câu trạng thái là "Quán đang pha, sắp xong".
- Màn đơn nói rõ khách có cần giữ trang mở không ("Bạn sẽ nhận tin Zalo khi trạng thái đổi, có thể đóng trang này." hoặc "Giữ trang này mở để theo dõi đơn.").
- Không có ảnh sản phẩm trong cả menu thì không vẽ ô ảnh; chỉ khi một số món có ảnh mới dùng ô chữ cái làm chỗ trống.

## Màn người bán

Màn người bán (`/seller/*`) dùng chung token, phần "Màu và hình khối" và "Chuyển động" ở trên. Người bán dùng điện thoại vừa cầm ly vừa bấm, nên các quy tắc dưới đây ưu tiên chạm nhanh và không phải cuộn ngang. Cách rà nằm ở [review.md](./review.md#màn-người-bán).

- **Đích chạm chia hai mức.** Điều khiển phục vụ (bảng đơn, chi tiết đơn, nút trong hộp thoại, nút Đóng của dialog và sheet, nút menu, âm báo) ≥ 44 px dưới `lg`, viết bằng `h-11`, `size-11` hoặc `max-lg:h-11`. Trang quản trị (món, quán, cài đặt, báo cáo) ≥ 24 px; nhãn của checkbox và switch thêm `min-h-6` để vùng bấm gồm cả chữ.
- **Bảng không cuộn ngang trên điện thoại.** Dùng `<Table stacked>` ([`table.tsx`](../apps/web/src/shared/ui/table.tsx)): dưới `sm` mỗi hàng thành một khối lưới và hàng tiêu đề bị ẩn. Page tự đặt khuôn lưới cho hàng (`max-sm:grid-cols-…`) và vị trí từng ô (`max-sm:col-span-…`, `max-sm:row-start-…`). Ô số cần nhãn hiện rõ (`sm:hidden`) vì tiêu đề cột đã ẩn. Từ `sm` tới `lg`, tiêu đề cột được xuống dòng (`max-lg:[&_th]:whitespace-normal`) thay vì đẩy bảng tràn.
- **Ô lọc và ô nhập rộng hết hàng dưới `sm`** (`w-full sm:w-52`), không đặt bề rộng cố định.
- **Màu nguy hiểm theo quy tắc chung:** nút mở bước nguy hiểm ("Từ chối", "Không gặp khách", "Thu hồi") là `outline` hoặc `ghost` + `text-destructive`; nút đỏ đặc (`variant="destructive"`) chỉ ở bước xác nhận. Focus đầu tiên trong hộp xác nhận nằm trên nút quay lại ("Quay lại", "Ở lại", "Giữ lại").
- **Header một hàng trên điện thoại**, cao ≤ 64 px. Dưới `lg`, điều hướng và "Đăng xuất" nằm trong menu trượt (`Sheet`) mở bằng nút "Mở menu"; công tắc "Nhận đơn" và âm báo luôn ở trên header. Đăng xuất ở mọi bề rộng đều hỏi lại, vì sau đó màn thôi báo đơn mới.
- **Chỉ có một công tắc "Nhận đơn"**, trên header. Trang Cài đặt chỉ hiện trạng thái và chỉ về header; e2e cũng dựa vào việc chỉ có một switch.
- **Bảng đơn dưới `lg` chỉ hiện một cột**, chọn bằng nhóm nút "Chọn cột" có chấm đỏ báo cột có đơn mới hoặc trễ. Lần tải đầu mở cột có đơn trễ lâu nhất. Bảng đơn rộng tối đa `max-w-7xl` để mỗi thẻ đủ chỗ cho ba nút giao; trang quản trị dùng `max-w-5xl`.
- **Tiêu đề tab có dạng "<Trang> — Gọi nước"** (ví dụ "Món — Gọi nước", "Đơn #ABC123 — Gọi nước"); bảng đơn thêm số đơn đang mở ở đầu, "(4) Bảng đơn — Gọi nước". Mỗi route có một `h1`; bảng đơn dùng `h1` ẩn (`sr-only`). Route `/seller` không lập chỉ mục nhờ header nginx (xem [review.md](./review.md#không-lập-chỉ-mục-route-theo-token)).
- **Hộp thoại trả focus về nút đã mở nó.** Radix chỉ trả focus về Trigger của nó, nên `DialogContent` và `AlertDialogContent` dùng [`useReturnFocus`](../apps/web/src/shared/hooks/use-return-focus.ts) để ghi lại phần tử có focus lúc mở và trả về đó khi đóng. Hộp mở bằng state không cần làm gì thêm. Nếu nút đã mở hộp bị gỡ khỏi trang (ví dụ sau khi thu hồi mã), focus rơi về `<body>` như mặc định của Radix.
- Hiệu ứng lặp (nút âm báo nhấp nháy khi trình duyệt chặn âm thanh) viết `motion-safe:animate-pulse`.
