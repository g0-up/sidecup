ALTER TABLE orders ADD COLUMN recipient_address text CHECK (length(recipient_address) <= 200);
