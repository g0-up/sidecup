-- Một tài khoản Zalo cá nhân gửi tin cho cả deployment (một người bán). encrypted_credentials là
-- IMEI + cookie phiên Zalo = toàn quyền tài khoản, nên chỉ lưu bản mã hoá AES-GCM (ZALO_CREDENTIAL_KEY).
-- Không soft delete: ngắt kết nối là xoá hàng.
CREATE TABLE zalo_account (
    id                    smallint PRIMARY KEY CHECK (id = 1),
    encrypted_credentials bytea       NOT NULL,
    zalo_uid              text,
    display_name          text,
    status                text        NOT NULL CHECK (status IN ('linked', 'expired')),
    consent_version       text        NOT NULL,
    consent_at            timestamptz NOT NULL,
    linked_at             timestamptz NOT NULL,
    last_verified_at      timestamptz,
    updated_at            timestamptz NOT NULL DEFAULT now()
);
