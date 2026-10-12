CREATE TABLE IF NOT EXISTS inventory_report_daily_snapshots (
    snapshot_date DATE NOT NULL,
    filter_hash CHAR(64) NOT NULL,
    metric_key VARCHAR(80) NOT NULL,
    metric_value DECIMAL(24,4) NOT NULL DEFAULT 0,
    captured_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (snapshot_date, filter_hash, metric_key),
    KEY idx_inventory_report_snapshot_lookup (filter_hash, metric_key, snapshot_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
