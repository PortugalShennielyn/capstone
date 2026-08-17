<?php

require_once __DIR__ . '/../../config/id_helpers.php';

function ensurePurchaseRequestSchema(PDO $pdo): void
{
    $migration = __DIR__ . '/../../migrations/20260807_create_purchase_requests.sql';
    if (!is_file($migration)) {
        throw new RuntimeException('Purchase request migration is missing.');
    }

    $tableCheck = $pdo->query("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'purchase_requests'");
    if ((int) $tableCheck->fetchColumn() === 0) {
        foreach (array_filter(array_map('trim', explode(';', (string) file_get_contents($migration)))) as $statement) {
            $pdo->exec($statement);
        }
    }

    $linkCheck = $pdo->query("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'purchase_order_items' AND COLUMN_NAME = 'pr_item_id'");
    if ((int) $linkCheck->fetchColumn() === 0) {
        $linkMigration = __DIR__ . '/../../migrations/20260808_link_purchase_request_items_to_purchase_order_items.sql';
        if (!is_file($linkMigration)) {
            throw new RuntimeException('Purchase request to purchase order item migration is missing.');
        }
        $pdo->exec(trim((string) file_get_contents($linkMigration)));
    }

    $workflowMigration = __DIR__ . '/../../migrations/20260811_automatic_po_from_purchase_requests.sql';
    if (!is_file($workflowMigration)) {
        throw new RuntimeException('Automatic purchase-order migration is missing.');
    }
    foreach (array_filter(array_map('trim', explode(';', (string) file_get_contents($workflowMigration)))) as $statement) {
        $pdo->exec($statement);
    }

    purchaseRequestEnsureIndex($pdo, 'purchase_orders', 'idx_purchase_orders_pr', ['pr_id']);
    purchaseRequestEnsureForeignKey($pdo, 'purchase_orders', 'fk_purchase_orders_pr', 'pr_id', 'purchase_requests', 'pr_id');
}

function purchaseRequestEnsureIndex(PDO $pdo, string $table, string $index, array $columns): void
{
    $check = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table_name AND INDEX_NAME = :index_name'
    );
    $check->execute([':table_name' => $table, ':index_name' => $index]);
    if ((int) $check->fetchColumn() === 0) {
        $safeColumns = implode(', ', array_map(static fn(string $column): string => '`' . str_replace('`', '', $column) . '`', $columns));
        $pdo->exec("ALTER TABLE `{$table}` ADD KEY `{$index}` ({$safeColumns})");
    }
}

function purchaseRequestEnsureForeignKey(PDO $pdo, string $table, string $constraint, string $column, string $referencedTable, string $referencedColumn): void
{
    $check = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS
         WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = :table_name AND CONSTRAINT_NAME = :constraint_name'
    );
    $check->execute([':table_name' => $table, ':constraint_name' => $constraint]);
    if ((int) $check->fetchColumn() === 0) {
        $pdo->exec(
            "ALTER TABLE `{$table}` ADD CONSTRAINT `{$constraint}` FOREIGN KEY (`{$column}`) " .
            "REFERENCES `{$referencedTable}` (`{$referencedColumn}`)"
        );
    }
}

function sendPurchaseRequestJson(bool $success, string $message, $data = null, int $status = 200): void
{
    http_response_code($status);
    $payload = ['success' => $success, 'status' => $success ? 'success' : 'error', 'message' => $message];
    if ($data !== null) $payload['data'] = $data;
    echo json_encode($payload);
    exit();
}

function readPurchaseRequestPayload(): array
{
    $payload = json_decode(file_get_contents('php://input'), true);
    return is_array($payload) ? $payload : [];
}

function purchaseRequestUnitAllowsDecimals(string $unit): bool
{
    $normalized = strtolower(trim($unit));
    $normalized = preg_replace('/[^a-z]/', '', $normalized);
    return in_array($normalized, [
        'kg', 'kilogram', 'kilograms',
        'g', 'gram', 'grams',
        'l', 'liter', 'liters', 'litre', 'litres',
        'ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres',
    ], true);
}

function positivePurchaseRequestQuantity($value, string $baseInventoryUnit = '')
{
    if (!is_numeric($value)) {
        throw new InvalidArgumentException('Requested quantities must be positive numbers.');
    }
    $quantity = (float) $value;
    if (!is_finite($quantity) || $quantity <= 0) {
        throw new InvalidArgumentException('Requested quantities must be greater than zero.');
    }
    if (!purchaseRequestUnitAllowsDecimals($baseInventoryUnit) && floor($quantity) !== $quantity) {
        throw new InvalidArgumentException('Requested quantities for ' . ($baseInventoryUnit ?: 'countable units') . ' must be whole numbers.');
    }
    return purchaseRequestUnitAllowsDecimals($baseInventoryUnit) ? round($quantity, 2) : (int) $quantity;
}

function purchaseRequestBaseInventoryUnit(PDO $pdo, string $productId): ?string
{
    $stmt = $pdo->prepare(
        "SELECT pmu.unit_name AS base_inventory_unit
         FROM product p
         INNER JOIN product_measurement_units pmu ON pmu.measurement_unit_id=p.inventory_unit_id
         WHERE p.product_id = :product_id
         LIMIT 1"
    );
    $stmt->execute([':product_id' => $productId]);
    $unit = trim((string) $stmt->fetchColumn());
    return $unit !== '' ? $unit : null;
}

function currentUserIsActiveSupervisor(PDO $pdo): bool
{
    $stmt = $pdo->prepare(
        "SELECT COUNT(*) FROM users
         WHERE user_id = :user_id AND role = 'supervisor' AND status = 'Active'
           AND COALESCE(is_deleted, 0) = 0"
    );
    $stmt->execute([':user_id' => cleanId($_SESSION['user_id'] ?? null)]);
    return (int) $stmt->fetchColumn() === 1;
}

function requireActiveSupervisor(PDO $pdo): void
{
    if (!currentSessionHasRbacRole('supervisor') && !currentSessionHasRbacRole('ro_supervisor')) {
        sendPurchaseRequestJson(false, 'Only an active Supervisor account can review purchase requests.', null, 403);
    }
    if (!currentUserIsActiveSupervisor($pdo)) {
        sendPurchaseRequestJson(false, 'Only an active Supervisor account can review purchase requests.', null, 403);
    }
}

function requireActivePurchaseRequestManager(PDO $pdo): void
{
    if (!currentSessionHasRbacRole('manager')
        && !currentSessionHasRbacRole('admin')
        && !currentSessionHasRbacRole('super_admin')
        && !currentSessionHasRbacRole('ro_manager')
        && !currentSessionHasRbacRole('ro_admin')
        && !currentSessionHasRbacRole('ro_super_admin')) {
        sendPurchaseRequestJson(false, 'Only an active Manager/Admin account can generate purchase orders.', null, 403);
    }
    $stmt = $pdo->prepare(
        "SELECT COUNT(*) FROM users
         WHERE user_id = :user_id AND role IN ('manager','admin','super_admin')
           AND status = 'Active' AND COALESCE(is_deleted, 0) = 0"
    );
    $stmt->execute([':user_id' => cleanId($_SESSION['user_id'] ?? null)]);
    if ((int) $stmt->fetchColumn() !== 1) {
        sendPurchaseRequestJson(false, 'Only an active Manager/Admin account can generate purchase orders.', null, 403);
    }
}

function purchaseRequestById(PDO $pdo, string $prId, bool $forUpdate = false): ?array
{
    $sql = 'SELECT pr.*, u.full_name AS requested_by_name,
                   su.full_name AS supervisor_name
            FROM purchase_requests pr
            INNER JOIN users u ON u.user_id = pr.requested_by
            LEFT JOIN users su ON su.user_id = pr.supervisor_user_id
            WHERE pr.pr_id = :pr_id LIMIT 1';
    if ($forUpdate) $sql .= ' FOR UPDATE';
    $stmt = $pdo->prepare($sql);
    $stmt->execute([':pr_id' => $prId]);
    $request = $stmt->fetch(PDO::FETCH_ASSOC);
    return $request ?: null;
}

function purchaseRequestItems(PDO $pdo, string $prId): array
{
    $stmt = $pdo->prepare(
        'SELECT pri.*,
                pri.stock_qty_at_request AS current_stock_snapshot,
                pri.unit_label_at_request AS unit_snapshot,
                p.product_name, p.brand_name,
                TRIM(CONCAT_WS(" · ",
                    NULLIF(CONCAT_WS(" ", NULLIF(md.generic_name,""), COALESCE(NULLIF(CONCAT_WS(" ",md.strength_value,md.strength_unit),""),NULLIF(md.strength,""))), ""),
                    NULLIF(CONCAT_WS(" ",gd.variant,gd.size,gd.net_weight,gd.unit),""),
                    NULLIF(COALESCE(md.dosage_form,gd.package_type,md.package_type),""))) AS specification,
                COALESCE(NULLIF(pri.unit_label_at_request, ""), "pcs") AS unit,
                COALESCE(SUM(CASE
                    WHEN po.po_id IS NOT NULL AND po.status NOT IN ("Cancelled", "Rejected")
                    THEN poi.inventory_qty_ordered ELSE 0 END), 0) AS ordered_qty
         FROM purchase_request_items pri
         INNER JOIN product p ON p.product_id = pri.product_id
         LEFT JOIN medicine_details md ON md.product_id = p.product_id
         LEFT JOIN grocery_details gd ON gd.product_id = p.product_id
         LEFT JOIN purchase_order_items poi ON poi.pr_item_id = pri.pr_item_id
         LEFT JOIN purchase_orders po ON po.po_id = poi.po_id
         WHERE pri.pr_id = :pr_id
         GROUP BY pri.pr_item_id
         ORDER BY pri.created_at, pri.pr_item_id'
    );
    $stmt->execute([':pr_id' => $prId]);
    $items = $stmt->fetchAll(PDO::FETCH_ASSOC);
    foreach ($items as &$item) {
        $item['remaining_qty'] = max(0, (float) $item['requested_qty'] - (float) $item['ordered_qty']);
    }
    unset($item);
    return $items;
}

function purchaseRequestPurchaseOrders(PDO $pdo, string $prId): array
{
    $stmt = $pdo->prepare(
        'SELECT po.po_id, po.po_number, po.status, po.supplier_id,
                po.payment_terms, po.expected_delivery_date, po.total_amount,
                s.supplier_name,
                COALESCE(SUM(poi.inventory_qty_ordered), 0) AS ordered_qty
         FROM purchase_orders po
         LEFT JOIN purchase_order_items poi ON poi.po_id = po.po_id
         LEFT JOIN suppliers s ON s.supplier_id = po.supplier_id
         WHERE po.pr_id = :pr_id
         GROUP BY po.po_id
         ORDER BY po.created_at, po.po_number'
    );
    $stmt->execute([':pr_id' => $prId]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function purchaseRequestPurchaseOrdersForRequests(PDO $pdo, array $prIds): array
{
    $ids = array_values(array_unique(array_filter(array_map('cleanId', $prIds))));
    if (!$ids) return [];
    $params = [];
    $placeholders = [];
    foreach ($ids as $index => $id) {
        $placeholder = ':pr_' . $index;
        $placeholders[] = $placeholder;
        $params[$placeholder] = $id;
    }
    $stmt = $pdo->prepare(
        'SELECT po.pr_id, po.po_id, po.po_number, po.status, po.supplier_id,
                po.payment_terms, po.expected_delivery_date, po.total_amount,
                s.supplier_name,
                COALESCE(SUM(poi.inventory_qty_ordered), 0) AS ordered_qty
         FROM purchase_orders po
         LEFT JOIN purchase_order_items poi ON poi.po_id = po.po_id
         LEFT JOIN suppliers s ON s.supplier_id = po.supplier_id
         WHERE po.pr_id IN (' . implode(',', $placeholders) . ')
         GROUP BY po.po_id
         ORDER BY po.created_at, po.po_number'
    );
    $stmt->execute($params);
    $grouped = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $purchaseOrder) {
        $grouped[(string) $purchaseOrder['pr_id']][] = $purchaseOrder;
    }
    return $grouped;
}

function nextPurchaseRequestNumber(): string
{
    return 'PR-' . date('Ymd-His') . '-' . strtoupper(bin2hex(random_bytes(2)));
}

function purchaseRequestRelatedPurchaseOrders(PDO $pdo, string $prId): ?array
{
    $stmt = $pdo->prepare(
        'SELECT pr.pr_id, pr.pr_number,
                po.po_id, po.po_number, po.supplier_id, po.total_amount,
                po.expected_delivery_date, po.status, po.created_at AS order_date,
                s.supplier_name,
                COUNT(DISTINCT poi.product_id) AS product_count,
                GROUP_CONCAT(
                    DISTINCT COALESCE(
                        NULLIF(TRIM(poi.product_name_snapshot), ""),
                        NULLIF(TRIM(p.product_name), ""),
                        "Unnamed product"
                    )
                    ORDER BY COALESCE(NULLIF(TRIM(poi.product_name_snapshot), ""), NULLIF(TRIM(p.product_name), ""))
                    SEPARATOR ", "
                ) AS item_names
         FROM purchase_requests pr
         LEFT JOIN purchase_orders po ON po.pr_id = pr.pr_id
         LEFT JOIN suppliers s ON s.supplier_id = po.supplier_id
         LEFT JOIN purchase_order_items poi ON poi.po_id = po.po_id
         LEFT JOIN product p ON p.product_id = poi.product_id
         WHERE pr.pr_id = :pr_id
         GROUP BY pr.pr_id, pr.pr_number, po.po_id, po.po_number, po.supplier_id,
                  po.total_amount, po.expected_delivery_date, po.status, po.created_at,
                  s.supplier_name
         ORDER BY po.created_at, po.po_number'
    );
    $stmt->execute([':pr_id' => $prId]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    if (!$rows) return null;

    $orders = array_values(array_filter($rows, static fn(array $row): bool => !empty($row['po_id'])));
    return [
        'pr_id' => (string) $rows[0]['pr_id'],
        'pr_number' => (string) $rows[0]['pr_number'],
        'purchase_orders' => $orders,
    ];
}

function activePurchaseRequestStatuses(): array
{
    // Partially Ordered is included for forward compatibility, although the
    // current purchase_requests enum does not expose that state yet.
    return ['Draft', 'Pending Supervisor Approval', 'Approved', 'Revision Requested', 'Partially Ordered'];
}

function activePurchaseRequestConflict(PDO $pdo, string $productId, ?string $excludePrId = null): ?array
{
    $statuses = activePurchaseRequestStatuses();
    $statusPlaceholders = implode(',', array_fill(0, count($statuses), '?'));
    $sql = "SELECT pr.pr_id, pr.pr_number, pr.status, pri.requested_qty
            FROM purchase_request_items pri
            INNER JOIN purchase_requests pr ON pr.pr_id = pri.pr_id
            WHERE pri.product_id = ?
              AND pr.status IN ({$statusPlaceholders})
              AND (
                pr.status <> 'Approved'
                OR pri.requested_qty > COALESCE((
                    SELECT SUM(poi.inventory_qty_ordered)
                    FROM purchase_order_items poi
                    INNER JOIN purchase_orders po ON po.po_id = poi.po_id
                    WHERE poi.pr_item_id = pri.pr_item_id
                      AND po.status NOT IN ('Cancelled', 'Rejected')
                ), 0)
              )";
    $params = array_merge([$productId], $statuses);
    if ($excludePrId !== null && $excludePrId !== '') {
        $sql .= ' AND pr.pr_id <> ?';
        $params[] = $excludePrId;
    }
    $sql .= " ORDER BY
                CASE pr.status
                    WHEN 'Approved' THEN 1
                    WHEN 'Pending Supervisor Approval' THEN 2
                    WHEN 'Revision Requested' THEN 3
                    WHEN 'Draft' THEN 4
                    ELSE 5
                END,
                pr.created_at DESC
              LIMIT 1";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function assertNoActivePurchaseRequestConflict(PDO $pdo, string $productId, string $productName, ?string $excludePrId = null): void
{
    $conflict = activePurchaseRequestConflict($pdo, $productId, $excludePrId);
    if (!$conflict) return;

    $quantity = (float) ($conflict['requested_qty'] ?? 0);
    $formattedQuantity = fmod($quantity, 1.0) === 0.0 ? (string) (int) $quantity : rtrim(rtrim(number_format($quantity, 2, '.', ''), '0'), '.');
    throw new InvalidArgumentException(
        trim($productName) . ' already has ' . $formattedQuantity . ' units requested in ' . ($conflict['pr_number'] ?? 'an active purchase request') . '.'
    );
}

function assertProductHasActiveSupplierAssignment(PDO $pdo, string $productId, string $productName): void
{
    $stmt = $pdo->prepare(
        'SELECT sp.supplier_product_id
         FROM supplier_products sp
         INNER JOIN suppliers s ON s.supplier_id = sp.supplier_id
         WHERE sp.product_id = :product_id
           AND s.archived_at IS NULL
         LIMIT 1
         FOR UPDATE'
    );
    $stmt->execute([':product_id' => $productId]);
    if ($stmt->fetchColumn() !== false) return;

    $name = trim($productName) !== '' ? trim($productName) : 'This product';
    throw new InvalidArgumentException($name . ' cannot be requested because no supplier is assigned.');
}

function assertPurchaseRequestHasActiveSupplierAssignments(PDO $pdo, string $prId): void
{
    foreach (purchaseRequestItems($pdo, $prId) as $item) {
        assertProductHasActiveSupplierAssignment(
            $pdo,
            cleanId($item['product_id'] ?? null),
            (string) ($item['product_name'] ?? '')
        );
    }
}

function purchaseRequestProcurementByProducts(PDO $pdo, array $productIds): array
{
    $productIds = array_values(array_unique(array_filter(array_map('cleanId', $productIds))));
    if (!$productIds) return [];

    ensurePurchaseRequestSchema($pdo);
    $statuses = activePurchaseRequestStatuses();
    $productPlaceholders = implode(',', array_fill(0, count($productIds), '?'));
    $statusPlaceholders = implode(',', array_fill(0, count($statuses), '?'));
    $stmt = $pdo->prepare(
        "SELECT pri.pr_item_id, pri.product_id, pri.requested_qty, pr.pr_id, pr.pr_number, pr.status,
                pr.created_at, poi.po_id AS linked_po_id, po.po_number, po.status AS po_status
         FROM purchase_request_items pri
         INNER JOIN purchase_requests pr ON pr.pr_id = pri.pr_id
         LEFT JOIN purchase_order_items poi ON poi.pr_item_id = pri.pr_item_id
         LEFT JOIN purchase_orders po ON po.po_id = poi.po_id
         WHERE pri.product_id IN ({$productPlaceholders})
           AND pr.status IN ({$statusPlaceholders})
         ORDER BY pr.created_at DESC, pr.pr_id DESC"
    );
    $stmt->execute(array_merge($productIds, $statuses));

    $result = [];
    $seenRequestItems = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $productId = cleanId($row['product_id'] ?? null);
        if (!isset($result[$productId])) {
            $result[$productId] = [
                'procurement_status' => null,
                'active_pr_number' => $row['pr_number'] ?? null,
                'active_pr_status' => $row['status'] ?? null,
                'active_pr_requested_qty' => 0,
                'active_pr_count' => 0,
                'po_number' => null,
                'po_status' => null,
            ];
        }
        $requestItemKey = (string) ($row['pr_item_id'] ?? '');
        if (!isset($seenRequestItems[$productId][$requestItemKey])) {
            $result[$productId]['active_pr_requested_qty'] += (float) ($row['requested_qty'] ?? 0);
            $result[$productId]['active_pr_count']++;
            $seenRequestItems[$productId][$requestItemKey] = true;
        }

        $poStatus = trim((string) ($row['po_status'] ?? ''));
        $poIncoming = !empty($row['linked_po_id'])
            && $poStatus !== ''
        && !in_array($poStatus, ['Delivered', 'Cancelled', 'Rejected'], true);
        if ($poIncoming) {
            $result[$productId]['procurement_status'] = 'PO Incoming';
            $result[$productId]['po_number'] = $row['po_number'] ?? null;
            $result[$productId]['po_status'] = $poStatus;
        } elseif ($result[$productId]['procurement_status'] !== 'PO Incoming') {
            $result[$productId]['procurement_status'] = ($row['status'] ?? '') === 'Approved' ? 'PR Approved' : 'PR Pending';
        }
    }

    return $result;
}

?>
