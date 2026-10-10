<?php

const INVENTORY_LOW_STOCK_THRESHOLD = 30;
const INVENTORY_SHELF_MINIMUM_THRESHOLD = 10;

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
    $shelfMinimum = INVENTORY_SHELF_MINIMUM_THRESHOLD;

    return "SELECT
            totals.*,
            totals.storage_quantity + totals.shelf_quantity AS total_quantity,
            totals.current_storage_quantity + totals.current_shelf_quantity AS current_stock_quantity,
            {$threshold} AS reorder_level,
            {$shelfMinimum} AS shelf_minimum,
            CASE
                WHEN totals.current_storage_quantity + totals.current_shelf_quantity = 0 THEN 'Out of Stock'
                WHEN totals.current_storage_quantity + totals.current_shelf_quantity > 0
                 AND totals.current_storage_quantity + totals.current_shelf_quantity <= {$threshold} THEN 'Low Stock'
                WHEN totals.current_storage_quantity + totals.current_shelf_quantity > {$threshold} THEN 'In Stock'
                ELSE 'Inventory Data Issue'
            END AS stock_status
        FROM (
            SELECT
                ib.product_id,
                SUM(CASE WHEN ib.batch_status = 'active' THEN GREATEST(ib.storage_qty - ib.expiry_quarantined_storage_qty, 0) ELSE 0 END) AS storage_quantity,
                SUM(CASE WHEN ib.batch_status = 'active' THEN COALESCE(selling.shelf_qty, 0) ELSE 0 END) AS shelf_quantity,
                SUM(CASE WHEN ib.batch_status = 'active' AND (ib.expiry_date IS NULL OR ib.expiry_date >= CURDATE()) THEN GREATEST(ib.storage_qty - ib.expiry_quarantined_storage_qty, 0) ELSE 0 END) AS current_storage_quantity,
                SUM(CASE WHEN ib.batch_status = 'active' AND (ib.expiry_date IS NULL OR ib.expiry_date >= CURDATE()) THEN COALESCE(selling.shelf_qty, 0) ELSE 0 END) AS current_shelf_quantity,
                SUM(CASE WHEN ib.batch_status = 'active' THEN ib.damaged_qty ELSE 0 END) AS damaged_quantity,
                SUM(CASE WHEN ib.batch_status = 'active' THEN ib.returned_qty ELSE 0 END) AS returned_quantity,
                MIN(CASE
                    WHEN ib.batch_status = 'active'
                     AND (GREATEST(ib.storage_qty - ib.expiry_quarantined_storage_qty, 0) + COALESCE(selling.shelf_qty, 0)) > 0
                     AND ib.expiry_date IS NOT NULL
                    THEN ib.expiry_date
                END) AS nearest_expiry_date,
                MIN(CASE
                    WHEN ib.batch_status = 'active'
                     AND (GREATEST(ib.storage_qty - ib.expiry_quarantined_storage_qty, 0) + COALESCE(selling.shelf_qty, 0)) > 0
                     AND ib.expiry_date >= CURDATE()
                     AND DATEDIFF(ib.expiry_date, CURDATE()) <= COALESCE(pi.expiry_alert_days, 30)
                    THEN ib.expiry_date
                END) AS nearest_expiring_date,
                SUM(CASE
                    WHEN ib.batch_status = 'active'
                     AND (GREATEST(ib.storage_qty - ib.expiry_quarantined_storage_qty, 0) + COALESCE(selling.shelf_qty, 0)) > 0
                    THEN 1
                    ELSE 0
                END) AS active_batch_count,
                MAX(CASE WHEN resolution.product_id IS NULL THEN 0 ELSE 1 END) AS has_expiry_pullout
            FROM inventory_batches ib
            LEFT JOIN product_inventory pi ON pi.inventory_id = ib.legacy_inventory_id
            LEFT JOIN (
                SELECT source_batch_id, SUM(GREATEST(quantity_remaining - expiry_quarantined_qty, 0)) AS shelf_qty
                FROM product_selling_stock
                WHERE source_batch_id IS NOT NULL
                GROUP BY source_batch_id
            ) selling ON selling.source_batch_id = ib.batch_id
            LEFT JOIN (SELECT DISTINCT product_id FROM inventory_resolution_cases) resolution ON resolution.product_id = ib.product_id
            GROUP BY ib.product_id
        ) totals";
}
