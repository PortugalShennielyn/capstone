-- Normalized supplier packaging hierarchy. Legacy supplier_products columns
-- remain synchronized compatibility snapshots for procurement documents.
CREATE TABLE IF NOT EXISTS supplier_product_unit_conversions (
    conversion_id CHAR(36) NOT NULL DEFAULT (UUID()),
    supplier_product_id CHAR(36) NOT NULL,
    unit_name VARCHAR(50) NOT NULL,
    base_quantity INT NOT NULL,
    level_order INT NOT NULL DEFAULT 0,
    is_transfer_unit TINYINT(1) NOT NULL DEFAULT 1,
    is_selling_unit TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (conversion_id),
    UNIQUE KEY uq_supplier_product_unit (supplier_product_id, unit_name),
    KEY idx_supplier_product_unit_factor (supplier_product_id, base_quantity),
    CONSTRAINT fk_supplier_product_unit_supplier_product FOREIGN KEY (supplier_product_id) REFERENCES supplier_products (supplier_product_id) ON DELETE CASCADE,
    CONSTRAINT chk_supplier_product_unit_base CHECK (base_quantity > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS inventory_transfers (
    transfer_id CHAR(36) NOT NULL DEFAULT (UUID()),
    product_id CHAR(36) NOT NULL,
    movement_type ENUM('STORAGE_TO_SHELF','SHELF_TO_STORAGE') NOT NULL,
    selected_quantity INT NOT NULL,
    selected_unit VARCHAR(50) NOT NULL,
    base_quantity INT NOT NULL,
    base_unit VARCHAR(50) NOT NULL,
    source_location VARCHAR(30) NOT NULL,
    destination_location VARCHAR(30) NOT NULL,
    transferred_by CHAR(36) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (transfer_id),
    KEY idx_inventory_transfers_product_date (product_id, created_at),
    KEY idx_inventory_transfers_user (transferred_by),
    CONSTRAINT fk_inventory_transfers_product FOREIGN KEY (product_id) REFERENCES product (product_id),
    CONSTRAINT fk_inventory_transfers_user FOREIGN KEY (transferred_by) REFERENCES users (user_id) ON DELETE SET NULL,
    CONSTRAINT chk_inventory_transfer_quantities CHECK (selected_quantity > 0 AND base_quantity > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS inventory_transfer_allocations (
    allocation_id CHAR(36) NOT NULL DEFAULT (UUID()),
    transfer_id CHAR(36) NOT NULL,
    source_batch_id CHAR(36) NOT NULL,
    selling_stock_id CHAR(36) NULL,
    batch_number VARCHAR(80) NULL,
    expiry_date DATE NULL,
    base_quantity INT NOT NULL,
    PRIMARY KEY (allocation_id),
    KEY idx_transfer_allocations_transfer (transfer_id),
    KEY idx_transfer_allocations_batch (source_batch_id),
    CONSTRAINT fk_transfer_allocations_transfer FOREIGN KEY (transfer_id) REFERENCES inventory_transfers (transfer_id) ON DELETE CASCADE,
    CONSTRAINT fk_transfer_allocations_batch FOREIGN KEY (source_batch_id) REFERENCES inventory_batches (batch_id),
    CONSTRAINT fk_transfer_allocations_selling FOREIGN KEY (selling_stock_id) REFERENCES product_selling_stock (selling_stock_id) ON DELETE SET NULL,
    CONSTRAINT chk_transfer_allocation_quantity CHECK (base_quantity > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE sales_order_items
    ADD COLUMN IF NOT EXISTS selected_quantity INT NULL AFTER specification,
    ADD COLUMN IF NOT EXISTS selected_unit VARCHAR(50) NULL AFTER selected_quantity,
    ADD COLUMN IF NOT EXISTS unit_base_quantity INT NOT NULL DEFAULT 1 AFTER selected_unit;
