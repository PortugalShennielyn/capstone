CREATE TABLE IF NOT EXISTS cashier_shift_reconciliations (
    reconciliation_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    cashier_id CHAR(36) NOT NULL,
    shift_date DATE NOT NULL,
    beginning_cash DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    actual_cash DECIMAL(12,2) NULL,
    variance_remarks VARCHAR(500) NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'count_saved',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (reconciliation_id),
    UNIQUE KEY uq_cashier_shift_reconciliation_day (cashier_id, shift_date),
    KEY idx_cashier_shift_reconciliation_date (shift_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
