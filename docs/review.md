# Rà soát UX/AX màn khách

Dùng khi đổi giao diện hoặc route của khách, trước khi merge. Quy tắc thiết kế được chấm ở đây nằm trong [design.md](./design.md).

## Thang chấm

Mỗi mục chấm 0–3, có bằng chứng là ảnh chụp hoặc dòng code. 0 = thiếu hẳn, 1 = có nhưng hỏng rõ, 2 = ổn còn lỗ hổng nhỏ, 3 = không còn lỗ hổng đáng kể.

| Mục | Câu hỏi |
|-----|---------|
| Ấn tượng đầu | Trong vài giây khách biết mình đang ở đâu (quán, bàn), giao trong bao lâu, trả tiền thế nào chưa? Lần vẽ đầu có trắng không? |
| Nhận diện thương hiệu | Ảnh chụp cắt riêng một màn có nhận ra người bán không (dòng thương hiệu, `theme-color`, thẻ chia sẻ)? |
| Sức nặng nội dung | Chữ ngắn, nói kết quả trước, đúng giọng văn trong design.md chưa? |
| Rõ ràng và thứ bậc | Mỗi màn có đúng một hành động chính; điều khách cần nhất (trạng thái đơn) là to nhất chưa? |
| Mạch câu chuyện | Hành trình có điểm kết: trạng thái có thời gian, lời cảm ơn, "Gọi thêm nước"; màn lỗi có bước tiếp? |
| Hiểu biết và tin cậy | Khách biết sẽ nhận tin Zalo hay phải giữ trang mở; hành động huỷ có bước xác nhận? |
| Chuyển động | Sheet và thêm món có phản hồi chuyển động; tắt hết khi giảm chuyển động? |
| Đáp ứng bề rộng | Không tràn ngang, không cắt chữ, không chồng lớp ở cả bốn khung nhìn; nhãn chọn không xuống dòng ở 320 px? |
| Trợ năng | Đích chạm ≥ 44 px, chữ ô nhập ≥ 16 px, tiêu đề tab riêng, focus trap và trả focus, vùng `aria-live`, tương phản AA? |
| Cảm giác tốc độ | Có khung tĩnh và skeleton; Lighthouse trên bản build có LCP, CLS ≤ 0.1; `make size` đạt? |

Không mục nào được tụt điểm so với lần rà trước. Báo cáo các lần rà nằm trong `plans/reports/` (lần đầu: `enhance-ux-ax-261002-1512-customer-mobile.md`).

## Khung nhìn

Chụp mọi màn khách đã đổi ở 1440 × 900, 768 × 1024, 375 × 812 và 320 × 640. Khung 320 px bắt lỗi nhãn xuống dòng và tràn ngang; 768 px trở lên bắt lỗi chữ ô nhập tụt cỡ.

## Script chụp và đo

[`apps/web/scripts/capture-customer-audit.mjs`](../apps/web/scripts/capture-customer-audit.mjs) dùng Chromium của `@playwright/test`, đi qua `/`, một route không tồn tại, `/t/DEVTEST001` (menu, sheet món, giỏ với SĐT sai, sau khi thêm món), một mã QR sai, `/revoked` và `/o/<id>` cho từng trạng thái đơn, ở cả bốn khung nhìn. Nó lưu ảnh PNG và `audit.json` ghi cho từng màn:

- điều khiển nhỏ hơn 44 × 44 px;
- ô nhập có `font-size` dưới 16 px;
- `document.title`;
- tràn ngang (`scrollWidth > clientWidth`);
- nội dung `meta[name=robots]`.

Chạy trên dữ liệu giả (MSW), không cần API:

```sh
cd apps/web
VITE_USE_MOCK=1 pnpm dev                       # terminal 1, cổng 5173
node scripts/capture-customer-audit.mjs http://localhost:5173 ../../plans/reports/<tên-báo-cáo>/round-N
```

Đạt khi `audit.json` không có đích chạm dưới 44 px, không có ô nhập dưới 16 px, không tràn ngang, mỗi route một tiêu đề, và `noindex` có trên `/t/`, `/o/`, `/revoked`. Sau đó xem ảnh bằng mắt: không có lỗi nặng (tràn, cắt, chồng lớp, ảnh vỡ). Tắt dev server khi xong.

Kiểm thêm bằng tay hoặc Playwright (`reducedMotion: "reduce"`): `animation-name` của phần tử pulse là `none`, sheet mở và đóng không có transition. Chỉ dùng bàn phím: "Thêm" mở sheet, focus không thoát khỏi sheet, Esc đóng và focus trở về nút đã mở; huỷ đơn hai bước chạy được bằng bàn phím, và Enter hai lần trên "Huỷ đơn" không huỷ (focus sang "Không huỷ").

## Bản build và Lighthouse

Script trên chạy bản dev. Header nginx, robots/sitemap và Lighthouse cần bản build thật: dựng profile `full` (web ở `:8081`, cần cổng 5432 trống) như trong `make e2e`, với `VITE_PUBLIC_ORIGIN=http://localhost:8081` để có `og:image` tuyệt đối. Chạy Lighthouse preset mobile cho `/t/DEVTEST001` và `/o/<id>`; ghi Performance, Accessibility, Best Practices, SEO, LCP và CLS.

Cổng 5432 đang bị dự án khác giữ thì không dừng nó; thêm một file override cho compose, đổi cổng Postgres ra máy:

```yaml
services:
  postgres:
    ports: !override
      - "127.0.0.1:55501:5432"
```

rồi chạy `docker compose -f infra/docker-compose.yml -f <override> --profile full up -d --build --wait` và các bước còn lại của `make e2e` (bỏ `E2E_DATABASE_URL` để fixture dùng `docker compose exec postgres psql`). Xong thì `down` như `make e2e`.

## Bề mặt khám phá

Quét bằng `check-discovery-surfaces.mjs` của skill `ak-enhance-ux-ax` (cài trong `.claude/skills/`, không nằm trong git):

```sh
node .claude/skills/ak-enhance-ux-ax/scripts/check-discovery-surfaces.mjs http://localhost:8081
```

Đạt khi thoát mã 0 và chỉ còn các cảnh báo đã chấp nhận dưới đây.

Riêng khi quét `http://localhost:8081`, script báo một lỗi `[sitemap] https://localhost/sitemap.xml` và thoát mã 1. Đó là do `nginx.conf` ghi cứng `https://$host` (production luôn sau TLS) nên ở máy dev mất cổng và scheme, không phải lỗi thật. Kiểm thay bằng Host của production:

```sh
curl -s -H 'Host: <tên-miền>' http://localhost:8081/robots.txt
curl -s -H 'Host: <tên-miền>' http://localhost:8081/sitemap.xml
```

| Cảnh báo được chấp nhận | Lý do |
|-------------------------|-------|
| Không có `llms.txt`, `llms-full.txt`, bản markdown, markdown alternate, content negotiation | Không có nội dung công khai dài; các tệp này không giúp xếp hạng |
| Không có JSON-LD | Không có trang thực thể công khai; xem lại `Organization` nếu `/` thành trang thương hiệu |
| HTML phía server gần rỗng (không SSR) | Trang theo token không được lập chỉ mục; `/` chỉ là một trang ngắn có khung tĩnh |
| Không chặn riêng từng bot | Chính sách crawler là quyết định của chủ sản phẩm |

## Không lập chỉ mục route theo token

`/t/:token` và `/o/:id` gắn với một bàn thật và một đơn của khách; chúng không bao giờ được lên kết quả tìm kiếm.

- [`apps/web/nginx.conf`](../apps/web/nginx.conf) gửi `X-Robots-Tag: noindex, nofollow` cho `/t/`, `/o/`, `/seller` và `/revoked`, và trả `robots.txt`, `sitemap.xml` thật (sitemap chỉ có `/`). `robots.txt` **không** `Disallow` các route đó, để bot đọc được header `noindex`.
- Page tương ứng gọi `useDocumentHead({ noindex: true })` làm lớp dự phòng khi trang chạy sau một proxy khác.
- Thêm route khách mới: quyết định nó có được lập chỉ mục không, rồi sửa regex trong `nginx.conf`, sitemap và page cùng lúc. Kiểm bằng `curl -sI <host>/<route>`.
