-- Không nạp menu mặc định: mỗi khách hàng có DB riêng và bắt đầu với menu trống, người bán tự thêm món
-- qua trang quản trị. Bản cũ của migration này từng nạp 18 món; DB đã chạy nó giữ nguyên các món đó
-- (golang-migrate chỉ ghi số phiên bản, không chạy lại). Menu mẫu cho dev/E2E nằm trong lệnh `api seed`.
SELECT 1;
