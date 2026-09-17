<?php
require_once __DIR__ . '/../config/db_connection.php';

function migrationColumnExists(PDO $pdo, string $table, string $column): bool
{
    $statement = $pdo->prepare('SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=:table_name AND COLUMN_NAME=:column_name');
    $statement->execute([':table_name' => $table, ':column_name' => $column]);
    return (int) $statement->fetchColumn() > 0;
}

function migrationForeignKeyExists(PDO $pdo, string $table, string $column, string $referencedTable): bool
{
    $statement = $pdo->prepare('SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=:table_name AND COLUMN_NAME=:column_name AND REFERENCED_TABLE_NAME=:referenced_table');
    $statement->execute([':table_name' => $table, ':column_name' => $column, ':referenced_table' => $referencedTable]);
    return (int) $statement->fetchColumn() > 0;
}

try {
    $invoiceCount = (int) $pdo->query('SELECT COUNT(*) FROM purchase_order_invoices')->fetchColumn();
    $itemCount = (int) $pdo->query('SELECT COUNT(*) FROM purchase_order_invoice_items')->fetchColumn();
    $deprecatedHeader = ['calculated_total', 'difference', 'match_status'];
    $deprecatedItems = ['invoice_qty', 'purchase_unit', 'line_total'];

    if (($invoiceCount > 0 || $itemCount > 0)
        && (array_filter($deprecatedHeader, fn($column) => migrationColumnExists($pdo, 'purchase_order_invoices', $column))
            || array_filter($deprecatedItems, fn($column) => migrationColumnExists($pdo, 'purchase_order_invoice_items', $column)))) {
        throw new RuntimeException('Normalization stopped: invoice data exists. Verify derived values before dropping deprecated columns.');
    }

    foreach ($deprecatedHeader as $column) {
        if (migrationColumnExists($pdo, 'purchase_order_invoices', $column)) {
            $pdo->exec("ALTER TABLE purchase_order_invoices DROP COLUMN `{$column}`");
        }
    }
    foreach ($deprecatedItems as $column) {
        if (migrationColumnExists($pdo, 'purchase_order_invoice_items', $column)) {
            $pdo->exec("ALTER TABLE purchase_order_invoice_items DROP COLUMN `{$column}`");
        }
    }

    if (!migrationForeignKeyExists($pdo, 'purchase_order_invoices', 'po_id', 'purchase_orders')) {
        $pdo->exec('ALTER TABLE purchase_order_invoices ADD CONSTRAINT fk_purchase_order_invoice_po FOREIGN KEY (po_id) REFERENCES purchase_orders(po_id) ON DELETE RESTRICT');
    }
    if (!migrationForeignKeyExists($pdo, 'purchase_order_invoices', 'recorded_by', 'users')) {
        $pdo->exec('ALTER TABLE purchase_order_invoices ADD CONSTRAINT fk_purchase_order_invoice_user FOREIGN KEY (recorded_by) REFERENCES users(user_id) ON DELETE SET NULL');
    }
    if (!migrationForeignKeyExists($pdo, 'purchase_order_invoice_items', 'invoice_id', 'purchase_order_invoices')) {
        $pdo->exec('ALTER TABLE purchase_order_invoice_items ADD CONSTRAINT fk_purchase_order_invoice_item_invoice FOREIGN KEY (invoice_id) REFERENCES purchase_order_invoices(invoice_id) ON DELETE CASCADE');
    }
    if (!migrationForeignKeyExists($pdo, 'purchase_order_invoice_items', 'po_item_id', 'purchase_order_items')) {
        $pdo->exec('ALTER TABLE purchase_order_invoice_items ADD CONSTRAINT fk_purchase_order_invoice_item_po_line FOREIGN KEY (po_item_id) REFERENCES purchase_order_items(po_item_id) ON DELETE RESTRICT');
    }

    echo json_encode(['status' => 'success', 'message' => 'Purchase-order invoice tables normalized without creating duplicate tables.']);
} catch (Throwable $error) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => $error->getMessage()]);
    exit(1);
}
