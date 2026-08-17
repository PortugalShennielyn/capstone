CREATE TABLE IF NOT EXISTS purchase_order_receiving_revisions (
    revision_id CHAR(36) NOT NULL DEFAULT (UUID()),
    receiving_id CHAR(36) NOT NULL,
    edited_by CHAR(36) NULL,
    edited_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    edit_reason VARCHAR(500) NOT NULL,
    before_data LONGTEXT NOT NULL,
    after_data LONGTEXT NOT NULL,
    PRIMARY KEY (revision_id),
    KEY idx_receiving_revisions_receiving_date (receiving_id, edited_at),
    KEY idx_receiving_revisions_editor (edited_by),
    CONSTRAINT fk_receiving_revisions_receiving
        FOREIGN KEY (receiving_id) REFERENCES purchase_order_receiving (receiving_id) ON DELETE CASCADE,
    CONSTRAINT fk_receiving_revisions_editor
        FOREIGN KEY (edited_by) REFERENCES users (user_id) ON DELETE SET NULL,
    CONSTRAINT chk_receiving_revisions_before_json CHECK (JSON_VALID(before_data)),
    CONSTRAINT chk_receiving_revisions_after_json CHECK (JSON_VALID(after_data))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
