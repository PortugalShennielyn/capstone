<?php

function ensureSalesProfitAllocationSchema(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS sales_order_item_batch_allocations (
        allocation_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        order_item_id INT NOT NULL,
        order_id INT NOT NULL,
        batch_id CHAR(36) NULL,
        po_id CHAR(36) NULL,
        quantity INT NOT NULL,
        unit_cost DECIMAL(12,4) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (allocation_id),
        KEY idx_sales_batch_alloc_item (order_item_id),
        KEY idx_sales_batch_alloc_order (order_id),
        KEY idx_sales_batch_alloc_po (po_id),
        KEY idx_sales_batch_alloc_batch (batch_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci");
}

