# Nghiệm thu P0

Đối chiếu từng tiêu chí P0 trong [`prd.md`](../prd.md) với bằng chứng. Cập nhật lần cuối: 01/10/2026.

- **Tự động**: tên test; chạy bằng `make test` (Go unit + integration, vitest) hoặc `make e2e` (Playwright, Chromium + WebKit).
- **Tay**: bước kiểm trên thiết bị thật; ghi kết quả và ngày khi làm. "CHƯA KIỂM" nghĩa là cần thiết bị, tài khoản ngân hàng hoặc mạng thật mà môi trường phát triển chưa có.
- Viết tắt: `app/` = `apps/api/internal/app/*_integration_test.go`; `e2e/` = `apps/web/e2e/*.spec.ts`; `web/` = `apps/web/src/**/*.test.ts(x)`.

Kết quả ngày 01/10/2026: Go 15 package xanh (`-race -tags integration`, Postgres 14 cục bộ); vitest 92/92; `make e2e` (Postgres 16 + api + web/nginx trong container) 20/20 (10 spec × Chromium, WebKit); golangci-lint, eslint, tsc sạch; gitleaks không còn phát hiện trong `apps/` và `infra/`.

## P0-1. Mã QR theo bàn

| Tiêu chí | Bằng chứng |
|----------|-----------|
| Link `https://<tên miền>/t/<mã>`, mã ≥ 8 ký tự ngẫu nhiên, không chứa quán/bàn | Tự động: `app/TestQRCodesCreateAndRevoke` (URL khớp `/t/[A-HJ-NP-Z2-9]{12}`), `platform/ids/TestTokensUseAlphabetAndLength`; schema `CHECK (length(token) >= 8)` |
| Tạo mã cho bàn mới, tải ảnh kèm tên quán và số bàn | Tự động: `web/admin-partners` (`QrPrintCard` render đúng URL/nhãn). Tay: tải PNG trên Chrome và Safari iOS, in A6 — CHƯA KIỂM |
| Thu hồi mã; quét mã thu hồi hiện "Mã này không còn dùng", không cho đặt | Tự động: `e2e/revoked-qr.spec.ts`, `app/TestQRCodesCreateAndRevoke` (410), `app/TestCreateOrderRejections` (409 `QR_REVOKED`) |
| Đổi giao diện/hạ tầng không làm đổi link đã in | Thiết kế: link chỉ gồm `PUBLIC_BASE_URL` + token lưu DB; token không bao giờ bị xoá (chỉ `active=false`) |

## P0-2. Trang menu theo quán

| Tiêu chí | Bằng chứng |
|----------|-----------|
| Tên bàn, tên quán, thời gian giao, "Trả tiền khi nhận…" | Tự động: `web/customer-menu/page.test.tsx`, `e2e/happy-path.spec.ts` |
| Món ẩn của quán không xuất hiện | Tự động: `app/TestMenuFiltersHiddenAndRecordsPageViews`, `app/TestSettingsUpdatePublishesToSellerAndMenu` |
| Món hết hiện mờ "Hết món", không chọn được | Tự động: `web/customer-menu/page.test.tsx`, `app/TestMenuFiltersHiddenAndRecordsPageViews` |
| Ngoài giờ bán / tạm ngưng: xem được menu, nút đặt khoá kèm lý do | Tự động: `e2e/paused.spec.ts`, `web/ordering-banner.test.tsx`, `menu/TestOrderingGate` (nhiều khung, qua nửa đêm, APP_TZ), `app/TestCreateOrderRejections` |
| Chân trang: đồ uống do người bán pha, không phải của quán | Tự động: `web/customer-menu/page.test.tsx` |
| Ghi nhận mỗi lần mở theo bàn, theo ngày, không lưu thông tin cá nhân | Tự động: `app/TestMenuFiltersHiddenAndRecordsPageViews` (dedupe theo ngày + `client_id` UUID), `app/TestFunnelCountsDistinctDevices` |

## P0-3. Chọn món và giỏ

| Tiêu chí | Bằng chứng |
|----------|-----------|
| Độ ngọt/đá theo món, mặc định Vừa / Bình thường | Tự động: `orders/TestMergeLinesMergesSameOptionsAndDefaults`, `TestMergeLinesRejectsOptionsOnUnsupportedProduct` |
| 1..20 ly mỗi dòng, gộp dòng cùng món + tuỳ chọn | Tự động: `web/customer-menu/cart.test.ts`, `orders/TestMergeLinesQtyLimitAppliesAfterMerge`, `app/TestCreateOrderPricesMergesAndIsIdempotent` |
| Ghi chú ≤ 200 ký tự, không bắt buộc | Tự động: schema `CHECK (length(note) <= 200)`, validate `max=200`; ô nhập `maxLength=200` có đếm ký tự |
| Giỏ hiện tổng; món vừa hết trong giỏ bị đánh dấu và chặn đặt | Tự động: `e2e/unavailable-product.spec.ts`, `web/customer-menu/page.test.tsx` |

## P0-4. Đặt đơn không bị trùng

| Tiêu chí | Bằng chứng |
|----------|-----------|
| Nhiều yêu cầu cùng mã chống trùng → một đơn, các yêu cầu sau nhận lại đơn đó | Tự động: `app/TestCreateOrderConcurrentSameKeyMakesOneOrder` (10 goroutine: 1×201, 9×200, 1 dòng DB), `e2e/idempotent-double-submit.spec.ts` (bấm đúp; mất phản hồi + tải lại trang dùng cùng key), `web/customer-menu/submit.test.ts` |
| Đơn ghi cứng quán, bàn, tên món, giá | Tự động: `orders/TestWriterInsertIsIdempotent`; schema lưu `partner_name`, `table_label`, `items` JSON tại lúc đặt |
| Từ chối khi mã thu hồi, ngoài giờ, tạm ngưng, món hết, kèm thông báo dễ hiểu | Tự động: `app/TestCreateOrderRejections` (`QR_REVOKED`, `OUTSIDE_HOURS`, `PAUSED`, `PRODUCT_UNAVAILABLE`, 422 phone/qty/tuỳ chọn) |

## P0-5. Báo đơn mới cho người bán qua Zalo

| Tiêu chí | Bằng chứng |
|----------|-----------|
| Tin Zalo ≤ 10 giây sau khi tạo đơn, gồm mã, quán, bàn, món, tổng, link | Phần trong repo: outbox `seller_new_order` ghi cùng transaction (`app/TestCreateOrderPricesMergesAndIsIdempotent`), payload có `seller_url` (`app/TestOutboxClaimSoftLockAndAck`). Gửi tin thật thuộc dịch vụ notifier (ngoài phạm vi plan) — CHƯA KIỂM |
| Mọi thao tác trên màn người bán; tin Zalo chỉ để báo | Thiết kế: API nội bộ chỉ có pending/ack/heartbeat |
| Màn người bán kêu chuông khi có đơn mới | Tự động: `web/seller-orders/store.test.ts` (đơn mới → chưa xem, lần tải đầu và resync không kêu trùng), `web/seller-orders/pages/board.test.tsx` (resync sau mất kết nối hiện đơn mới, gỡ đơn đã đóng). Tay: âm báo trên Safari iOS/iPad sau một chạm "Bật âm báo"; để mở 2 giờ — CHƯA KIỂM |
| Thử lại; sau 3 lần lỗi hoặc phiên Zalo hết hạn → cảnh báo đỏ | Tự động: `app/TestOutboxFailsAfterThreeAttemptsAndAlertsSeller` (backoff, `failed`, WS `notifier.status`), `app/TestHeartbeatAndStatus` (quá 90 giây, `session_ok=false`), `notifications/TestBackoffDoublesFrom30Seconds` |
| Tài khoản gửi tin là tài khoản Zalo phụ | Vận hành (dịch vụ notifier) — CHƯA KIỂM |

## P0-6. Người bán cập nhật trạng thái đơn

| Tiêu chí | Bằng chứng |
|----------|-----------|
| Nút theo từng bước | Tự động: `web/seller-orders/store.test.ts` (`actionsFor`), `e2e/happy-path.spec.ts`, `e2e/reject.spec.ts` |
| Chỉ chuyển hợp lệ; hai người bấm cùng lúc → người sau thấy đơn đã đổi | Tự động: `orders/TestCanTransitionFullTable`, `app/TestConcurrentSellerTransitionsOneWins` (200 + 409 `current_status`, 1 event), `orders/TestConcurrentTransitionOnlyOneWins`, `web/seller-orders/pages/board.test.tsx` (409 → báo + tải lại) |
| Lưu thời điểm và người bấm | Tự động: `app/TestSchedulerCancelsExpiredSentOrders` (event `system`), `app/TestConcurrentSellerTransitionsOneWins`; bảng `order_events(actor, at)` |

## P0-7. Trang trạng thái cho khách

| Tiêu chí | Bằng chứng |
|----------|-----------|
| Mã đơn, món, tổng, thanh 4 bước | Tự động: `e2e/happy-path.spec.ts` |
| Tự cập nhật ≤ 10 giây không tải lại | Tự động: `e2e/happy-path.spec.ts` (WebSocket), `e2e/realtime-fallback.spec.ts` (chặn `/ws`, polling 15 giây), `web/socket-controller.test.ts` |
| Quá 60 giây ở Đã gửi: "Chờ thêm" và "Huỷ đơn" | Tự động: `e2e/unconfirmed-prompt.spec.ts`, `web/customer-order/timing.test.ts` (tính theo `server_time`, đồng hồ máy khách lệch 1 giờ) |
| Chỉ huỷ khi còn Đã gửi | Tự động: `app/TestCustomerGetAndCancel` (403 máy khác, 409 lần hai), `e2e/customer-cancel.spec.ts` |
| Quét lại cùng bàn trong ngày thấy lối vào đơn đang chạy | Tự động: `app/TestMenuFiltersHiddenAndRecordsPageViews` (`my_orders`). Tay: đóng tab, quét lại trên Zalo webview — CHƯA KIỂM |
| Tự huỷ sau 5 phút | Tự động: `app/TestSchedulerCancelsExpiredSentOrders` (đồng hồ giả 4:59 → không huỷ, 5:01 → huỷ `timeout`, outbox báo khách) |

## P0-8. Thanh toán khi nhận

| Tiêu chí | Bằng chứng |
|----------|-----------|
| VietQR có số tiền và nội dung là mã đơn | Tự động: `vietqr/TestPayloadStructure`, `TestCRC16StandardVector`, `TestPayloadGoldenVector`, `app/TestVietQREndpoint`. Tay: quét bằng app ngân hàng thật thấy đúng số tiền và nội dung — CHƯA KIỂM (bắt buộc trước khi chạy thử) |
| Xác nhận đã nhận tiền bằng tay; ghi phương thức | Tự động: `app/TestSellerFlowToPaidStoresCommissionAndIsImmutable` (thiếu `payment_method` → 422), `e2e/happy-path.spec.ts` (tiền mặt) |

## P0-9. Báo cáo hoa hồng

| Tiêu chí | Bằng chứng |
|----------|-----------|
| Theo quán + tổng: đơn đã thu, doanh thu, không giao được, hoa hồng; theo ngày / khoảng / kỳ | Tự động: `app/TestCommissionReportMatchesFixture` (3 paid, 1 failed, điều chỉnh −5.000 → `net=15250`; kỳ tuần và tháng), `reports/TestResolveWeek`, `TestResolveMonth`, `TestParseRange`, `web/admin-reports` (`period.ts`) |
| Chỉ tính đơn `paid`, theo tỷ lệ từng quán | Tự động: `app/TestCommissionReportMatchesFixture` (đổi tỷ lệ sau khi thu không đổi số đã ghi), `orders/TestCommissionRounding` |
| Đơn đã thu không sửa/xoá; điều chỉnh có lý do | Tự động: `orders/TestPaidOrderCannotBeChangedThroughWriterOrORM`, `TestUpdateWhereStatusRejectsPaidWithoutTouchingDB`, `app/TestSellerFlowToPaidStoresCommissionAndIsImmutable`, `app/TestAdjustments`, `db/TestSchemaHasNoTriggersOrFunctions` |
| Xuất bản tóm tắt theo một quán | Tự động: `app/TestCommissionExportHasNoPhone`, `reports/TestExportTextMatchesSample`. Tay: dán bản sao chép vào Zalo — CHƯA KIỂM |

## P0-10. Trang quản trị cho người bán

| Tiêu chí | Bằng chứng |
|----------|-----------|
| Đăng nhập bằng mật khẩu | Tự động: `auth/TestLoginFlow`, `TestLoginRateLimitedAfterFiveAttempts`, `app/TestSellerAuthFlow`, `web/seller-auth/next.test.ts` (chống open redirect) |
| Bật/tắt món hiện trên menu khách ≤ 10 giây | Tự động: `e2e/unavailable-product.spec.ts` (qua WebSocket), `web/admin-products` (công tắc optimistic + rollback) |
| Công tắc "Tạm ngưng nhận đơn" cho mọi quán | Tự động: `e2e/paused.spec.ts`, `app/TestSettingsUpdatePublishesToSellerAndMenu` |
| Quản lý quán (giờ bán, hoa hồng, kỳ, món ẩn), bàn, mã QR | Tự động: `app/TestProductsAndPartnersCRUD`, `app/TestQRCodesCreateAndRevoke`, `partners/TestOpenHours*`, `web/admin-partners` (`open-hours.ts`) |

## P0-11. Số điện thoại và tin trạng thái cho khách

| Tiêu chí | Bằng chứng |
|----------|-----------|
| Ô SĐT bắt buộc, kiểm định dạng, báo lỗi dưới ô | Tự động: `web/shared/lib/phone.test.ts`, `web/customer-menu/page.test.tsx` (nút khoá tới khi SĐT hợp lệ), `app/TestCreateOrderRejections` (422 `phone`) |
| Dòng "Chỉ dùng để báo trạng thái đơn qua Zalo" | Code: `apps/web/src/features/customer-menu/components/cart-sheet.tsx` |
| Nhớ số đã nhập | Tự động: `web/customer-menu/page.test.tsx` (`localStorage.sc_phone`) |
| Tin khi Đang pha, Đang mang ra, Đã thu tiền, Quán từ chối, Huỷ do quá hạn | Tự động: `app/TestSellerFlowToPaidStoresCommissionAndIsImmutable` (outbox `accepted, delivering, paid`), `app/TestSchedulerCancelsExpiredSentOrders`, `app/TestCustomerGetAndCancel` (khách tự huỷ không gửi), `orders/TestNotifiesCustomer`. Gửi thật thuộc notifier — CHƯA KIỂM |
| Gửi lỗi thì ghi log và bỏ qua; đơn vẫn chạy | Tự động: `app/TestOutboxFailsAfterThreeAttemptsAndAlertsSeller` (đơn không bị ảnh hưởng, tin `failed` có `last_error`) |
| Màn người bán hiện SĐT trên từng đơn | Tự động: `web/seller-orders/pages/board.test.tsx` (`tel:` link), `e2e/happy-path.spec.ts` |
| SĐT không có trong báo cáo/export, không xuất ra ngoài | Tự động: `app/TestCommissionExportHasNoPhone`, `app/TestCustomerGetAndCancel` (view công khai), `app/TestRealtimeOrderEvents` (WS khách không có SĐT), `app/TestPurgePhonesAfter90Days` |

## Yêu cầu phi chức năng

| Tiêu chí | Bằng chứng |
|----------|-----------|
| Route khách ≤ 120 KB gzip JS | Tự động: `pnpm size` — `/t/:token` 107,8 KB, `/o/:id` 102,2 KB (01/10/2026) |
| LCP ≤ 2,5 giây trên 4G yếu | Tay: Lighthouse mobile "Slow 4G" trên bản build — CHƯA KIỂM |
| Safari iOS, Chrome Android, trình duyệt nhúng Zalo | Tự động: Playwright WebKit + Chromium (khung iPhone 13). Tay trên thiết bị thật (localStorage, bàn phím số, sheet cuộn, quét QR bằng Zalo) — CHƯA KIỂM |
| Không có bí mật trong repo | Tự động: job `gitleaks` trong `.github/workflows/ci.yml`; `.env*` bị `.gitignore` chặn |
