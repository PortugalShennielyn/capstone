CREATE TABLE IF NOT EXISTS cashier_shifts (
    shift_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    cashier_id CHAR(36) NOT NULL,
    active_cashier_id CHAR(36) NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'open',
    opening_cash DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    expected_cash DECIMAL(12,2) NULL,
    actual_cash DECIMAL(12,2) NULL,
    cash_variance DECIMAL(12,2) NULL,
    variance_remarks VARCHAR(500) NULL,
    opened_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (shift_id),
    UNIQUE KEY uq_cashier_shifts_active_cashier (active_cashier_id),
    KEY idx_cashier_shifts_cashier_opened (cashier_id, opened_at),
    KEY idx_cashier_shifts_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cashier_shift_transactions (
    order_id INT NOT NULL,
    shift_id BIGINT UNSIGNED NOT NULL,
    cashier_id CHAR(36) NOT NULL,
    assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (order_id),
    KEY idx_cashier_shift_transactions_shift (shift_id),
    KEY idx_cashier_shift_transactions_cashier (cashier_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
