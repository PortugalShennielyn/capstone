CREATE TABLE IF NOT EXISTS suppliers (
    supplier_id INT AUTO_INCREMENT PRIMARY KEY,
    supplier_name VARCHAR(150) NOT NULL,
    contact_person VARCHAR(100) NULL,
    phone VARCHAR(30) NULL,
    email VARCHAR(100) NULL,
    address TEXT NULL,
    archived_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE suppliers
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP NULL DEFAULT NULL;

CREATE TABLE IF NOT EXISTS supplier_products (
    supplier_product_id INT AUTO_INCREMENT PRIMARY KEY,
    supplier_id INT NOT NULL,
    product_id INT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_supplier_item UNIQUE (supplier_id, product_id),
    CONSTRAINT fk_supplier_products_supplier
        FOREIGN KEY (supplier_id) REFERENCES suppliers(supplier_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_supplier_products_product
        FOREIGN KEY (product_id) REFERENCES product(product_id)
        ON DELETE CASCADE
);

ALTER TABLE product
    ADD COLUMN IF NOT EXISTS supplier_id INT NULL;

CREATE TABLE IF NOT EXISTS purchase_orders (
    po_id INT AUTO_INCREMENT PRIMARY KEY,
    supplier_id INT NOT NULL,
    po_number VARCHAR(50) NOT NULL UNIQUE,
    payment_terms VARCHAR(40) NULL,
    expected_delivery_date DATE NULL,
    final_payment DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    status VARCHAR(40) NOT NULL DEFAULT 'Pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_purchase_orders_supplier
        FOREIGN KEY (supplier_id) REFERENCES suppliers(supplier_id)
);

ALTER TABLE purchase_orders
    ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(40) NULL;

ALTER TABLE purchase_orders
    ADD COLUMN IF NOT EXISTS expected_delivery_date DATE NULL;

ALTER TABLE purchase_orders
    ADD COLUMN IF NOT EXISTS final_payment DECIMAL(12,2) NOT NULL DEFAULT 0.00;

ALTER TABLE purchase_orders
    MODIFY status VARCHAR(40) NOT NULL DEFAULT 'Pending';

CREATE TABLE IF NOT EXISTS purchase_order_items (
    po_item_id INT AUTO_INCREMENT PRIMARY KEY,
    po_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL,
    CONSTRAINT fk_purchase_order_items_po
        FOREIGN KEY (po_id) REFERENCES purchase_orders(po_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_purchase_order_items_product
        FOREIGN KEY (product_id) REFERENCES product(product_id)
);

CREATE TABLE IF NOT EXISTS purchase_order_receiving (
    receiving_id INT AUTO_INCREMENT PRIMARY KEY,
    po_id INT NOT NULL,
    received_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    remarks TEXT NULL,
    UNIQUE KEY unique_po_receiving (po_id)
);

CREATE TABLE IF NOT EXISTS purchase_order_receiving_items (
    receiving_item_id INT AUTO_INCREMENT PRIMARY KEY,
    receiving_id INT NOT NULL,
    po_item_id INT NOT NULL,
    received_quantity INT NOT NULL DEFAULT 0,
    damaged_quantity INT NOT NULL DEFAULT 0,
    UNIQUE KEY unique_receiving_item (receiving_id, po_item_id)
);

CREATE TABLE IF NOT EXISTS purchase_order_returns (
    return_id INT AUTO_INCREMENT PRIMARY KEY,
    po_id INT NOT NULL,
    po_item_id INT NOT NULL,
    return_quantity INT NOT NULL DEFAULT 0,
    damage_reason VARCHAR(80) NOT NULL,
    remarks TEXT NULL,
    return_status VARCHAR(40) NOT NULL DEFAULT 'Open',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
