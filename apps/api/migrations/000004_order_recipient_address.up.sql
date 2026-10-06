-- Địa chỉ người nhận do khách tự nhập, không bắt buộc. Là dữ liệu cá nhân nên bị xoá cùng SĐT sau 90 ngày.
ALTER TABLE orders ADD COLUMN recipient_address text CHECK (length(recipient_address) <= 200);
