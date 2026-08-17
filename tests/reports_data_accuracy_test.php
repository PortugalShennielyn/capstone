<?php

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$pdo = new PDO(
    'mysql:host=127.0.0.1;dbname=pharma_db;charset=utf8mb4',
    'root',
    '',
    [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]
);

function scalar(PDO $pdo, string $sql)
{
    return $pdo->query($sql)->fetchColumn();
}

function result(string $case, bool $passed, string $detail): array
{
    return ['case' => $case, 'result' => $passed ? 'PASS' : 'NOT AVAILABLE', 'detail' => $detail];
}

$tests = [];
$completedOrders = (int) scalar($pdo, "SELECT COUNT(*) FROM sales_orders WHERE status = 'completed'");
$paidCompletedOrders = (int) scalar($pdo, "SELECT COUNT(DISTINCT o.order_id) FROM sales_orders o JOIN sales_payments p ON p.order_id=o.order_id AND p.payment_status='paid' WHERE o.status='completed'");
$tests[] = result('Completed paid sales only', $completedOrders === $paidCompletedOrders, "{$paidCompletedOrders} completed paid orders");

$multiItemOrders = (int) scalar($pdo, "SELECT COUNT(*) FROM (SELECT order_id FROM sales_order_items GROUP BY order_id HAVING COUNT(*) > 1) x");
$tests[] = result('Multiple sale details under one sale', $multiItemOrders > 0, "{$multiItemOrders} multi-item orders");

$cancelledSales = (int) scalar($pdo, "SELECT COUNT(*) FROM sales_orders WHERE status='cancelled'");
$tests[] = result('Cancelled sale fixture', $cancelledSales > 0, "{$cancelledSales} cancelled orders");

$discountedSales = (int) scalar($pdo, "SELECT COUNT(*) FROM sales_orders o LEFT JOIN sales_payments p ON p.order_id=o.order_id AND p.payment_status='paid' WHERE o.status='completed' AND (COALESCE(o.discount,0)+COALESCE(p.cashier_discount_amount,0))>0");
$tests[] = result('Sale with discount fixture', $discountedSales > 0, "{$discountedSales} discounted completed orders");

$cashiers = (int) scalar($pdo, "SELECT COUNT(DISTINCT COALESCE(o.assigned_cashier_id,p.cashier_id)) FROM sales_orders o JOIN sales_payments p ON p.order_id=o.order_id AND p.payment_status='paid' WHERE o.status='completed'");
$clerks = (int) scalar($pdo, "SELECT COUNT(DISTINCT sales_clerk_id) FROM sales_orders WHERE status='completed' AND sales_clerk_id IS NOT NULL");
$tests[] = result('Multiple cashiers', $cashiers > 1, "{$cashiers} cashier identities");
$tests[] = result('Multiple sales clerks', $clerks > 1, "{$clerks} sales-clerk identities");

$inventory = $pdo->query(
    "SELECT product_id, SUM(shelf_qty) shelf, SUM(storage_qty) storage, COUNT(*) batches,
            COUNT(DISTINCT expiry_date) expiry_dates, MIN(shelf_qty+storage_qty) min_batch_stock
     FROM inventory_batches GROUP BY product_id"
)->fetchAll();
$shelfOnly = count(array_filter($inventory, fn($r) => (int) $r['shelf'] > 0 && (int) $r['storage'] === 0));
$storageOnly = count(array_filter($inventory, fn($r) => (int) $r['shelf'] === 0 && (int) $r['storage'] > 0));
$both = count(array_filter($inventory, fn($r) => (int) $r['shelf'] > 0 && (int) $r['storage'] > 0));
$multiBatch = count(array_filter($inventory, fn($r) => (int) $r['batches'] > 1));
$multiExpiry = count(array_filter($inventory, fn($r) => (int) $r['expiry_dates'] > 1));
$tests[] = result('Product with shelf stock only', $shelfOnly > 0, "{$shelfOnly} products");
$tests[] = result('Product with storage stock only', $storageOnly > 0, "{$storageOnly} products");
$tests[] = result('Product with shelf and storage stock', $both > 0, "{$both} products");
$tests[] = result('Multiple batches for one product', $multiBatch > 0, "{$multiBatch} products");
$tests[] = result('Multiple expiry dates for one product', $multiExpiry > 0, "{$multiExpiry} products");

$zeroProducts = (int) scalar($pdo, "SELECT COUNT(*) FROM product p LEFT JOIN (SELECT product_id,SUM(shelf_qty+storage_qty) qty FROM inventory_batches GROUP BY product_id) b ON b.product_id=p.product_id WHERE COALESCE(b.qty,0)=0");
$negativeBatches = (int) scalar($pdo, "SELECT COUNT(*) FROM inventory_batches WHERE shelf_qty<0 OR storage_qty<0");
$expiredBatches = (int) scalar($pdo, "SELECT COUNT(*) FROM inventory_batches WHERE expiry_date<CURDATE() AND shelf_qty+storage_qty>0");
$depletedBatches = (int) scalar($pdo, "SELECT COUNT(*) FROM inventory_batches WHERE batch_status='depleted' OR shelf_qty+storage_qty=0");
$tests[] = result('Product with zero stock', $zeroProducts > 0, "{$zeroProducts} products");
$tests[] = result('Negative stock fixture', $negativeBatches > 0, "{$negativeBatches} batches");
$tests[] = result('Expired batch fixture', $expiredBatches > 0, "{$expiredBatches} batches");
$tests[] = result('Fully depleted batch fixture', $depletedBatches > 0, "{$depletedBatches} batches");

foreach (['Pending', 'In transit', 'Arrived', 'Delivered', 'Cancelled'] as $status) {
    $count = (int) $pdo->query('SELECT COUNT(*) FROM purchase_orders WHERE status=' . $pdo->quote($status))->fetchColumn();
    $tests[] = result("PO status: {$status}", $count > 0, "{$count} purchase orders");
}

$partialPayments = (int) scalar($pdo, "SELECT COUNT(*) FROM purchase_orders WHERE payment_status='Partially Paid'");
$differentSupplierCosts = (int) scalar($pdo, "SELECT COUNT(*) FROM (SELECT product_id FROM supplier_products WHERE supplier_cost_price IS NOT NULL GROUP BY product_id HAVING COUNT(DISTINCT supplier_cost_price)>1) x");
$tests[] = result('Partial PO payment', $partialPayments > 0, "{$partialPayments} purchase orders");
$tests[] = result('Different supplier costs for one product', $differentSupplierCosts > 0, "{$differentSupplierCosts} products");

foreach ($tests as $test) {
    echo implode(' | ', $test) . PHP_EOL;
}

$passed = count(array_filter($tests, fn($test) => $test['result'] === 'PASS'));
echo "SUMMARY | {$passed}/" . count($tests) . " scenarios represented by current database fixtures" . PHP_EOL;
