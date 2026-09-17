<?php

require_once __DIR__ . '/../config/audit_log.php';

function ensureActivityLogSchema(PDO $pdo): void
{
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS activity_logs (
            activity_id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
            user_id CHAR(36) NULL,
            role VARCHAR(80) NULL,
            module VARCHAR(80) NOT NULL,
            action VARCHAR(80) NOT NULL,
            description TEXT NOT NULL,
            reference_id VARCHAR(80) NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            KEY idx_activity_logs_created_at (created_at),
            KEY idx_activity_logs_module_action (module, action),
            KEY idx_activity_logs_reference (reference_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );
}

function activityCurrentUserId(): ?string
{
    $userId = trim((string) ($_SESSION['user_id'] ?? ''));
    return $userId !== '' ? $userId : null;
}

function activityCurrentRole(): ?string
{
    $role = trim((string) ($_SESSION['role'] ?? ''));
    return $role !== '' ? $role : null;
}

function recordActivityLog(
    PDO $pdo,
    string $module,
    string $action,
    string $description,
    ?string $referenceId = null,
    ?string $userId = null,
    ?string $role = null
): bool {
    try {
        if (!$pdo->inTransaction()) {
            ensureActivityLogSchema($pdo);
        }
        $stmt = $pdo->prepare(
            'INSERT INTO activity_logs
                (activity_id, user_id, role, module, action, description, reference_id)
             VALUES
                (:activity_id, :user_id, :role, :module, :action, :description, :reference_id)'
        );
        $stmt->execute([
            ':activity_id' => newUuid($pdo),
            ':user_id' => $userId ?? activityCurrentUserId(),
            ':role' => $role ?? activityCurrentRole(),
            ':module' => trim($module),
            ':action' => trim($action),
            ':description' => trim($description),
            ':reference_id' => $referenceId,
        ]);
        logAudit($pdo, [
            'module' => auditModuleName($module),
            'action' => auditActionName($action),
            'description' => $description,
            'target_type' => auditTargetType($module),
            'target_id' => $referenceId,
            'reference_id' => $referenceId,
            'user_id' => $userId ?? activityCurrentUserId(),
            'role' => $role ?? activityCurrentRole(),
            'success' => true,
            'idempotency_key' => null,
        ]);
        return true;
    } catch (Throwable $e) {
        error_log('Activity log write failed: ' . $e->getMessage());
        return false;
    }
}

function auditActionName(string $action): string
{
    $normalized = strtolower(trim($action));
    if (in_array($normalized, ['added', 'created', 'submitted', 'generated'], true)) return 'CREATE';
    if (in_array($normalized, ['updated', 'edited', 'supplier invoice', 'supplier response', 'replacement arrival', 'product pricing updated', 'category markup update', 'selected category markup applied', 'automatic delivery update', 'inspection draft saved'], true)) return 'UPDATE';
    if (in_array($normalized, ['deleted', 'deactivated', 'cancelled', 'voided'], true)) return 'DELETE';
    if (in_array($normalized, ['approved', 'approve'], true)) return 'APPROVE';
    if (in_array($normalized, ['rejected', 'reject'], true)) return 'REJECT';
    if (str_contains($normalized, 'payment')) return 'PAYMENT';
    if (str_contains($normalized, 'moved') || str_contains($normalized, 'transfer') || str_contains($normalized, 'returned to storage')) return 'TRANSFER';
    if (str_contains($normalized, 'inspection') || str_contains($normalized, 'received') || str_contains($normalized, 'claim')) return 'INSPECT';
    if (str_contains($normalized, 'status') || in_array($normalized, ['active', 'inactive', 'activated', 'partially received', 'received', 'closed'], true)) return 'STATUS_CHANGE';
    return strtoupper(preg_replace('/[^A-Z0-9_]+/', '_', trim($action)));
}

function auditModuleName(string $module): string
{
    $module = trim($module);
    return match (strtolower($module)) {
        'products' => 'Product Master',
        'pricing' => 'Product Master',
        'inventory' => 'Storage',
        'goods received note' => 'Inspect Deliveries',
        'return/damage' => 'Inspect Deliveries',
        'user management' => 'Users',
        default => $module,
    };
}

function auditTargetType(string $module): string
{
    return match (strtolower(trim($module))) {
        'products', 'pricing' => 'Product',
        'purchase request' => 'Purchase Request',
        'purchase order' => 'Purchase Order',
        'inventory' => 'Inventory',
        'goods received note' => 'GRN',
        'return/damage' => 'Delivery Claim',
        'user management' => 'User',
        default => trim($module) ?: 'Record',
    };
}

function seedActivityLogsFromExistingDashboardSources(PDO $pdo): void
{
    ensureActivityLogSchema($pdo);

    $pdo->exec(
        "INSERT INTO activity_logs (activity_id, module, action, description, reference_id, created_at)
         SELECT UUID(), 'Purchase Order', po.status, CONCAT('PO ', po.po_number, ' is ', po.status), po.po_id, po.created_at
         FROM purchase_orders po
         WHERE NOT EXISTS (
            SELECT 1 FROM activity_logs al
            WHERE al.module = 'Purchase Order'
              AND al.action = po.status
              AND al.reference_id = po.po_id
         )"
    );

    $pdo->exec(
        "INSERT INTO activity_logs (activity_id, module, action, description, reference_id, created_at)
         SELECT UUID(), 'Inventory', 'Received', CONCAT(inv.quantity_stocked, ' received into storage: ', p.product_name), inv.inventory_id, inv.created_at
         FROM product_inventory inv
         INNER JOIN product p ON p.product_id = inv.product_id
         WHERE NOT EXISTS (
            SELECT 1 FROM activity_logs al
            WHERE al.module = 'Inventory'
              AND al.action = 'Received'
              AND al.reference_id = inv.inventory_id
         )"
    );

    $pdo->exec(
        "INSERT INTO activity_logs (activity_id, module, action, description, reference_id, created_at)
         SELECT UUID(), 'Inventory', 'Moved to Shelf', CONCAT(s.quantity_stocked, ' moved to shelf: ', p.product_name), s.selling_stock_id, s.created_at
         FROM product_selling_stock s
         INNER JOIN product p ON p.product_id = s.product_id
         WHERE NOT EXISTS (
            SELECT 1 FROM activity_logs al
            WHERE al.module = 'Inventory'
              AND al.action = 'Moved to Shelf'
              AND al.reference_id = s.selling_stock_id
         )"
    );
}

?>
