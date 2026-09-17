<?php
require_once '../../config/db_connection.php';
$allowedRoles = ['super_admin', 'admin', 'manager', 'supervisor', 'ro-admin', 'ro-super-admin', 'ro-manager', 'ro-supervisor'];
require_once '../../config/require_auth.php';
require_once '../inventory/inventory_stock_summary.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Only GET requests are allowed.']);
    exit();
}

function alertRows(PDO $pdo, string $sql, array $params = []): array
{
    $statement = $pdo->prepare($sql);
    $statement->execute($params);
    return $statement->fetchAll(PDO::FETCH_ASSOC);
}

function alertProductSpecificationSql(): string
{
    return "COALESCE(
        NULLIF(specs.normalized_specification, ''),
        NULLIF(TRIM(CONCAT_WS(' / ',
            COALESCE(NULLIF(md.strength, ''), NULLIF(TRIM(CONCAT_WS(' ', md.strength_value, md.strength_unit)), '')),
            NULLIF(md.dosage_form, ''), NULLIF(gd.variant, ''), NULLIF(gd.size, ''),
            NULLIF(msd.variant, ''), NULLIF(msd.size, '')
        )), ''),
        'Not specified'
    )";
}

function alertProductSpecificationJoin(): string
{
    return "LEFT JOIN medicine_details md ON md.product_id = p.product_id
        LEFT JOIN grocery_details gd ON gd.product_id = p.product_id
        LEFT JOIN medical_supply_details msd ON msd.product_id = p.product_id
        LEFT JOIN (
            SELECT psv.product_id,
                   GROUP_CONCAT(COALESCE(NULLIF(TRIM(psv.value_text), ''),
                       TRIM(CONCAT(TRIM(TRAILING '.' FROM TRIM(TRAILING '0' FROM CAST(psv.value_number AS CHAR))),
                           CASE WHEN COALESCE(NULLIF(pmu.unit_symbol, ''), pmu.unit_name) IS NULL THEN ''
                                ELSE CONCAT(' ', COALESCE(NULLIF(pmu.unit_symbol, ''), pmu.unit_name)) END
                       ))) ORDER BY COALESCE(pts.sort_order, 2147483647), ps.specification_name SEPARATOR ' • ') AS normalized_specification
            FROM product_specification_values psv
            INNER JOIN product specification_product ON specification_product.product_id = psv.product_id
            INNER JOIN product_specifications ps ON ps.specification_id = psv.specification_id
            LEFT JOIN product_type_specifications pts ON pts.type_id = specification_product.type_id AND pts.specification_id = psv.specification_id
            LEFT JOIN product_measurement_units pmu ON pmu.measurement_unit_id = psv.measurement_unit_id
            WHERE NULLIF(TRIM(psv.value_text), '') IS NOT NULL OR psv.value_number IS NOT NULL
            GROUP BY psv.product_id
        ) specs ON specs.product_id = p.product_id";
}

try {
    $type = strtolower(trim((string) ($_GET['type'] ?? '')));
    $allowed = ['in_stock', 'low_stock', 'out_stock', 'low_shelf', 'reorder_needed', 'missing_expiry', 'expiring_soon', 'pending_po', 'awaiting_inspection', 'replacement_pending', 'supplier_credit_pending', 'pending_pr_approval', 'expiry_alert'];
    if (!in_array($type, $allowed, true)) {
        throw new InvalidArgumentException('Invalid alert type.');
    }

    $rows = [];
    $stockSql = inventoryStockSummarySql();
    $specification = alertProductSpecificationSql();
    $specificationJoin = alertProductSpecificationJoin();

    if ($type === 'pending_pr_approval') {
        $rows = alertRows($pdo, "SELECT pr.pr_id, pr.pr_number, u.full_name AS requested_by_name,
                pr.request_date, COUNT(pri.pr_item_id) AS item_count, pr.status AS record_status
            FROM purchase_requests pr
            INNER JOIN users u ON u.user_id = pr.requested_by
            LEFT JOIN purchase_request_items pri ON pri.pr_id = pr.pr_id
            WHERE pr.status = 'Pending Supervisor Approval'
            GROUP BY pr.pr_id, pr.pr_number, u.full_name, pr.request_date, pr.status, pr.created_at
            ORDER BY pr.request_date ASC, pr.created_at ASC, pr.pr_number ASC");
        foreach ($rows as &$row) {
            $row['item_count'] = (int) $row['item_count'];
            $row['action_label'] = 'View';
            $row['action_href'] = 'purchase_requests.html?pr_id=' . rawurlencode((string) $row['pr_id']);
        }
        unset($row);
    } elseif ($type === 'expiry_alert') {
        $rows = alertRows($pdo, "SELECT ib.batch_id AS batch_number, p.product_name, p.brand_name,
                {$specification} AS specification, ib.storage_qty AS storage_quantity,
                COALESCE(selling.shelf_qty, 0) AS shelf_quantity, ib.expiry_date,
                DATEDIFF(ib.expiry_date, CURDATE()) AS days_remaining,
                CASE WHEN ib.expiry_date < CURDATE() THEN 'Expired' ELSE 'Near Expiry' END AS record_status
            FROM inventory_batches ib
            INNER JOIN product p ON p.product_id = ib.product_id
            LEFT JOIN product_inventory pi ON pi.inventory_id = ib.legacy_inventory_id
            LEFT JOIN (SELECT source_batch_id, SUM(quantity_remaining) AS shelf_qty FROM product_selling_stock GROUP BY source_batch_id) selling ON selling.source_batch_id = ib.batch_id
            {$specificationJoin}
            WHERE ib.batch_status = 'active'
              AND ib.storage_qty + COALESCE(selling.shelf_qty, 0) > 0
              AND ib.expiry_date IS NOT NULL
              AND (ib.expiry_date < CURDATE()
                   OR DATEDIFF(ib.expiry_date, CURDATE()) <= COALESCE(pi.expiry_alert_days, 30))
            ORDER BY CASE WHEN ib.expiry_date < CURDATE() THEN 0 ELSE 1 END,
                     CASE WHEN ib.expiry_date < CURDATE()
                          THEN -DATEDIFF(ib.expiry_date, CURDATE())
                          ELSE DATEDIFF(ib.expiry_date, CURDATE()) END,
                     p.product_name, ib.batch_id");
        foreach ($rows as &$row) {
            $row['storage_quantity'] = (int) $row['storage_quantity'];
            $row['shelf_quantity'] = (int) $row['shelf_quantity'];
            $row['days_remaining'] = (int) $row['days_remaining'];
        }
        unset($row);
    } elseif (in_array($type, ['in_stock', 'low_stock', 'out_stock', 'low_shelf', 'reorder_needed'], true)) {
        $condition = match ($type) {
            'in_stock' => "stock.stock_status = 'In Stock'",
            'low_stock' => "stock.stock_status = 'Low Stock'",
            'out_stock' => '(stock.current_storage_quantity + stock.current_shelf_quantity) = 0',
            'low_shelf' => '(stock.current_storage_quantity + stock.current_shelf_quantity) > 0 AND stock.current_shelf_quantity <= stock.shelf_minimum',
            default => '(stock.current_storage_quantity + stock.current_shelf_quantity) > 0 AND (stock.current_storage_quantity + stock.current_shelf_quantity) <= stock.reorder_level',
        };
        $rows = alertRows($pdo, "SELECT p.product_id, p.brand_name, p.product_name, {$specification} AS specification,
                stock.current_shelf_quantity AS shelf_quantity, stock.current_storage_quantity AS storage_quantity,
                stock.current_storage_quantity + stock.current_shelf_quantity AS on_hand,
                stock.shelf_minimum, stock.reorder_level AS reorder_point
            FROM ({$stockSql}) stock
            INNER JOIN product p ON p.product_id = stock.product_id
            {$specificationJoin}
            WHERE COALESCE(NULLIF(TRIM(p.status), ''), 'Active') <> 'Inactive' AND {$condition}
            ORDER BY p.product_name, p.brand_name");
        foreach ($rows as &$row) {
            $row['shelf_quantity'] = (int) $row['shelf_quantity'];
            $row['storage_quantity'] = (int) $row['storage_quantity'];
            $row['on_hand'] = (int) $row['on_hand'];
            $row['shelf_minimum'] = (int) $row['shelf_minimum'];
            $row['reorder_point'] = (int) $row['reorder_point'];
            $row['record_status'] = match ($type) {
                'in_stock' => 'In Stock',
                'low_stock' => 'Low Stock',
                'out_stock' => 'Out of Stock',
                default => (string) ($row['record_status'] ?? ''),
            };
            if ($type === 'low_shelf' && $row['storage_quantity'] > 0) {
                $row['action_label'] = 'Transfer to Shelf';
                $row['action_href'] = 'inventory.html?view=storage&product_id=' . rawurlencode((string) $row['product_id']);
            } else {
                $row['action_label'] = in_array($type, ['in_stock', 'low_stock', 'out_stock'], true) ? 'Open Inventory' : ($type === 'low_shelf' ? 'Create PR' : 'Create / View PR');
                $row['action_href'] = in_array($type, ['in_stock', 'low_stock', 'out_stock'], true)
                    ? 'inventory.html?product_id=' . rawurlencode((string) $row['product_id'])
                    : 'purchase_requests.html?create=1&source=dashboard&product_ids=' . rawurlencode((string) $row['product_id']);
                if ($type === 'low_shelf') $row['action_note'] = 'No Storage Stock';
            }
        }
        unset($row);
    } elseif (in_array($type, ['missing_expiry', 'expiring_soon'], true)) {
        $expiryCondition = $type === 'missing_expiry'
            ? 'ib.expiry_date IS NULL'
            : 'ib.expiry_date >= CURDATE() AND DATEDIFF(ib.expiry_date, CURDATE()) <= COALESCE(pi.expiry_alert_days, 30)';
        $rows = alertRows($pdo, "SELECT ib.batch_id AS batch_number, p.brand_name, p.product_name,
                {$specification} AS specification, ib.received_date, ib.expiry_date,
                DATEDIFF(ib.expiry_date, CURDATE()) AS days_remaining,
                ib.storage_qty + COALESCE(selling.shelf_qty, 0) AS quantity,
                CASE WHEN ib.storage_qty > 0 AND COALESCE(selling.shelf_qty, 0) > 0 THEN 'Storage & Shelf'
                     WHEN ib.storage_qty > 0 THEN 'Storage' ELSE 'Shelf' END AS location
            FROM inventory_batches ib
            INNER JOIN product p ON p.product_id = ib.product_id
            LEFT JOIN product_inventory pi ON pi.inventory_id = ib.legacy_inventory_id
            LEFT JOIN (SELECT source_batch_id, SUM(quantity_remaining) AS shelf_qty FROM product_selling_stock GROUP BY source_batch_id) selling ON selling.source_batch_id = ib.batch_id
            {$specificationJoin}
            WHERE ib.batch_status = 'active'
              AND ib.storage_qty + COALESCE(selling.shelf_qty, 0) > 0
              AND {$expiryCondition}
            ORDER BY ib.expiry_date, p.product_name, ib.received_date");
        foreach ($rows as &$row) {
            $row['quantity'] = (int) $row['quantity'];
            $row['days_remaining'] = $row['days_remaining'] === null ? null : (int) $row['days_remaining'];
            $row['action_label'] = $type === 'missing_expiry' ? 'Record Expiry Date' : 'Review Batch';
            $row['action_href'] = 'expiry_monitoring.html?batch_id=' . rawurlencode((string) $row['batch_number']);
        }
        unset($row);
    } elseif ($type === 'pending_po') {
        $rows = alertRows($pdo, "SELECT po.po_number, s.supplier_name, po.created_at AS order_date,
                po.expected_delivery_date, COALESCE(NULLIF(po.final_payment, 0), po.total_amount, 0) AS total_amount,
                po.status AS record_status, po.po_id
            FROM purchase_orders po INNER JOIN suppliers s ON s.supplier_id = po.supplier_id
            WHERE po.status = 'Pending' ORDER BY po.created_at, po.po_number");
        foreach ($rows as &$row) {
            $row['action_label'] = 'View PO';
            $row['action_href'] = 'purchase_orders.html?status=Pending&po_id=' . rawurlencode((string) $row['po_id']);
        }
        unset($row);
    } elseif ($type === 'awaiting_inspection') {
        $rows = alertRows($pdo, "SELECT po.po_id, po.po_number, s.supplier_name,
                COALESCE(receiving.received_date, po.created_at) AS received_date,
                COALESCE(receiving.inspection_status, 'Awaiting Inspection') AS record_status
            FROM purchase_orders po
            INNER JOIN suppliers s ON s.supplier_id = po.supplier_id
            LEFT JOIN (
                SELECT por.po_id, MAX(por.received_date) AS received_date, MAX(por.inspection_status) AS inspection_status
                FROM purchase_order_receiving por GROUP BY por.po_id
            ) receiving ON receiving.po_id = po.po_id
            WHERE (po.status = 'Arrived' OR receiving.po_id IS NOT NULL)
              AND COALESCE(receiving.inspection_status, CASE WHEN po.status = 'Arrived' THEN 'Awaiting Inspection' END) LIKE 'Awaiting%'
            ORDER BY received_date, po.po_number");
        foreach ($rows as &$row) {
            $row['action_label'] = 'Inspect Delivery';
            $row['action_href'] = 'inspect_deliveries.html?po_id=' . rawurlencode((string) $row['po_id']);
        }
        unset($row);
    } else {
        $claimCondition = $type === 'replacement_pending'
            ? "(sc.resolution_type = 'Replacement' OR sc.claim_status LIKE '%Replacement%')"
            : "(sc.resolution_type IN ('Next PO Credit', 'Credit', 'Supplier Credit') OR sc.claim_status LIKE '%Credit%')";
        $rows = alertRows($pdo, "SELECT sc.claim_id, po.po_number, s.supplier_name,
                COALESCE(NULLIF(poi.product_name_snapshot, ''), p.product_name, 'Unnamed product') AS product_name,
                COALESCE(NULLIF(sc.action_quantity, 0), sc.affected_quantity, 0) AS quantity,
                sc.created_at AS reported_date, sc.claim_status AS record_status
            FROM supplier_claims sc
            INNER JOIN purchase_order_items poi ON poi.po_item_id = sc.po_item_id
            INNER JOIN purchase_orders po ON po.po_id = poi.po_id
            INNER JOIN suppliers s ON s.supplier_id = po.supplier_id
            LEFT JOIN product p ON p.product_id = poi.product_id
            WHERE {$claimCondition}
              AND sc.claim_status NOT IN ('Resolved', 'Resolved / Credit Issued', 'Replacement Received / Resolved', 'Completed')
            ORDER BY sc.created_at, po.po_number");
        foreach ($rows as &$row) {
            $row['quantity'] = (int) $row['quantity'];
            $row['action_label'] = 'Review Claim';
            $row['action_href'] = 'return_damage.html?claim_id=' . rawurlencode((string) $row['claim_id']);
        }
        unset($row);
    }

    echo json_encode(['status' => 'success', 'type' => $type, 'count' => count($rows), 'data' => $rows]);
} catch (Throwable $error) {
    $validation = $error instanceof InvalidArgumentException;
    http_response_code($validation ? 422 : 500);
    echo json_encode(['status' => 'error', 'message' => $validation ? $error->getMessage() : 'Unable to load alert details.']);
}
?>
