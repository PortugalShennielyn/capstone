<?php
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once '../products/product_category_schema.php';
require_once '../activity_log_helpers.php';
require_once 'expiry_status_helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Only GET requests are allowed.']);
    exit();
}

try {
    ensureActivityLogSchema($pdo);
    $expireBatches = $pdo->prepare(
        "UPDATE inventory_batches
         SET batch_status = 'expired'
         WHERE expiry_date IS NOT NULL
           AND expiry_date <= CURRENT_DATE
           AND no_expiry = 0
           AND batch_status = 'active'"
    );
    $expireBatches->execute();

    $statement = $pdo->prepare(
        "SELECT
            ib.batch_id,
            ib.legacy_inventory_id AS inventory_id,
            ib.product_id,
            COALESCE(ib.supplier_id, po.supplier_id) AS supplier_id,
            ib.unit_cost,
            COALESCE(NULLIF(pi.batch_number, ''), ib.batch_id) AS batch_number,
            po.po_number,
            COALESCE(batch_supplier.supplier_name, po_supplier.supplier_name) AS supplier_name,
            ib.received_date,
            ib.created_at,
            CASE
                WHEN ib.received_date >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
                 AND NOT EXISTS (SELECT 1 FROM inventory_transfer_allocations ita WHERE ita.source_batch_id = ib.batch_id)
                 AND NOT EXISTS (SELECT 1 FROM product_selling_stock pss WHERE pss.source_batch_id = ib.batch_id)
                THEN 1 ELSE 0
            END AS can_edit_expiry,
            ib.received_qty AS received_quantity,
            ib.storage_qty,
            COALESCE(selling.shelf_qty, 0) AS shelf_qty,
            ib.damaged_qty,
            (ib.storage_qty + COALESCE(selling.shelf_qty, 0)) AS available_quantity,
            ib.expiry_date,
            ib.no_expiry,
            COALESCE(ib.expiry_alert_days, pi.expiry_alert_days, 30) AS expiry_alert_days,
            ib.expiry_action_status,
            ib.expiry_quarantined_storage_qty,
            COALESCE(selling.quarantined_shelf_qty, 0) AS expiry_quarantined_shelf_qty,
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
            ,EXISTS (SELECT 1 FROM product_specification_values rxv
                INNER JOIN product_specifications rxs ON rxs.specification_id=rxv.specification_id
                WHERE rxv.product_id=ib.product_id
                  AND LOWER(TRIM(rxs.specification_name))='medicine classification'
                  AND LOWER(TRIM(rxv.value_text)) IN ('prescription (rx)','prescription','rx')) AS is_rx
         FROM inventory_batches ib
         LEFT JOIN (
            SELECT source_batch_id,
                   SUM(quantity_remaining) shelf_qty,
                   SUM(expiry_quarantined_qty) quarantined_shelf_qty
            FROM product_selling_stock
            GROUP BY source_batch_id
         ) selling ON selling.source_batch_id = ib.batch_id
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
        $row['unit_cost'] = (float) ($row['unit_cost'] ?? 0);
        $row['storage_qty'] = (int) ($row['storage_qty'] ?? 0);
        $row['shelf_qty'] = (int) ($row['shelf_qty'] ?? 0);
        $row['damaged_qty'] = (int) ($row['damaged_qty'] ?? 0);
        $row['available_quantity'] = (int) ($row['available_quantity'] ?? 0);
        $row['expiry_alert_days'] = (int) ($row['expiry_alert_days'] ?? 30);
        $row['expiry_quarantined_storage_qty'] = (int) ($row['expiry_quarantined_storage_qty'] ?? 0);
        $row['expiry_quarantined_shelf_qty'] = (int) ($row['expiry_quarantined_shelf_qty'] ?? 0);
        $row['expiry_action_status'] = trim((string) ($row['expiry_action_status'] ?? '')) ?: 'Not Reviewed';

        $row['expiry_status'] = inventoryExpiryStatus(
            $row['expiry_date'] ?? null,
            $row['days_until_expiry'] ?? null,
            $row['expiry_alert_days'],
            (int) ($row['no_expiry'] ?? 0) === 1
        );
        if ($row['expiry_status'] === 'Expired') {
            $row['expiry_status'] = 'Expired – Action Required';
        }
        if (in_array($row['expiry_status'], ['Not Recorded', 'No Expiry'], true)) {
            $row['days_until_expiry'] = null;
        }
        $row['expiry_quarantined_quantity'] = $row['expiry_quarantined_storage_qty'] + $row['expiry_quarantined_shelf_qty'];
        return $row;
    }, $statement->fetchAll(PDO::FETCH_ASSOC));

    foreach ($rows as $row) {
        if ($row['expiry_status'] !== 'Expiring Soon') {
            continue;
        }
        $recipients = $pdo->prepare(
            "SELECT DISTINCT u.user_id
             FROM users u
             LEFT JOIN accounts a ON a.user_id = u.user_id AND a.is_active = 1 AND a.is_deleted = 0
             LEFT JOIN account_roles ar ON ar.account_id = a.account_id
             LEFT JOIN roles r ON r.role_id = ar.role_id
             WHERE u.status = 'Active'
               AND COALESCE(u.is_deleted, 0) = 0
               AND (
                    LOWER(REPLACE(REPLACE(TRIM(u.role), ' ', '_'), '-', '_')) IN ('admin', 'super_admin', 'supervisor', 'inventory_manager', 'ro_admin', 'ro_super_admin', 'ro_supervisor', 'ro_inventory_manager')
                    OR LOWER(REPLACE(REPLACE(TRIM(r.name), ' ', '_'), '-', '_')) IN ('admin', 'super_admin', 'supervisor', 'inventory_manager')
                    OR LOWER(REPLACE(REPLACE(TRIM(r.role_identifier), ' ', '_'), '-', '_')) IN ('admin', 'super_admin', 'supervisor', 'inventory_manager', 'ro_admin', 'ro_super_admin', 'ro_supervisor', 'ro_inventory_manager')
               )"
        );
        $recipients->execute();
        $insertNotification = $pdo->prepare(
            'INSERT IGNORE INTO inventory_expiry_alert_notifications (notification_id, batch_id, user_id)
             VALUES (:notification_id, :batch_id, :user_id)'
        );
        foreach ($recipients->fetchAll(PDO::FETCH_COLUMN) as $recipientId) {
            $insertNotification->execute([
                ':notification_id' => newUuid($pdo),
                ':batch_id' => $row['batch_id'],
                ':user_id' => $recipientId
            ]);
        }

        $alert = $pdo->prepare(
            "SELECT activity_id FROM activity_logs
             WHERE module = 'Expiry Monitoring'
               AND action = 'Expiring Soon Alert'
               AND reference_id = :batch_id
             LIMIT 1"
        );
        $alert->execute([':batch_id' => $row['batch_id']]);
        if (!$alert->fetchColumn()) {
            if (!recordActivityLog(
                $pdo,
                'Expiry Monitoring',
                'Expiring Soon Alert',
                sprintf(
                    'Batch %s of %s reaches its %d-day expiry alert window. Notify Admin and Supervisor/Inventory Manager.',
                    $row['batch_number'],
                    $row['product_name'],
                    $row['expiry_alert_days']
                ),
                (string) $row['batch_id']
            )) {
                throw new RuntimeException('Unable to record an expiry alert in the activity history.');
            }
        }
    }

    $notificationsStmt = $pdo->prepare(
        "SELECT n.notification_id, n.batch_id, p.product_name,
                COALESCE(NULLIF(pi.batch_number, ''), ib.batch_id) AS batch_number,
                ib.expiry_date, DATEDIFF(ib.expiry_date, CURRENT_DATE) AS days_until_expiry
         FROM inventory_expiry_alert_notifications n
         INNER JOIN inventory_batches ib ON ib.batch_id = n.batch_id
         INNER JOIN product p ON p.product_id = ib.product_id
         LEFT JOIN product_inventory pi ON pi.inventory_id = ib.legacy_inventory_id
         WHERE n.user_id = :user_id AND n.read_at IS NULL
         ORDER BY n.created_at ASC"
    );
    $notificationsStmt->execute([':user_id' => activityCurrentUserId()]);
    $notifications = $notificationsStmt->fetchAll(PDO::FETCH_ASSOC);
    if ($notifications) {
        $markNotificationsRead = $pdo->prepare(
            'UPDATE inventory_expiry_alert_notifications
             SET read_at = CURRENT_TIMESTAMP
             WHERE user_id = :user_id AND read_at IS NULL'
        );
        $markNotificationsRead->execute([':user_id' => activityCurrentUserId()]);
    }

    echo json_encode(['status' => 'success', 'data' => $rows, 'notifications' => $notifications]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Unable to load expiry monitoring records.',
        'error' => $e->getMessage()
    ]);
}
?>
