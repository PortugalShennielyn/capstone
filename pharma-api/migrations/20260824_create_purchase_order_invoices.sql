CREATE TABLE IF NOT EXISTS purchase_order_invoices (
    invoice_id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
    po_id CHAR(36) NOT NULL,
    invoice_number VARCHAR(100) NOT NULL,
    invoice_date DATE NOT NULL,
    discount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    other_charges DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    supplier_invoice_total DECIMAL(12,2) NOT NULL,
    recorded_by CHAR(36) NULL,
    recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_purchase_order_invoice_po (po_id),
    KEY idx_purchase_order_invoice_number (invoice_number),
    CONSTRAINT fk_purchase_order_invoice_po FOREIGN KEY (po_id) REFERENCES purchase_orders (po_id) ON DELETE RESTRICT,
    CONSTRAINT fk_purchase_order_invoice_user FOREIGN KEY (recorded_by) REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS purchase_order_invoice_items (
    invoice_item_id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
    invoice_id CHAR(36) NOT NULL,
    po_item_id CHAR(36) NOT NULL,
    unit_cost DECIMAL(12,4) NOT NULL,
    UNIQUE KEY uq_purchase_order_invoice_line (invoice_id, po_item_id),
    CONSTRAINT fk_purchase_order_invoice_item_invoice FOREIGN KEY (invoice_id) REFERENCES purchase_order_invoices (invoice_id) ON DELETE CASCADE,
    CONSTRAINT fk_purchase_order_invoice_item_po_line FOREIGN KEY (po_item_id) REFERENCES purchase_order_items (po_item_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS supplier_refunds (
    refund_id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
    claim_id CHAR(36) NOT NULL,
    amount_due DECIMAL(12,2) NOT NULL,
    amount_received DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    refund_status VARCHAR(30) NOT NULL DEFAULT 'Due',
    received_date DATE NULL,
    reference_number VARCHAR(100) NULL,
    recorded_by CHAR(36) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_supplier_refund_claim (claim_id),
    CONSTRAINT fk_supplier_refund_claim FOREIGN KEY (claim_id) REFERENCES supplier_claims (claim_id) ON DELETE CASCADE,
    CONSTRAINT fk_supplier_refund_user FOREIGN KEY (recorded_by) REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
