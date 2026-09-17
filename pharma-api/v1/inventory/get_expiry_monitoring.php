<?php
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once '../products/product_category_schema.php';
require_once 'expiry_status_helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Only GET requests are allowed.']);
    exit();
}

try {
    $statement = $pdo->prepare(
        "SELECT
            ib.batch_id,
            ib.legacy_inventory_id AS inventory_id,
            ib.product_id,
            COALESCE(NULLIF(pi.batch_number, ''), ib.batch_id) AS batch_number,
            po.po_number,
            COALESCE(batch_supplier.supplier_name, po_supplier.supplier_name) AS supplier_name,
            ib.received_date,
            ib.received_qty AS received_quantity,
            ib.storage_qty,
            COALESCE(selling.shelf_qty, 0) AS shelf_qty,
            ib.damaged_qty,
            (ib.storage_qty + COALESCE(selling.shelf_qty, 0)) AS available_quantity,
            ib.expiry_date,
            COALESCE(pi.expiry_alert_days, 30) AS expiry_alert_days,
            DATEDIFF(ib.expiry_date, CURRENT_DATE) AS days_until_expiry,
            ib.batch_status,
            p.product_name,
            p.brand_name,
            inventory_unit.unit_name AS inventory_unit_name,
            COALESCE(NULLIF(inventory_unit.unit_symbol, ''), inventory_unit.unit_name) AS inventory_unit_symbol,
            specs.normalized_specification,
            md.generic_name,
            md.strength,
            md.strength_value,
            md.strength_unit,
            md.net_content_value,
            md.net_content_unit,
            md.dosage_form,
            COALESCE(md.package_type, gd.package_type) AS package_type,
            gd.variant,
            gd.size,
            gd.net_weight,
            gd.unit,
            gd.pack_content,
            pc.category_name,
            pt.type_name
         FROM inventory_batches ib
         LEFT JOIN (SELECT source_batch_id, SUM(quantity_remaining) shelf_qty FROM product_selling_stock GROUP BY source_batch_id) selling ON selling.source_batch_id = ib.batch_id
         INNER JOIN product p ON p.product_id = ib.product_id
         LEFT JOIN product_measurement_units inventory_unit ON inventory_unit.measurement_unit_id = p.inventory_unit_id
         LEFT JOIN product_inventory pi ON pi.inventory_id = ib.legacy_inventory_id
         LEFT JOIN purchase_order_items poi ON poi.po_item_id = ib.po_item_id
         LEFT JOIN purchase_orders po ON po.po_id = COALESCE(ib.po_id, poi.po_id)
         LEFT JOIN suppliers batch_supplier ON batch_supplier.supplier_id = ib.supplier_id
         LEFT JOIN suppliers po_supplier ON po_supplier.supplier_id = po.supplier_id
         LEFT JOIN product_categories pc ON pc.category_id = p.category_id
         LEFT JOIN product_types pt ON pt.type_id = p.type_id
         LEFT JOIN medicine_details md ON md.product_id = p.product_id
         LEFT JOIN grocery_details gd ON gd.product_id = p.product_id
         LEFT JOIN (
            SELECT
                psv.product_id,
                GROUP_CONCAT(
                    COALESCE(
                        NULLIF(TRIM(psv.value_text), ''),
                        NULLIF(TRIM(CONCAT(
                            TRIM(TRAILING '.' FROM TRIM(TRAILING '0' FROM CAST(psv.value_number AS CHAR))),
                            CASE
                                WHEN COALESCE(NULLIF(spec_unit.unit_symbol, ''), spec_unit.unit_name) IS NULL THEN ''
                                ELSE CONCAT(' ', COALESCE(NULLIF(spec_unit.unit_symbol, ''), spec_unit.unit_name))
                            END
                        )), '')
                    )
                    ORDER BY COALESCE(pts.sort_order, 2147483647), ps.specification_name
                    SEPARATOR ' • '
                ) AS normalized_specification
            FROM product_specification_values psv
            INNER JOIN product specification_product ON specification_product.product_id = psv.product_id
            INNER JOIN product_specifications ps ON ps.specification_id = psv.specification_id
            LEFT JOIN product_type_specifications pts
                ON pts.type_id = specification_product.type_id
               AND pts.specification_id = psv.specification_id
            LEFT JOIN product_measurement_units spec_unit ON spec_unit.measurement_unit_id = psv.measurement_unit_id
            WHERE NULLIF(TRIM(psv.value_text), '') IS NOT NULL OR psv.value_number IS NOT NULL
            GROUP BY psv.product_id
         ) specs ON specs.product_id = p.product_id
         WHERE ib.received_qty > 0
            OR ib.storage_qty > 0
            OR COALESCE(selling.shelf_qty, 0) > 0
            OR ib.damaged_qty > 0
         ORDER BY ib.expiry_date IS NULL ASC,
                  ib.expiry_date ASC,
                  p.product_name ASC,
                  ib.received_date DESC"
    );
    $statement->execute();

    $rows = array_map(static function (array $row): array {
        $row['received_quantity'] = (int) ($row['received_quantity'] ?? 0);
        $row['storage_qty'] = (int) ($row['storage_qty'] ?? 0);
        $row['shelf_qty'] = (int) ($row['shelf_qty'] ?? 0);
        $row['damaged_qty'] = (int) ($row['damaged_qty'] ?? 0);
        $row['available_quantity'] = (int) ($row['available_quantity'] ?? 0);
        $row['expiry_alert_days'] = (int) ($row['expiry_alert_days'] ?? 30);

        $row['expiry_status'] = inventoryExpiryStatus(
            $row['expiry_date'] ?? null,
            $row['days_until_expiry'] ?? null,
            $row['expiry_alert_days']
        );
        if ($row['expiry_status'] === 'Not Recorded') {
            $row['days_until_expiry'] = null;
        }
        return $row;
    }, $statement->fetchAll(PDO::FETCH_ASSOC));

    echo json_encode(['status' => 'success', 'data' => $rows]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Unable to load expiry monitoring records.',
        'error' => $e->getMessage()
    ]);
}
?>
