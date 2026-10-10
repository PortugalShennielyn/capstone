<?php
declare(strict_types=1);

$pdo = new PDO('mysql:host=127.0.0.1;dbname=pharma_db;charset=utf8mb4', 'root', '', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
require_once __DIR__ . '/../pharma-api/v1/cashier/cashier_helpers.php';
function uuid(PDO $pdo): string { return (string) $pdo->query('SELECT UUID()')->fetchColumn(); }
function assertSameValue($expected, $actual, string $message): void {
    if ($expected !== $actual) throw new RuntimeException("{$message}: expected " . var_export($expected, true) . ', got ' . var_export($actual, true));
}
function postTransfer(string $token, array $payload): array {
    $context = stream_context_create(['http'=>[
        'method'=>'POST', 'ignore_errors'=>true,
        'header'=>"Content-Type: application/json\r\nX-Tab-Token: {$token}\r\n",
        'content'=>json_encode($payload, JSON_THROW_ON_ERROR),
    ]]);
    $raw = file_get_contents('http://localhost/PharmacySystem_for_DocR/pharma-api/v1/inventory/transfer_stock.php', false, $context);
    $decoded = json_decode((string) $raw, true);
    if (!is_array($decoded)) throw new RuntimeException('Transfer endpoint returned invalid JSON: ' . $raw);
    return $decoded;
}

$ids = [];
try {
    $userId = (string) $pdo->query("SELECT user_id FROM users WHERE status='Active' LIMIT 1")->fetchColumn();
    $typeId = (string) $pdo->query('SELECT type_id FROM product_types LIMIT 1')->fetchColumn();
    $inventoryUnitId = (string) $pdo->query("SELECT measurement_unit_id FROM product_measurement_units WHERE measurement_group='Count' AND LOWER(unit_name)='pc' LIMIT 1")->fetchColumn();
    if ($userId === '' || $typeId === '' || $inventoryUnitId === '') throw new RuntimeException('An active user, product type, and Pc unit are required.');
    $token = bin2hex(random_bytes(32));
    $ids = [
        'auth'=>uuid($pdo), 'product'=>uuid($pdo), 'supplier'=>uuid($pdo), 'supplier_product'=>uuid($pdo),
        'inventory1'=>uuid($pdo), 'inventory2'=>uuid($pdo), 'batch1'=>uuid($pdo), 'batch2'=>uuid($pdo),
    ];
    $pdo->prepare("INSERT INTO auth_sessions (auth_session_id,php_session_id,user_id,session_token_hash,expires_at) VALUES (?,?,?, ?, DATE_ADD(NOW(),INTERVAL 1 HOUR))")
        ->execute([$ids['auth'], 'inventory-transfer-test', $userId, hash('sha256', $token)]);
    $pdo->prepare("INSERT INTO product (product_id,barcode,brand_name,product_name,price,type_id,inventory_unit_id,status) VALUES (?,?,?,?,?,?,?, 'Active')")
        ->execute([$ids['product'], 'TEST-' . substr($ids['product'], 0, 8), 'Test Brand', 'Transfer Test Product', 1, $typeId, $inventoryUnitId]);
    $pdo->prepare('INSERT INTO suppliers (supplier_id,supplier_name) VALUES (?,?)')->execute([$ids['supplier'], 'Transfer Test Supplier']);
    $pdo->prepare("INSERT INTO supplier_products (supplier_product_id,supplier_id,product_id,purchase_unit,purchase_unit_contains,inner_unit,units_per_inner_unit,inventory_unit,units_per_purchase_unit) VALUES (?,?,?,'BOX',10,'STAB',10,'PCS',100)")
        ->execute([$ids['supplier_product'], $ids['supplier'], $ids['product']]);
    $inventory = $pdo->prepare("INSERT INTO product_inventory (inventory_id,product_id,batch_number,quantity_stocked,quantity_remaining,expiration_date,expiry_date,status) VALUES (?,?,?,?,?,?,?,'Available')");
    $batch = $pdo->prepare("INSERT INTO inventory_batches (batch_id,legacy_inventory_id,product_id,supplier_id,expiry_date,received_qty,storage_qty,batch_status) VALUES (?,?,?,?,?,?,?,'active')");
    $inventory->execute([$ids['inventory1'],$ids['product'],'FEFO-A',20,20,'2026-12-31','2026-12-31']);
    $inventory->execute([$ids['inventory2'],$ids['product'],'FEFO-B',50,50,'2027-03-31','2027-03-31']);
    $batch->execute([$ids['batch1'],$ids['inventory1'],$ids['product'],$ids['supplier'],'2026-12-31',20,20]);
    $batch->execute([$ids['batch2'],$ids['inventory2'],$ids['product'],$ids['supplier'],'2027-03-31',50,50]);

    $result = postTransfer($token, ['product_id'=>$ids['product'],'movement_type'=>'STORAGE_TO_SHELF','quantity'=>3,'unit'=>'STAB']);
    assertSameValue('success', $result['status'] ?? null, 'FEFO transfer succeeds');
    assertSameValue(30, $result['base_quantity'] ?? null, 'STAB converts to PCS');
    assertSameValue(0, (int) $pdo->query("SELECT storage_qty FROM inventory_batches WHERE batch_id='{$ids['batch1']}'")->fetchColumn(), 'earliest batch used first');
    assertSameValue(40, (int) $pdo->query("SELECT storage_qty FROM inventory_batches WHERE batch_id='{$ids['batch2']}'")->fetchColumn(), 'second batch supplies remainder');
    assertSameValue(30, (int) $pdo->query("SELECT SUM(quantity_remaining) FROM product_selling_stock WHERE product_id='{$ids['product']}'")->fetchColumn(), 'shelf receives base quantity');
    assertSameValue(70, (int) $pdo->query("SELECT SUM(storage_qty)+(SELECT SUM(quantity_remaining) FROM product_selling_stock WHERE product_id='{$ids['product']}') FROM inventory_batches WHERE product_id='{$ids['product']}'")->fetchColumn(), 'transfer preserves total inventory');
    assertSameValue([20,10], array_map('intval', array_column($result['allocations'], 'base_quantity')), 'FEFO allocation audit');

    $invalid = postTransfer($token, ['product_id'=>$ids['product'],'movement_type'=>'STORAGE_TO_SHELF','quantity'=>5,'unit'=>'BOX']);
    assertSameValue('error', $invalid['status'] ?? null, 'over-transfer is rejected');
    assertSameValue('Only 0 BOXes can be transferred from the current 40 PCS.', $invalid['message'] ?? null, 'over-transfer returns max transfer guidance');
    assertSameValue(40, (int) $pdo->query("SELECT SUM(storage_qty) FROM inventory_batches WHERE product_id='{$ids['product']}'")->fetchColumn(), 'invalid transfer leaves storage unchanged');
    assertSameValue(1, (int) $pdo->query("SELECT COUNT(*) FROM inventory_transfers WHERE product_id='{$ids['product']}'")->fetchColumn(), 'invalid transfer does not create transfer history');

    $reverse = postTransfer($token, ['product_id'=>$ids['product'],'movement_type'=>'SHELF_TO_STORAGE','quantity'=>5,'unit'=>'PCS']);
    assertSameValue('success', $reverse['status'] ?? null, 'shelf return succeeds');
    assertSameValue(45, (int) $pdo->query("SELECT SUM(storage_qty) FROM inventory_batches WHERE product_id='{$ids['product']}'")->fetchColumn(), 'return restores storage');
    assertSameValue(25, (int) $pdo->query("SELECT SUM(quantity_remaining) FROM product_selling_stock WHERE product_id='{$ids['product']}'")->fetchColumn(), 'return deducts shelf only');

    $makeOrder = function (string $suffix, int $baseQuantity, int $selectedQuantity, string $selectedUnit, int $factor) use ($pdo, $ids, $userId): int {
        $pdo->prepare("INSERT INTO sales_orders (order_no,sales_clerk_id,status) VALUES (?,?, 'accepted_by_cashier')")->execute(['TEST-' . $suffix . '-' . substr($ids['product'],0,6), $userId]);
        $orderId = (int) $pdo->lastInsertId();
        $pdo->prepare('INSERT INTO sales_order_items (order_id,product_id,product_name,quantity,selected_quantity,selected_unit,unit_base_quantity,unit_price,line_total) VALUES (?,?,?,?,?,?,?,?,?)')
            ->execute([$orderId,$ids['product'],'Transfer Test Product',$baseQuantity,$selectedQuantity,$selectedUnit,$factor,1,$baseQuantity]);
        return $orderId;
    };
    $saleOrder = $makeOrder('UNIT', 3, 3, 'PCS', 1);
    $pdo->beginTransaction(); cashierDeductShelfStock($pdo, $saleOrder); $pdo->commit();
    assertSameValue(22, (int) $pdo->query("SELECT SUM(quantity_remaining) FROM product_selling_stock WHERE product_id='{$ids['product']}'")->fetchColumn(), 'POS deducts shelf only in base units');
    assertSameValue(45, (int) $pdo->query("SELECT SUM(storage_qty) FROM inventory_batches WHERE product_id='{$ids['product']}'")->fetchColumn(), 'POS never deducts storage');

    $pdo->prepare("UPDATE product_selling_stock SET quantity_remaining=CASE WHEN expiration_date=(SELECT MIN(expiration_date) FROM (SELECT expiration_date FROM product_selling_stock WHERE product_id=?) x) THEN 2 ELSE 0 END WHERE product_id=?")->execute([$ids['product'],$ids['product']]);
    $firstOrder = $makeOrder('RACE-A', 2, 2, 'PCS', 1);
    $secondOrder = $makeOrder('RACE-B', 2, 2, 'PCS', 1);
    $pdo->beginTransaction(); cashierDeductShelfStock($pdo, $firstOrder); $pdo->commit();
    $blocked = false;
    try { $pdo->beginTransaction(); cashierDeductShelfStock($pdo, $secondOrder); $pdo->commit(); }
    catch (RuntimeException $e) { $blocked = true; if ($pdo->inTransaction()) $pdo->rollBack(); }
    assertSameValue(true, $blocked, 'second competing POS deduction is blocked after locked stock is consumed');
    assertSameValue(0, (int) $pdo->query("SELECT SUM(quantity_remaining) FROM product_selling_stock WHERE product_id='{$ids['product']}'")->fetchColumn(), 'concurrent validation prevents negative shelf stock');
    echo "PASS inventory location transfer, conversion, FEFO, rollback, and reverse movement\n";
} finally {
    if ($ids) {
        $pdo->prepare("DELETE al FROM activity_logs al WHERE al.reference_id IN (SELECT transfer_id FROM inventory_transfers WHERE product_id=?)")->execute([$ids['product']]);
        $pdo->prepare('DELETE o FROM sales_orders o INNER JOIN sales_order_items i ON i.order_id=o.order_id WHERE i.product_id=?')->execute([$ids['product']]);
        $pdo->prepare('DELETE FROM inventory_transfers WHERE product_id=?')->execute([$ids['product']]);
        $pdo->prepare('DELETE FROM product_selling_stock WHERE product_id=?')->execute([$ids['product']]);
        $pdo->prepare('DELETE FROM inventory_batches WHERE product_id=?')->execute([$ids['product']]);
        $pdo->prepare('DELETE FROM product_inventory WHERE product_id=?')->execute([$ids['product']]);
        $pdo->prepare('DELETE FROM supplier_products WHERE product_id=?')->execute([$ids['product']]);
        $pdo->prepare('DELETE FROM suppliers WHERE supplier_id=?')->execute([$ids['supplier']]);
        $pdo->prepare('DELETE FROM product WHERE product_id=?')->execute([$ids['product']]);
        $pdo->prepare('DELETE FROM auth_sessions WHERE auth_session_id=?')->execute([$ids['auth']]);
    }
}
