<?php
require_once __DIR__ . '/../pharma-api/config/db_connection.php';
require_once __DIR__ . '/../pharma-api/v1/inventory/expiry_case_helpers.php';
require_once __DIR__ . '/../pharma-api/v1/inventory/inventory_stock_summary.php';

$tables = $pdo->query("SELECT TABLE_NAME FROM information_schema.TABLES
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('inventory_resolution_cases','inventory_resolution_case_events')")
    ->fetchAll(PDO::FETCH_COLUMN);
if (count($tables) !== 2) throw new RuntimeException('Resolution-case tables are missing.');
$caseApiSource = file_get_contents(__DIR__ . '/../pharma-api/v1/inventory/get_expiry_cases.php');
if (!preg_match('/\$statement = \$pdo->query\("(.*?)"\);/s', $caseApiSource, $queryMatch)) {
    throw new RuntimeException('Case listing query was not found.');
}
$pdo->query(stripcslashes($queryMatch[1]))->fetchAll(PDO::FETCH_ASSOC);

$source = $pdo->query("SELECT ib.batch_id,ib.legacy_inventory_id,ib.storage_qty,pss.selling_stock_id,
        pss.quantity_remaining,pss.expiry_quarantined_qty
        FROM inventory_batches ib
        INNER JOIN product_selling_stock pss ON pss.source_batch_id=ib.batch_id
        WHERE ib.storage_qty>0 AND ib.expiry_quarantined_storage_qty=0
          AND pss.quantity_remaining>0 AND pss.expiry_quarantined_qty=0
        ORDER BY ib.storage_qty DESC LIMIT 1")->fetch(PDO::FETCH_ASSOC);
if (!$source) throw new RuntimeException('No unreserved batch with Shelf and Storage stock is available for the rollback test.');

$pdo->beginTransaction();
try {
    $stockSql = inventoryStockSummarySql();
    $stock = $pdo->prepare("SELECT storage_quantity,shelf_quantity FROM ({$stockSql}) summary WHERE product_id=:product_id");
    $product = $pdo->prepare('SELECT product_id FROM inventory_batches WHERE batch_id=:batch_id');
    $product->execute([':batch_id'=>$source['batch_id']]);
    $productId = $product->fetchColumn();
    $stock->execute([':product_id'=>$productId]);
    $before = $stock->fetch(PDO::FETCH_ASSOC);
    $pdo->prepare('UPDATE inventory_batches SET expiry_quarantined_storage_qty=1 WHERE batch_id=:id')
        ->execute([':id'=>$source['batch_id']]);
    $pdo->prepare('UPDATE product_selling_stock SET expiry_quarantined_qty=1 WHERE selling_stock_id=:id')
        ->execute([':id'=>$source['selling_stock_id']]);
    $stock->execute([':product_id'=>$productId]);
    $reserved = $stock->fetch(PDO::FETCH_ASSOC);
    if ((int)$reserved['storage_quantity'] !== (int)$before['storage_quantity']-1
        || (int)$reserved['shelf_quantity'] !== (int)$before['shelf_quantity']-1) {
        throw new RuntimeException('Pulled-out stock is still counted in Storage Inventory.');
    }
    expiryCaseConsumeReserved($pdo,
        ['batch_id'=>$source['batch_id'],'storage_qty'=>1,'shelf_qty'=>1],
        ['legacy_inventory_id'=>$source['legacy_inventory_id']]);
    $check = $pdo->prepare('SELECT storage_qty,expiry_quarantined_storage_qty FROM inventory_batches WHERE batch_id=:id');
    $check->execute([':id'=>$source['batch_id']]);
    $batch = $check->fetch(PDO::FETCH_ASSOC);
    $check = $pdo->prepare('SELECT quantity_remaining,expiry_quarantined_qty FROM product_selling_stock WHERE selling_stock_id=:id');
    $check->execute([':id'=>$source['selling_stock_id']]);
    $shelf = $check->fetch(PDO::FETCH_ASSOC);
    if ((int)$batch['storage_qty'] !== (int)$source['storage_qty']-1
        || (int)$shelf['quantity_remaining'] !== (int)$source['quantity_remaining']-1
        || (int)$batch['expiry_quarantined_storage_qty'] !== 0
        || (int)$shelf['expiry_quarantined_qty'] !== 0) {
        throw new RuntimeException('Reserved base-unit stock was not deducted exactly once.');
    }
    echo "Resolution schema and Shelf/Storage deduction checks passed (transaction rolled back).\n";
} finally {
    $pdo->rollBack();
}
