-- Danh sách "Tất cả đơn" lọc theo lúc đặt mọi trạng thái và phân trang theo (created_at, id).
CREATE INDEX orders_created_at_id_idx ON orders (created_at DESC, id DESC);
