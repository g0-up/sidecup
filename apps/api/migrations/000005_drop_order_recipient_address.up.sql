-- Bỏ tính năng địa chỉ người nhận. Xoá cột thay vì xoá migration 000004 vì các DB đã chạy version 4.
ALTER TABLE orders DROP COLUMN IF EXISTS recipient_address;
