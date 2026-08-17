ALTER TABLE users
    MODIFY role ENUM('super_admin','admin','manager','supervisor','cashier','salesclerk')
    NOT NULL DEFAULT 'salesclerk';

INSERT INTO roles (role_id, role_identifier, name, description, is_system)
SELECT UUID(), 'ro-supervisor', 'Supervisor',
       'Reviews purchase requests and monitors inventory, expiry, and reports.', 1
WHERE NOT EXISTS (
    SELECT 1 FROM roles WHERE role_identifier = 'ro-supervisor'
);

CREATE TABLE IF NOT EXISTS purchase_requests (
    pr_id CHAR(36) NOT NULL DEFAULT (UUID()),
    pr_number VARCHAR(40) NOT NULL,
    requested_by CHAR(36) NOT NULL,
    request_date DATE NOT NULL,
    status ENUM('Draft','Pending Supervisor Approval','Approved','Revision Requested','Rejected')
        NOT NULL DEFAULT 'Draft',
    supervisor_user_id CHAR(36) NULL,
    submitted_at DATETIME NULL,
    decided_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (pr_id),
    UNIQUE KEY uniq_purchase_requests_number (pr_number),
    KEY idx_purchase_requests_status_date (status, request_date),
    KEY idx_purchase_requests_requester (requested_by),
    KEY idx_purchase_requests_supervisor (supervisor_user_id),
    CONSTRAINT fk_purchase_requests_requester FOREIGN KEY (requested_by) REFERENCES users (user_id),
    CONSTRAINT fk_purchase_requests_supervisor FOREIGN KEY (supervisor_user_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS purchase_request_items (
    pr_item_id CHAR(36) NOT NULL DEFAULT (UUID()),
    pr_id CHAR(36) NOT NULL,
    product_id CHAR(36) NOT NULL,
    stock_qty_at_request DECIMAL(12,2) NOT NULL DEFAULT 0,
    requested_qty DECIMAL(12,2) NOT NULL,
    unit_label_at_request VARCHAR(80) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (pr_item_id),
    UNIQUE KEY uniq_purchase_request_product (pr_id, product_id),
    KEY idx_purchase_request_items_product (product_id),
    CONSTRAINT fk_purchase_request_items_request FOREIGN KEY (pr_id)
        REFERENCES purchase_requests (pr_id) ON DELETE CASCADE,
    CONSTRAINT fk_purchase_request_items_product FOREIGN KEY (product_id)
        REFERENCES product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
