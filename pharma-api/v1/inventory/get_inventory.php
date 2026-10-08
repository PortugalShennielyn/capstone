<?php
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once '../products/product_category_schema.php';
require_once 'inventory_stock_summary.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Only GET requests are allowed.']);
    exit();
}

function inventoryDateStatus(?string $expiryDate): string
{
    if (!$expiryDate) {
        return 'Not Recorded';
    }

    $today = new DateTimeImmutable('today');
    $expiry = DateTimeImmutable::createFromFormat('Y-m-d', substr($expiryDate, 0, 10));

    if (!$expiry) {
        return 'Not Recorded';
    }

    if ($expiry < $today) {
        return 'Expired';
    }

    return $expiry <= $today->modify('+30 days') ? 'Expiring Soon' : 'Safe';
}

try {
    $inventoryStockSql = inventoryStockSummarySql();
    $statement = $pdo->prepare(
        "SELECT
            p.product_id,
            p.product_name,
            p.brand_name,
            p.barcode,
            p.price,
            p.status AS product_status,
            p.inventory_unit_id,
            pmu.unit_name AS inventory_unit_name,
            COALESCE(NULLIF(pmu.unit_symbol,''),pmu.unit_name) AS inventory_unit_symbol,
            pc.category_name,
            pt.type_name,
            md.generic_name,
            classification_values.medicine_classification,
            classification_values.medicine_classification_badge,
            md.strength,
            md.strength_value,
            md.strength_unit,
            md.net_content_value,
            md.net_content_unit,
            md.dosage_form,
            COALESCE(md.package_type, gd.package_type, msd.package_type) AS package_type,
            gd.variant,
            gd.size,
            gd.net_weight,
            gd.net_weight AS weight_volume_value,
            gd.unit,
            gd.unit AS weight_volume_unit,
            gd.pack_content,
            msd.variant AS medical_variant,
            msd.size AS medical_size,
            msd.material,
            msd.sterile_status,
            msd.package_type AS medical_package_type,
            msd.pack_content AS medical_pack_content,
            specs.normalized_specification,
            inv.storage_quantity,
            inv.shelf_quantity,
            inv.damaged_quantity,
            inv.returned_quantity,
            inv.current_stock_quantity,
            inv.total_quantity,
            inv.reorder_level,
            inv.stock_status,
            inv.nearest_expiry_date,
            COALESCE(inv.active_batch_count, 0) AS active_batch_count,
            inv.has_expiry_pullout,
            recv.latest_received_date AS last_received_date,
            recv.latest_supplier_name,
            recv.latest_po_number,
            COALESCE(cost.unit_cost, p.price, 0) AS inventory_unit_cost,
            inv.total_quantity * COALESCE(cost.unit_cost, p.price, 0) AS inventory_value
         FROM ({$inventoryStockSql}) inv
         INNER JOIN product p ON p.product_id = inv.product_id
         LEFT JOIN product_measurement_units pmu ON pmu.measurement_unit_id = p.inventory_unit_id
         LEFT JOIN product_categories pc ON pc.category_id = p.category_id
         LEFT JOIN product_types pt ON pt.type_id = p.type_id
         LEFT JOIN medicine_details md ON md.product_id = p.product_id
         LEFT JOIN grocery_details gd ON gd.product_id = p.product_id
         LEFT JOIN medical_supply_details msd ON msd.product_id = p.product_id
         LEFT JOIN (
            SELECT
                psv.product_id,
                GROUP_CONCAT(
                    COALESCE(
                        NULLIF(TRIM(psv.value_text), ''),
                        NULLIF(TRIM(CONCAT(
                            TRIM(TRAILING '.' FROM TRIM(TRAILING '0' FROM CAST(psv.value_number AS CHAR))),
                            CASE
                                WHEN COALESCE(NULLIF(pmu.unit_symbol, ''), pmu.unit_name) IS NULL THEN ''
                                ELSE CONCAT(' ', COALESCE(NULLIF(pmu.unit_symbol, ''), pmu.unit_name))
                            END
                        )), '')
                    )
                    ORDER BY COALESCE(pts.sort_order, 2147483647), ps.specification_name
                    SEPARATOR ' • '
                ) AS normalized_specification
            FROM product_specification_values psv
            INNER JOIN product AS specification_product ON specification_product.product_id = psv.product_id
            INNER JOIN product_specifications ps ON ps.specification_id = psv.specification_id
            LEFT JOIN product_type_specifications pts
                ON pts.type_id = specification_product.type_id
               AND pts.specification_id = psv.specification_id
            LEFT JOIN product_measurement_units pmu ON pmu.measurement_unit_id = psv.measurement_unit_id
            WHERE (NULLIF(TRIM(psv.value_text), '') IS NOT NULL OR psv.value_number IS NOT NULL)
              AND LOWER(TRIM(ps.specification_name)) <> 'medicine classification'
            GROUP BY psv.product_id
         ) specs ON specs.product_id = p.product_id
         LEFT JOIN (
            SELECT psv.product_id,
                   psv.value_text AS medicine_classification,
                   CASE
                       WHEN LOWER(TRIM(psv.value_text)) = 'prescription (rx)' THEN 'Rx'
                       ELSE NULL
                   END AS medicine_classification_badge
            FROM product_specification_values psv
            INNER JOIN product_specifications ps ON ps.specification_id=psv.specification_id
            WHERE LOWER(TRIM(ps.specification_name))='medicine classification'
         ) classification_values ON classification_values.product_id=p.product_id
         LEFT JOIN (
            SELECT
                product_id,
                CASE
                    WHEN SUM(received_qty) > 0
                    THEN SUM(received_qty * unit_cost) / SUM(received_qty)
                    ELSE NULL
                END AS unit_cost
            FROM inventory_batches
            GROUP BY product_id
         ) cost ON cost.product_id = p.product_id
         LEFT JOIN (
            SELECT latest.product_id, latest.received_date AS latest_received_date, latest.supplier_name AS latest_supplier_name, latest.po_number AS latest_po_number
            FROM (
                SELECT
                    ib.product_id,
                    ib.received_date,
                    s.supplier_name,
                    po.po_number,
                    ROW_NUMBER() OVER (PARTITION BY ib.product_id ORDER BY ib.received_date DESC, ib.created_at DESC, ib.batch_id DESC) AS rn
                FROM inventory_batches ib
                LEFT JOIN purchase_order_items source_item ON source_item.po_item_id = ib.po_item_id
                LEFT JOIN purchase_orders po ON po.po_id = COALESCE(ib.po_id, source_item.po_id)
                LEFT JOIN suppliers s ON s.supplier_id = ib.supplier_id
            ) latest
            WHERE latest.rn = 1
         ) recv ON recv.product_id = p.product_id
         ORDER BY p.product_name ASC, p.brand_name ASC"
    );

    $statement->execute();
    $rows = $statement->fetchAll(PDO::FETCH_ASSOC);

    $productIds = array_values(array_filter(array_map(fn ($row) => cleanId($row['product_id'] ?? null), $rows)));
    $batchesByProduct = [];
    $historyByProduct = [];

    if (count($productIds) > 0) {
        $placeholders = implode(',', array_fill(0, count($productIds), '?'));

        $batchStatement = $pdo->prepare(
            "SELECT
                inv.product_id,
                inv.batch_id,
                inv.legacy_inventory_id AS inventory_id,
                inv.po_id,
                inv.po_item_id,
                COALESCE(NULLIF(pi.batch_number, ''), inv.batch_id) AS batch_number,
                po.po_number,
                s.supplier_name,
                inv.received_date,
                inv.expiry_date,
                inv.received_qty,
                GREATEST(inv.storage_qty - inv.expiry_quarantined_storage_qty, 0) AS storage_qty,
                COALESCE(selling.shelf_qty, 0) AS shelf_qty,
                inv.damaged_qty,
                inv.returned_qty,
                inv.unit_cost,
                inv.batch_status,
                CASE
                    WHEN inv.expiry_date IS NULL THEN 'Not Recorded'
                    WHEN inv.expiry_date < CURDATE() THEN 'Expired'
                    WHEN inv.expiry_date <= DATE_ADD(CURDATE(), INTERVAL COALESCE(pi.expiry_alert_days, 30) DAY) THEN 'Expiring Soon'
                    ELSE 'Safe'
                END AS status
             FROM inventory_batches inv
             LEFT JOIN purchase_order_items source_item ON source_item.po_item_id = inv.po_item_id
             LEFT JOIN purchase_orders po ON po.po_id = COALESCE(inv.po_id, source_item.po_id)
             LEFT JOIN product_inventory pi ON pi.inventory_id = inv.legacy_inventory_id
             LEFT JOIN suppliers s ON s.supplier_id = inv.supplier_id
             LEFT JOIN (
                SELECT source_batch_id, SUM(GREATEST(quantity_remaining - expiry_quarantined_qty, 0)) AS shelf_qty
                FROM product_selling_stock
                WHERE source_batch_id IS NOT NULL
                GROUP BY source_batch_id
             ) selling ON selling.source_batch_id = inv.batch_id
             WHERE inv.product_id IN ({$placeholders})
               AND (inv.received_qty > 0 OR inv.storage_qty > 0 OR COALESCE(selling.shelf_qty, 0) > 0 OR inv.damaged_qty > 0 OR inv.returned_qty > 0)
             ORDER BY inv.product_id ASC,
                CASE WHEN inv.expiry_date IS NULL THEN 1 ELSE 0 END ASC,
                inv.expiry_date ASC,
                inv.received_date ASC,
                inv.created_at ASC"
        );
        $batchStatement->execute($productIds);
        $batchRows = $batchStatement->fetchAll(PDO::FETCH_ASSOC);
        $latestReceivedByProduct = [];
        foreach ($batchRows as $batch) {
            $productIdForBatch = cleanId($batch['product_id'] ?? null);
            $receivedDate = (string) ($batch['received_date'] ?? '');
            if (!isset($latestReceivedByProduct[$productIdForBatch]) || strcmp($receivedDate, $latestReceivedByProduct[$productIdForBatch]) > 0) {
                $latestReceivedByProduct[$productIdForBatch] = $receivedDate;
            }
        }
        $useFirstMarked = [];
        foreach ($batchRows as $batch) {
            $productIdForBatch = cleanId($batch['product_id'] ?? null);
            $batch['storage_qty'] = (int) ($batch['storage_qty'] ?? 0);
            $batch['shelf_qty'] = (int) ($batch['shelf_qty'] ?? 0);
            $batch['damaged_qty'] = (int) ($batch['damaged_qty'] ?? 0);
            $batch['returned_qty'] = (int) ($batch['returned_qty'] ?? 0);
            $batch['received_qty'] = (int) ($batch['received_qty'] ?? 0);
            $batch['quantity'] = $batch['storage_qty'];
            $batch['is_new_batch'] = ($batch['received_date'] ?? '') === ($latestReceivedByProduct[$productIdForBatch] ?? '');
            $batch['is_old_batch'] = !$batch['is_new_batch'];
            $batch['use_first'] = false;
            if ($batch['storage_qty'] > 0 && empty($useFirstMarked[$productIdForBatch])) {
                $batch['use_first'] = true;
                $useFirstMarked[$productIdForBatch] = true;
            }
            $batchesByProduct[$productIdForBatch][] = $batch;
        }

        $receivedStatement = $pdo->prepare(
            "SELECT
                poi.product_id,
                por.received_date AS movement_date,
                'Received from PO' AS movement_type,
                GREATEST(pori.received_quantity - pori.damaged_quantity, 0) AS quantity,
                po.po_number,
                s.supplier_name,
                por.remarks
             FROM purchase_order_receiving por
             INNER JOIN purchase_order_receiving_item_summary pori ON pori.receiving_id = por.receiving_id
             INNER JOIN purchase_order_items poi ON poi.po_item_id = pori.po_item_id
             INNER JOIN purchase_orders po ON po.po_id = por.po_id
             LEFT JOIN suppliers s ON s.supplier_id = po.supplier_id
             WHERE poi.product_id IN ({$placeholders})
             ORDER BY por.received_date DESC"
        );
        $receivedStatement->execute($productIds);
        foreach ($receivedStatement->fetchAll(PDO::FETCH_ASSOC) as $movement) {
            $movement['from_location'] = $movement['supplier_name'] ?: 'Purchase Order';
            $movement['to_location'] = 'Storage';
            $movement['user_name'] = null;
            $movement['notes'] = trim(($movement['po_number'] ? 'PO: ' . $movement['po_number'] : '') . ($movement['remarks'] ? ' - ' . $movement['remarks'] : ''));
            $historyByProduct[$movement['product_id']][] = $movement;
        }

        $shelfStatement = $pdo->prepare(
            "SELECT
                product_id,
                created_at AS movement_date,
                'Moved to Shelf' AS movement_type,
                quantity_stocked AS quantity,
                batch_number,
                NULL AS supplier_name,
                NULL AS po_number,
                NULL AS remarks
             FROM product_selling_stock
             WHERE product_id IN ({$placeholders})
             ORDER BY created_at DESC"
        );
        $shelfStatement->execute($productIds);
        foreach ($shelfStatement->fetchAll(PDO::FETCH_ASSOC) as $movement) {
            $movement['from_location'] = 'Storage';
            $movement['to_location'] = 'Shelf';
            $movement['user_name'] = null;
            $movement['notes'] = $movement['batch_number'] ? 'Batch: ' . $movement['batch_number'] : '';
            $historyByProduct[$movement['product_id']][] = $movement;
        }

        $returnStatement = $pdo->prepare(
            "SELECT
                poi.product_id,
                por.created_at AS movement_date,
                'Returned/Damaged' AS movement_type,
                por.return_quantity AS quantity,
                po.po_number,
                por.damage_reason,
                por.remarks
             FROM supplier_claim_legacy_projection por
             INNER JOIN purchase_order_items poi ON poi.po_item_id = por.po_item_id
             INNER JOIN purchase_orders po ON po.po_id = por.po_id
             WHERE poi.product_id IN ({$placeholders})
             ORDER BY por.created_at DESC"
        );
        $returnStatement->execute($productIds);
        foreach ($returnStatement->fetchAll(PDO::FETCH_ASSOC) as $movement) {
            $movement['from_location'] = 'Receiving';
            $movement['to_location'] = 'Damaged/Returned';
            $movement['user_name'] = null;
            $movement['notes'] = trim(($movement['po_number'] ? 'PO: ' . $movement['po_number'] : '') . ($movement['damage_reason'] ? ' - ' . $movement['damage_reason'] : '') . ($movement['remarks'] ? ' - ' . $movement['remarks'] : ''));
            $historyByProduct[$movement['product_id']][] = $movement;
        }
    }

    foreach ($rows as &$row) {
        $productId = cleanId($row['product_id'] ?? null);
        $row['storage_quantity'] = (int) ($row['storage_quantity'] ?? 0);
        $row['shelf_quantity'] = (int) ($row['shelf_quantity'] ?? 0);
        $row['damaged_quantity'] = (int) ($row['damaged_quantity'] ?? 0);
        $row['total_quantity'] = (int) ($row['total_quantity'] ?? 0);
        $row['current_stock_quantity'] = (int) ($row['current_stock_quantity'] ?? 0);
        $row['reorder_level'] = (int) ($row['reorder_level'] ?? INVENTORY_LOW_STOCK_THRESHOLD);
        $row['inventory_unit_cost'] = (float) ($row['inventory_unit_cost'] ?? 0);
        $row['inventory_value'] = (float) ($row['inventory_value'] ?? 0);
        $row['active_batch_count'] = (int) ($row['active_batch_count'] ?? 0);
        $row['product_status'] = strcasecmp(trim((string) ($row['product_status'] ?? 'Active')), 'Inactive') === 0
            ? 'Inactive'
            : 'Active';
        $row['batches'] = $batchesByProduct[$productId] ?? [];
        $availableBatches = array_values(array_filter($row['batches'], static function (array $batch): bool {
            $available = (int) ($batch['storage_qty'] ?? 0) + (int) ($batch['shelf_qty'] ?? 0);
            return $available > 0 && !in_array(strtolower((string) ($batch['batch_status'] ?? 'active')), ['returned', 'depleted'], true);
        }));
        $row['has_expiring_batch'] = count(array_filter($availableBatches, static fn (array $batch): bool => ($batch['status'] ?? '') === 'Expiring Soon')) > 0;
        $row['has_expired_batch'] = count(array_filter($availableBatches, static fn (array $batch): bool => ($batch['status'] ?? '') === 'Expired')) > 0;
        $row['expiry_status'] = $availableBatches[0]['status'] ?? inventoryDateStatus($row['nearest_expiry_date'] ?? null);
        $row['history'] = $historyByProduct[$productId] ?? [];

        usort($row['history'], function ($left, $right) {
            return strcmp((string) ($right['movement_date'] ?? ''), (string) ($left['movement_date'] ?? ''));
        });
    }
    unset($row);

    echo json_encode([
        'status' => 'success',
        'data' => $rows
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Unable to load inventory.',
        'error' => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
?>
