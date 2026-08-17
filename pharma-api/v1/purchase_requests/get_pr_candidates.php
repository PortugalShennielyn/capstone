<?php
$allowedRoles = ['manager', 'admin', 'super_admin', 'ro-manager', 'ro-admin', 'ro-super-admin'];
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once '../inventory/inventory_stock_summary.php';
require_once 'purchase_request_helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Only GET requests are allowed.']);
    exit();
}

try {
    $stockSql = inventoryStockSummarySql();
    $stmt = $pdo->query(
        "SELECT DISTINCT
            p.product_id, p.product_name, p.brand_name, p.barcode, p.status AS product_status,
            pc.category_name, pt.type_name,
            md.generic_name, md.strength, md.strength_value, md.strength_unit,
            md.net_content_value, md.net_content_unit, md.dosage_form,
            COALESCE(md.package_type, gd.package_type, msd.package_type) AS package_type,
            gd.variant, gd.size, gd.net_weight, gd.unit, gd.pack_content,
            msd.variant AS medical_variant, msd.size AS medical_size,
            msd.material, msd.sterile_status, msd.pack_content AS medical_pack_content,
            pmu.unit_name AS base_inventory_unit,
            COALESCE(stock.shelf_quantity, 0) AS shelf_quantity,
            COALESCE(stock.storage_quantity, 0) AS storage_quantity,
            COALESCE(stock.total_quantity, 0) AS total_quantity,
            1 AS has_active_supplier_assignment,
            " . INVENTORY_LOW_STOCK_THRESHOLD . " AS reorder_level,
            CASE
                WHEN COALESCE(received.has_received, 0) = 0 THEN 'New Product'
                WHEN COALESCE(stock.total_quantity, 0) = 0 THEN 'Out of Stock'
                WHEN stock.total_quantity <= " . INVENTORY_LOW_STOCK_THRESHOLD . " THEN 'Low Stock'
                ELSE 'In Stock'
            END AS stock_status
         FROM product p
         INNER JOIN product_measurement_units pmu ON pmu.measurement_unit_id=p.inventory_unit_id
         LEFT JOIN ({$stockSql}) stock ON stock.product_id = p.product_id
         LEFT JOIN (
            SELECT product_id, MAX(CASE WHEN received_qty > 0 THEN 1 ELSE 0 END) AS has_received
            FROM inventory_batches
            GROUP BY product_id
         ) received ON received.product_id = p.product_id
         LEFT JOIN product_categories pc ON pc.category_id = p.category_id
         LEFT JOIN product_types pt ON pt.type_id = p.type_id
         LEFT JOIN medicine_details md ON md.product_id = p.product_id
         LEFT JOIN grocery_details gd ON gd.product_id = p.product_id
         LEFT JOIN medical_supply_details msd ON msd.product_id = p.product_id
         WHERE p.status = 'Active'
           AND EXISTS (
               SELECT 1
               FROM supplier_products eligible_sp
               INNER JOIN suppliers eligible_s ON eligible_s.supplier_id = eligible_sp.supplier_id
               WHERE eligible_sp.product_id = p.product_id
                 AND eligible_s.archived_at IS NULL
           )
           AND (
               COALESCE(received.has_received, 0) = 0
               OR COALESCE(stock.total_quantity, 0) <= " . INVENTORY_LOW_STOCK_THRESHOLD . "
           )
         ORDER BY
            CASE
                WHEN COALESCE(received.has_received, 0) = 1 AND COALESCE(stock.total_quantity, 0) = 0 THEN 0
                WHEN COALESCE(received.has_received, 0) = 1 THEN 1
                ELSE 2
            END,
            p.brand_name, p.product_name"
    );
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    if ($rows) {
        $productIds = array_column($rows, 'product_id');
        $placeholders = implode(',', array_fill(0, count($productIds), '?'));
        $specificationStatement = $pdo->prepare(
            "SELECT psv.product_id, ps.specification_id, ps.specification_name,
                    COALESCE(NULLIF(pts.display_label, ''), ps.specification_name) AS display_name,
                    ps.field_style, psv.value_text, psv.value_number, psv.measurement_unit_id,
                    COALESCE(NULLIF(pmu.unit_symbol, ''), pmu.unit_name) AS unit_symbol
             FROM product_specification_values psv
             INNER JOIN product p ON p.product_id = psv.product_id
             INNER JOIN product_specifications ps ON ps.specification_id = psv.specification_id
             LEFT JOIN product_type_specifications pts
                    ON pts.type_id = p.type_id AND pts.specification_id = psv.specification_id
             LEFT JOIN product_measurement_units pmu
                    ON pmu.measurement_unit_id = psv.measurement_unit_id
             WHERE psv.product_id IN ({$placeholders})
             ORDER BY psv.product_id, pts.sort_order, ps.specification_name"
        );
        $specificationStatement->execute($productIds);
        $specificationsByProduct = [];
        foreach ($specificationStatement->fetchAll(PDO::FETCH_ASSOC) as $specification) {
            $specificationsByProduct[$specification['product_id']][] = $specification;
        }
        foreach ($rows as &$row) {
            $row['specifications'] = $specificationsByProduct[$row['product_id']] ?? [];
            $row['base_inventory_unit'] = trim((string) ($row['base_inventory_unit'] ?? '')) ?: null;
            $row['base_unit_allows_decimal'] = $row['base_inventory_unit'] !== null
                && purchaseRequestUnitAllowsDecimals((string) $row['base_inventory_unit']);
        }
        unset($row);
    }
    echo json_encode(['status' => 'success', 'message' => 'PR candidates loaded.', 'data' => $rows]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to load purchase-request candidates.']);
}
