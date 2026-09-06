<?php
declare(strict_types=1);

require_once __DIR__ . '/../pharma-api/config/db_connection.php';

const EXPECTED_DATABASE = 'pharma_db';

function scalar(PDO $pdo, string $sql): int
{
    return (int) $pdo->query($sql)->fetchColumn();
}

function tableDigest(PDO $pdo, string $table): string
{
    $primaryKey = $pdo->prepare(
        "SELECT COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table
           AND CONSTRAINT_NAME = 'PRIMARY'
         ORDER BY ORDINAL_POSITION"
    );
    $primaryKey->execute([':table' => $table]);
    $orderColumns = $primaryKey->fetchAll(PDO::FETCH_COLUMN);
    $orderBy = $orderColumns
        ? ' ORDER BY ' . implode(', ', array_map(static fn(string $column): string => "`{$column}`", $orderColumns))
        : '';
    $rows = $pdo->query("SELECT * FROM `{$table}`{$orderBy}")->fetchAll(PDO::FETCH_ASSOC);
    return hash('sha256', json_encode($rows, JSON_PRESERVE_ZERO_FRACTION | JSON_UNESCAPED_UNICODE));
}

function tableCounts(PDO $pdo, array $tables): array
{
    $counts = [];
    foreach ($tables as $table) {
        $counts[$table] = scalar($pdo, "SELECT COUNT(*) FROM `{$table}`");
    }
    return $counts;
}

$database = (string) $pdo->query('SELECT DATABASE()')->fetchColumn();
if ($database !== EXPECTED_DATABASE) {
    throw new RuntimeException("Refusing reset: expected " . EXPECTED_DATABASE . ", connected to {$database}");
}
if (scalar($pdo, 'SELECT @@FOREIGN_KEY_CHECKS') !== 1) {
    throw new RuntimeException('Refusing reset: FOREIGN_KEY_CHECKS is not enabled.');
}

$clearTables = [
    'inventory_receiving_transactions',
    'supplier_credit_applications',
    'supplier_credits',
    'supplier_refunds',
    'supplier_claim_damage_lines',
    'purchase_order_receiving_revisions',
    'purchase_order_receiving_items',
    'purchase_order_receiving',
    'supplier_claims',
    'inventory_transfer_allocations',
    'inventory_transfers',
    'product_selling_stock',
    'inventory_batches',
    'product_inventory',
    'purchase_order_invoice_items',
    'purchase_order_invoices',
    'purchase_order_payments',
    'purchase_order_approval_audit',
    'purchase_order_items',
    'purchase_orders',
    'purchase_request_items',
    'purchase_requests',
    'supplier_product_unit_conversions',
    'supplier_products',
    'product_variations_backup',
    'product_specification_values',
    'grocery_details',
    'medical_supply_details',
    'medicine_details',
    'product_selling_options',
    'product',
];

$protectedTables = [
    'sales_orders',
    'sales_order_items',
    'sales_order_status_history',
    'sales_payments',
    'sales_receipts',
    'cashier_queue',
    'users',
    'roles',
    'accounts',
    'account_roles',
    'account_types',
    'suppliers',
    'product_categories',
    'product_types',
    'product_measurement_units',
    'product_specifications',
    'product_specification_choices',
    'product_type_specifications',
    'lookup_values',
    'system_settings',
    'business_hours',
    'business_hour_exceptions',
    'tenants',
    'tenant_domains',
];

$beforeCounts = tableCounts($pdo, array_merge($clearTables, $protectedTables));
$beforeDigests = [];
foreach ($protectedTables as $table) {
    $beforeDigests[$table] = tableDigest($pdo, $table);
}
$schemaBefore = [
    'tables' => scalar($pdo, "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()"),
    'columns' => scalar($pdo, "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()"),
];

try {
    $pdo->beginTransaction();

    $pdo->exec('DELETE FROM inventory_receiving_transactions');
    $pdo->exec('DELETE FROM supplier_credit_applications');
    $pdo->exec('DELETE FROM supplier_credits');
    $pdo->exec('DELETE FROM supplier_refunds');
    $pdo->exec('DELETE FROM supplier_claim_damage_lines');
    $pdo->exec('DELETE FROM purchase_order_receiving_revisions');

    // Break only nullable self/cross references within the rows being removed.
    $pdo->exec('UPDATE purchase_order_receiving_items SET parent_receiving_item_id = NULL WHERE parent_receiving_item_id IS NOT NULL');
    $pdo->exec('DELETE FROM purchase_order_receiving_items');
    $pdo->exec('UPDATE purchase_order_receiving SET parent_receiving_id = NULL, claim_id = NULL');
    $pdo->exec('DELETE FROM purchase_order_receiving');
    $pdo->exec('DELETE FROM supplier_claims');

    $pdo->exec('DELETE FROM inventory_transfer_allocations');
    $pdo->exec('DELETE FROM inventory_transfers');
    $pdo->exec('DELETE FROM product_selling_stock');
    $pdo->exec('DELETE FROM inventory_batches');
    $pdo->exec('DELETE FROM product_inventory');

    $pdo->exec('DELETE FROM purchase_order_invoice_items');
    $pdo->exec('DELETE FROM purchase_order_invoices');
    $pdo->exec('DELETE FROM purchase_order_payments');
    $pdo->exec('DELETE FROM purchase_order_approval_audit');
    $pdo->exec('DELETE FROM purchase_order_items');
    $pdo->exec('DELETE FROM purchase_orders');
    $pdo->exec('DELETE FROM purchase_request_items');
    $pdo->exec('DELETE FROM purchase_requests');

    $pdo->exec('DELETE FROM supplier_product_unit_conversions');
    $pdo->exec('DELETE FROM supplier_products');
    $pdo->exec("DELETE FROM entity_dimensions WHERE entity_type IN ('product', 'product_variation')");
    $pdo->exec('DELETE FROM product_variations_backup');
    $pdo->exec('DELETE FROM product_specification_values');
    $pdo->exec('DELETE FROM grocery_details');
    $pdo->exec('DELETE FROM medical_supply_details');
    $pdo->exec('DELETE FROM medicine_details');
    $pdo->exec('DELETE FROM product_selling_options');
    $pdo->exec('DELETE FROM product');

    $pdo->exec(
        "DELETE FROM activity_logs
         WHERE module IN ('Goods Received Note', 'Inventory', 'Pricing', 'Products',
                          'Purchase Order', 'Purchase Request', 'Return/Damage')"
    );

    $afterCounts = tableCounts($pdo, array_merge($clearTables, $protectedTables));
    foreach ($clearTables as $table) {
        if ($afterCounts[$table] !== 0) {
            throw new RuntimeException("Validation failed: {$table} has {$afterCounts[$table]} rows.");
        }
    }
    if (scalar($pdo, "SELECT COUNT(*) FROM entity_dimensions WHERE entity_type IN ('product', 'product_variation')") !== 0) {
        throw new RuntimeException('Validation failed: product entity dimensions remain.');
    }
    if (scalar($pdo, "SELECT COUNT(*) FROM activity_logs WHERE module IN ('Goods Received Note', 'Inventory', 'Pricing', 'Products', 'Purchase Order', 'Purchase Request', 'Return/Damage')") !== 0) {
        throw new RuntimeException('Validation failed: operational activity logs remain.');
    }

    foreach ($protectedTables as $table) {
        if ($beforeCounts[$table] !== $afterCounts[$table]) {
            throw new RuntimeException("Protected count changed for {$table}.");
        }
        if ($beforeDigests[$table] !== tableDigest($pdo, $table)) {
            throw new RuntimeException("Protected data changed for {$table}.");
        }
    }

    $receiptLines = scalar(
        $pdo,
        "SELECT COUNT(*)
         FROM sales_receipts r
         INNER JOIN sales_orders o ON o.order_id = r.order_id
         INNER JOIN sales_order_items i ON i.order_id = o.order_id"
    );
    if ($beforeCounts['sales_receipts'] > 0 && $receiptLines === 0) {
        throw new RuntimeException('Validation failed: historical receipts no longer resolve to sale lines.');
    }

    $schemaAfter = [
        'tables' => scalar($pdo, "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()"),
        'columns' => scalar($pdo, "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()"),
    ];
    if ($schemaBefore !== $schemaAfter) {
        throw new RuntimeException('Validation failed: schema table/column counts changed.');
    }

    $pdo->commit();

    echo json_encode([
        'status' => 'committed',
        'database' => $database,
        'foreign_key_checks' => scalar($pdo, 'SELECT @@FOREIGN_KEY_CHECKS'),
        'schema_before' => $schemaBefore,
        'schema_after' => $schemaAfter,
        'before' => $beforeCounts,
        'after' => $afterCounts,
        'historical_receipt_line_joins' => $receiptLines,
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL;
} catch (Throwable $exception) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    fwrite(STDERR, "RESET ROLLED BACK: {$exception->getMessage()}" . PHP_EOL);
    exit(1);
}
