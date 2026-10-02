-- Menu mặc định: nạp một lần, sau đó người bán tự sửa giá, ẩn món hoặc thêm món qua trang quản trị.
-- Id cố định để bản down chỉ xoá đúng các món này. Bỏ qua món trùng tên với món đã có để không nhân bản
-- trên DB người bán đã tự tạo món. sort đánh theo trăm cho mỗi nhóm để menu phẳng vẫn liền nhóm:
-- 1xx cà phê, 2xx giải khát, 3xx sữa chua, 4xx trái cây, 5xx sinh tố, 6xx sữa.
INSERT INTO products (id, name, price, sort)
SELECT v.id::uuid, v.name, v.price, v.sort
FROM (VALUES
    ('00000000-0000-4000-a000-000000000101', 'Cà phê đen đá',                 35000, 101),
    ('00000000-0000-4000-a000-000000000102', 'Cà phê nâu đá',                 35000, 102),
    ('00000000-0000-4000-a000-000000000103', 'Cà phê muối',                   39000, 103),
    ('00000000-0000-4000-a000-000000000104', 'Bạc xỉu',                       37000, 104),
    ('00000000-0000-4000-a000-000000000201', 'Nước sấu',                      23000, 201),
    ('00000000-0000-4000-a000-000000000202', 'Nước mơ',                       23000, 202),
    ('00000000-0000-4000-a000-000000000203', 'Nước xí muội',                  23000, 203),
    ('00000000-0000-4000-a000-000000000301', 'Sữa chua đánh đá',              31000, 301),
    ('00000000-0000-4000-a000-000000000302', 'Sữa chua cam',                  39000, 302),
    ('00000000-0000-4000-a000-000000000303', 'Sữa chua chanh dây',            39000, 303),
    ('00000000-0000-4000-a000-000000000304', 'Sữa chua cafe',                 39000, 304),
    ('00000000-0000-4000-a000-000000000401', 'Cam tươi',                      28000, 401),
    ('00000000-0000-4000-a000-000000000402', 'Chanh dây',                     33000, 402),
    ('00000000-0000-4000-a000-000000000501', 'Sinh tố bơ',                    45000, 501),
    ('00000000-0000-4000-a000-000000000502', 'Sinh tố mãng cầu',              45000, 502),
    ('00000000-0000-4000-a000-000000000503', 'Sinh tố xoài',                  45000, 503),
    ('00000000-0000-4000-a000-000000000601', 'Sữa tươi trân châu đường đen',  32000, 601),
    ('00000000-0000-4000-a000-000000000602', 'Sữa chuối trân châu đường đen', 38000, 602)
) AS v(id, name, price, sort)
WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.name = v.name)
ON CONFLICT (id) DO NOTHING;
