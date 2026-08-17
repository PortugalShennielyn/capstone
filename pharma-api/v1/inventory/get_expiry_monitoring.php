<?php
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once '../products/product_category_schema.php';

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
         LEFT JOIN product_inventory pi ON pi.inventory_id = ib.legacy_inventory_id
         LEFT JOIN purchase_order_items poi ON poi.po_item_id = ib.po_item_id
         LEFT JOIN purchase_orders po ON po.po_id = COALESCE(ib.po_id, poi.po_id)
         LEFT JOIN suppliers batch_supplier ON batch_supplier.supplier_id = ib.supplier_id
         LEFT JOIN suppliers po_supplier ON po_supplier.supplier_id = po.supplier_id
         LEFT JOIN product_categories pc ON pc.category_id = p.category_id
         LEFT JOIN product_types pt ON pt.type_id = p.type_id
         LEFT JOIN medicine_details md ON md.product_id = p.product_id
         LEFT JOIN grocery_details gd ON gd.product_id = p.product_id
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

        if (empty($row['expiry_date'])) {
            $row['expiry_status'] = 'Not Recorded';
            $row['days_until_expiry'] = null;
            return $row;
        }

        $days = (int) $row['days_until_expiry'];
        if ($days < 0) {
            $row['expiry_status'] = 'Expired';
        } elseif ($days <= $row['expiry_alert_days']) {
            $row['expiry_status'] = 'Expiring Soon';
        } else {
            $row['expiry_status'] = 'Safe';
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
