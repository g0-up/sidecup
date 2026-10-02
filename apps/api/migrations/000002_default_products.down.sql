-- Chỉ xoá các món mặc định theo id cố định; món người bán tự tạo không bị đụng.
-- Đơn cũ không mất gì vì orders.items đã ghi cứng tên và giá.
WITH ids (id) AS (
    SELECT ('00000000-0000-4000-a000-000000000' || n)::uuid
    FROM unnest(ARRAY['101','102','103','104','201','202','203','301','302','303','304',
                      '401','402','501','502','503','601','602']) AS n
), unhide AS (
    DELETE FROM partner_hidden_products WHERE product_id IN (SELECT id FROM ids)
)
DELETE FROM products WHERE id IN (SELECT id FROM ids);
