ALTER TABLE inventory_batches
    ADD COLUMN IF NOT EXISTS expiry_alert_days INT NOT NULL DEFAULT 30,
    ADD COLUMN IF NOT EXISTS expiry_action_status VARCHAR(40) NOT NULL DEFAULT 'Not Reviewed',
    ADD COLUMN IF NOT EXISTS expiry_quarantined_storage_qty INT NOT NULL DEFAULT 0;

UPDATE inventory_batches ib
INNER JOIN product_inventory pi ON pi.inventory_id = ib.legacy_inventory_id
SET ib.expiry_alert_days = pi.expiry_alert_days
WHERE pi.expiry_alert_days IN (30, 60);

ALTER TABLE product_selling_stock
    ADD COLUMN IF NOT EXISTS expiry_quarantined_qty INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS inventory_expiry_alert_notifications (
    notification_id CHAR(36) NOT NULL DEFAULT (UUID()),
    batch_id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (notification_id),
    UNIQUE KEY uq_expiry_alert_batch_user (batch_id, user_id),
    KEY idx_expiry_alert_user_read (user_id, read_at),
    CONSTRAINT fk_expiry_alert_batch FOREIGN KEY (batch_id) REFERENCES inventory_batches (batch_id) ON DELETE CASCADE,
    CONSTRAINT fk_expiry_alert_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
