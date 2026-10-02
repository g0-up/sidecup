-- Schema chỉ gồm bảng, CHECK, UNIQUE, FK, DEFAULT và index.
-- Không có trigger hay function: bất biến đơn `paid` và `updated_at` do tầng ứng dụng thực thi (orders.Writer).
-- gen_random_uuid() có sẵn từ PostgreSQL 13, không cần extension.

CREATE TABLE partners (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name            text NOT NULL CHECK (length(btrim(name)) > 0),
    commission_rate numeric(5,4) NOT NULL DEFAULT 0.1500 CHECK (commission_rate BETWEEN 0 AND 1),
    payout_period   text NOT NULL DEFAULT 'week' CHECK (payout_period IN ('week', 'month')),
    -- Nhiều khung giờ theo thứ; days theo ISO: 1 = Thứ Hai … 7 = Chủ Nhật.
    open_hours      jsonb NOT NULL DEFAULT '[{"days":[1,2,3,4,5,6,7],"from":"00:00","to":"23:59"}]'
                    CHECK (jsonb_typeof(open_hours) = 'array'),
    active          boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE products (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name       text NOT NULL CHECK (length(btrim(name)) > 0),
    price      bigint NOT NULL CHECK (price >= 0),
    image_url  text,
    has_sweet  boolean NOT NULL DEFAULT true,
    has_ice    boolean NOT NULL DEFAULT true,
    available  boolean NOT NULL DEFAULT true,
    sort       integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE partner_hidden_products (
    partner_id uuid NOT NULL REFERENCES partners (id),
    product_id uuid NOT NULL REFERENCES products (id),
    PRIMARY KEY (partner_id, product_id)
);

CREATE TABLE qr_codes (
    token       text PRIMARY KEY CHECK (length(token) >= 8),
    partner_id  uuid NOT NULL REFERENCES partners (id),
    table_label text NOT NULL CHECK (length(btrim(table_label)) > 0),
    active      boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    revoked_at  timestamptz
);

CREATE TABLE orders (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code              text NOT NULL UNIQUE,
    -- Ghi cứng lúc tạo: đơn giữ nguyên tên quán, bàn, món, giá dù dữ liệu gốc đổi sau đó.
    qr_token          text NOT NULL,
    partner_id        uuid NOT NULL REFERENCES partners (id),
    partner_name      text NOT NULL,
    table_label       text NOT NULL,
    items             jsonb NOT NULL CHECK (jsonb_typeof(items) = 'array'),
    note              text CHECK (length(note) <= 200),
    total             bigint NOT NULL CHECK (total >= 0),
    -- Luôn 0 ở bản đầu; chỗ sẵn cho khuyến mãi, không phải migrate dữ liệu sau.
    discount_total    bigint NOT NULL DEFAULT 0,
    status            text NOT NULL CHECK (status IN ('sent', 'accepted', 'delivering', 'paid', 'rejected', 'cancelled', 'failed')),
    cancel_reason     text,
    payment_method    text CHECK (payment_method IN ('cash', 'transfer')),
    commission_rate   numeric(5,4),
    commission_amount bigint,
    customer_phone    text,
    client_id         text NOT NULL,
    idempotency_key   text NOT NULL UNIQUE,
    created_at        timestamptz NOT NULL DEFAULT now(),
    accepted_at       timestamptz,
    delivering_at     timestamptz,
    paid_at           timestamptz,
    closed_at         timestamptz,
    updated_at        timestamptz NOT NULL DEFAULT now(),
    CHECK (status <> 'paid' OR (payment_method IS NOT NULL AND commission_rate IS NOT NULL AND commission_amount IS NOT NULL AND paid_at IS NOT NULL))
);

CREATE TABLE order_events (
    id          bigserial PRIMARY KEY,
    order_id    uuid NOT NULL REFERENCES orders (id),
    from_status text,
    to_status   text NOT NULL,
    actor       text NOT NULL CHECK (actor IN ('customer', 'seller', 'system')),
    reason      text,
    at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE adjustments (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id uuid NOT NULL REFERENCES partners (id),
    order_id   uuid REFERENCES orders (id),
    amount     bigint NOT NULL CHECK (amount <> 0),
    reason     text NOT NULL CHECK (length(btrim(reason)) > 0),
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE page_views (
    qr_token      text NOT NULL,
    day           date NOT NULL,
    client_id     text NOT NULL,
    first_seen_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (qr_token, day, client_id)
);

CREATE TABLE settings (
    id                smallint PRIMARY KEY CHECK (id = 1),
    accepting_orders  boolean NOT NULL DEFAULT true,
    eta_minutes       integer NOT NULL DEFAULT 7 CHECK (eta_minutes BETWEEN 1 AND 60),
    bank_bin          text,
    bank_account      text,
    bank_account_name text,
    updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notification_outbox (
    id              bigserial PRIMARY KEY,
    kind            text NOT NULL CHECK (kind IN ('seller_new_order', 'customer_status')),
    order_id        uuid NOT NULL REFERENCES orders (id),
    recipient       text NOT NULL,
    payload         jsonb NOT NULL,
    status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
    attempts        integer NOT NULL DEFAULT 0,
    last_error      text,
    next_attempt_at timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    sent_at         timestamptz
);

CREATE TABLE notifier_heartbeat (
    id           smallint PRIMARY KEY CHECK (id = 1),
    last_seen_at timestamptz,
    session_ok   boolean,
    message      text
);

CREATE INDEX orders_status_created_at_idx ON orders (status, created_at);
CREATE INDEX orders_partner_paid_at_idx ON orders (partner_id, paid_at) WHERE status = 'paid';
CREATE INDEX orders_client_created_at_idx ON orders (client_id, created_at DESC);
CREATE INDEX orders_updated_at_idx ON orders (updated_at);
CREATE INDEX order_events_order_at_idx ON order_events (order_id, at);
CREATE INDEX notification_outbox_pending_idx ON notification_outbox (status, next_attempt_at) WHERE status = 'pending';
CREATE INDEX page_views_day_idx ON page_views (day);
CREATE INDEX qr_codes_partner_idx ON qr_codes (partner_id);
CREATE INDEX adjustments_partner_created_at_idx ON adjustments (partner_id, created_at);

INSERT INTO settings (id) VALUES (1);
INSERT INTO notifier_heartbeat (id) VALUES (1);
