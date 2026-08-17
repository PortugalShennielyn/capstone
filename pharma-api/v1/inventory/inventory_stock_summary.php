<?php

const INVENTORY_LOW_STOCK_THRESHOLD = 30;

/**
 * Returns the authoritative per-product inventory aggregation used by both
 * Inventory and Dashboard stock-status views.
 *
 * A product is tracked only after it has an inventory_batches record. Storage
 * comes from active inventory batches, while shelf stock comes from the live
 * product_selling_stock balance because sales decrement quantity_remaining.
 */
function inventoryStockSummarySql(): string
{
    $threshold = INVENTORY_LOW_STOCK_THRESHOLD;

    return "SELECT
            totals.*,
            totals.storage_quantity + totals.shelf_quantity AS total_quantity,
            {$threshold} AS reorder_level,
            CASE
                WHEN totals.storage_quantity + totals.shelf_quantity = 0 THEN 'Out of Stock'
                WHEN totals.storage_quantity + totals.shelf_quantity > 0
                 AND totals.storage_quantity + totals.shelf_quantity <= {$threshold} THEN 'Low Stock'
                WHEN totals.storage_quantity + totals.shelf_quantity > {$threshold} THEN 'In Stock'
                ELSE 'Inventory Data Issue'
            END AS stock_status
        FROM (
            SELECT
                ib.product_id,
                SUM(CASE WHEN ib.batch_status = 'active' THEN ib.storage_qty ELSE 0 END) AS storage_quantity,
                SUM(CASE WHEN ib.batch_status = 'active' THEN COALESCE(selling.shelf_qty, 0) ELSE 0 END) AS shelf_quantity,
                SUM(CASE WHEN ib.batch_status = 'active' THEN ib.damaged_qty ELSE 0 END) AS damaged_quantity,
                SUM(CASE WHEN ib.batch_status = 'active' THEN ib.returned_qty ELSE 0 END) AS returned_quantity,
                SUM(CASE
                    WHEN ib.batch_status = 'active' AND (ib.expiry_date IS NULL OR ib.expiry_date >= CURDATE())
                    THEN ib.storage_qty + COALESCE(selling.shelf_qty, 0)
                    ELSE 0
                END) AS current_stock_quantity,
                MIN(CASE
                    WHEN ib.batch_status = 'active'
                     AND (ib.storage_qty + COALESCE(selling.shelf_qty, 0)) > 0
                     AND ib.expiry_date IS NOT NULL
                    THEN ib.expiry_date
                END) AS nearest_expiry_date,
                MIN(CASE
                    WHEN ib.batch_status = 'active'
                     AND (ib.storage_qty + COALESCE(selling.shelf_qty, 0)) > 0
                     AND ib.expiry_date >= CURDATE()
                     AND DATEDIFF(ib.expiry_date, CURDATE()) <= COALESCE(pi.expiry_alert_days, 30)
                    THEN ib.expiry_date
                END) AS nearest_expiring_date,
                SUM(CASE
                    WHEN ib.batch_status = 'active'
                     AND (ib.storage_qty + COALESCE(selling.shelf_qty, 0)) > 0
                    THEN 1
                    ELSE 0
                END) AS active_batch_count
            FROM inventory_batches ib
            LEFT JOIN product_inventory pi ON pi.inventory_id = ib.legacy_inventory_id
            LEFT JOIN (
                SELECT source_batch_id, SUM(quantity_remaining) AS shelf_qty
                FROM product_selling_stock
                WHERE source_batch_id IS NOT NULL
                GROUP BY source_batch_id
            ) selling ON selling.source_batch_id = ib.batch_id
            GROUP BY ib.product_id
        ) totals";
}
