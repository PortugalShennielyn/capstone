<?php
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once 'supplier_schema.php';

try {
    ensureSupplierArchiveColumn($pdo);
    $includeInactive = filter_var($_GET['include_inactive'] ?? false, FILTER_VALIDATE_BOOLEAN);
    $supplierWhere = $includeInactive ? '' : 'WHERE s.archived_at IS NULL';

    $statement = $pdo->prepare(
        "SELECT
            s.supplier_id,
            s.supplier_name,
            s.phone,
            s.email,
            s.address,
            s.created_at,
            s.archived_at,
            (SELECT COUNT(*)
             FROM supplier_products sp
             WHERE sp.supplier_id = s.supplier_id) AS assigned_product_count,
            (SELECT COUNT(*)
             FROM purchase_orders po
             WHERE po.supplier_id = s.supplier_id
               AND LOWER(TRIM(po.status)) NOT IN (
                   'cancelled',
                   'canceled',
                   'rejected',
                   'delivered',
                   'delivered with return/damage',
                   'completed'
               )) AS active_purchase_order_count,
            (SELECT COUNT(*)
             FROM purchase_orders po
             WHERE po.supplier_id = s.supplier_id) AS historical_purchase_order_count,
            (SELECT po.po_number
             FROM purchase_orders po
             WHERE po.supplier_id = s.supplier_id
             ORDER BY po.created_at DESC, po.po_id DESC
             LIMIT 1) AS latest_purchase_order_number,
            (SELECT po.status
             FROM purchase_orders po
             WHERE po.supplier_id = s.supplier_id
             ORDER BY po.created_at DESC, po.po_id DESC
             LIMIT 1) AS latest_purchase_order_status,
            (SELECT po.created_at
             FROM purchase_orders po
             WHERE po.supplier_id = s.supplier_id
             ORDER BY po.created_at DESC, po.po_id DESC
             LIMIT 1) AS latest_purchase_order_date,
            (SELECT MAX(receiving.received_date)
             FROM purchase_order_receiving receiving
             INNER JOIN purchase_orders po ON po.po_id = receiving.po_id
             WHERE po.supplier_id = s.supplier_id) AS latest_delivery_date
         FROM suppliers s
         {$supplierWhere}
         ORDER BY s.supplier_name ASC"
    );
    $statement->execute();

    $summaryStatement = $pdo->query(
        "SELECT
            (SELECT COUNT(*) FROM suppliers) AS total_suppliers,
            (SELECT COUNT(*) FROM suppliers WHERE archived_at IS NULL) AS active_suppliers,
            (SELECT COUNT(*)
             FROM supplier_products sp
             INNER JOIN suppliers s ON s.supplier_id = sp.supplier_id
             WHERE s.archived_at IS NULL) AS assigned_supplier_products,
            (SELECT COUNT(*)
             FROM (
                 SELECT sp.product_id
                 FROM supplier_products sp
                 INNER JOIN suppliers s ON s.supplier_id = sp.supplier_id
                 WHERE s.archived_at IS NULL
                 GROUP BY sp.product_id
                 HAVING COUNT(DISTINCT sp.supplier_id) > 1
             ) multi_supplier_products) AS products_with_multiple_suppliers"
    );

    echo json_encode([
        'status' => 'success',
        'suppliers' => $statement->fetchAll(),
        'summary' => $summaryStatement->fetch() ?: []
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Unable to load suppliers.'
    ]);
}
?>
