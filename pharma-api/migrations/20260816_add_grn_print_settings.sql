ALTER TABLE system_settings
    ADD COLUMN IF NOT EXISTS grn_received_by_name VARCHAR(150) NULL AFTER receipt_footer,
    ADD COLUMN IF NOT EXISTS grn_approved_by_name VARCHAR(150) NULL AFTER grn_received_by_name;
