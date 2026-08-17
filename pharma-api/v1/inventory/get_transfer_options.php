<?php
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once 'transfer_helpers.php';

try {
    $productId = cleanId($_GET['product_id'] ?? null);
    if ($productId === '') throw new InvalidArgumentException('Product is required.');
    $units = inventoryTransferUnits($pdo, $productId);
    $stmt = $pdo->prepare(
        "SELECT p.product_id, p.product_name, p.brand_name,
            COALESCE((SELECT SUM(storage_qty) FROM inventory_batches WHERE product_id=p.product_id AND batch_status='active'),0) storage_quantity,
            COALESCE((SELECT SUM(quantity_remaining) FROM product_selling_stock WHERE product_id=p.product_id),0) shelf_quantity
         FROM product p WHERE p.product_id=:product_id LIMIT 1"
    );
    $stmt->execute([':product_id' => $productId]);
    $product = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$product) throw new InvalidArgumentException('Product was not found.');
    $product['storage_quantity'] = (int) $product['storage_quantity'];
    $product['shelf_quantity'] = (int) $product['shelf_quantity'];
    $product['base_unit'] = inventoryTransferBaseUnit($units);
    $product['storage_breakdown'] = inventoryQuantityBreakdown($product['storage_quantity'], $units);
    $product['shelf_breakdown'] = inventoryQuantityBreakdown($product['shelf_quantity'], $units);
    $storageStmt = $pdo->prepare(
        "SELECT ib.batch_id, COALESCE(NULLIF(pi.batch_number,''),ib.batch_id) batch_number,
                ib.expiry_date, ib.storage_qty available_quantity
         FROM inventory_batches ib
         LEFT JOIN product_inventory pi ON pi.inventory_id=ib.legacy_inventory_id
         WHERE ib.product_id=:product_id AND ib.batch_status='active' AND ib.storage_qty>0
           AND (ib.expiry_date IS NULL OR ib.expiry_date>=CURDATE())
         ORDER BY ib.expiry_date IS NULL,ib.expiry_date,ib.received_date,ib.batch_id"
    );
    $storageStmt->execute([':product_id'=>$productId]);
    $shelfStmt = $pdo->prepare(
        "SELECT pss.source_batch_id batch_id,COALESCE(NULLIF(pss.batch_number,''),pss.source_batch_id) batch_number,
                pss.expiration_date expiry_date,pss.quantity_remaining available_quantity
         FROM product_selling_stock pss
         WHERE pss.product_id=:product_id AND pss.quantity_remaining>0
         ORDER BY pss.expiration_date IS NULL,pss.expiration_date,pss.created_at,pss.selling_stock_id"
    );
    $shelfStmt->execute([':product_id'=>$productId]);
    echo json_encode([
        'status'=>'success',
        'product'=>$product,
        'units'=>$units,
        'storage_batches'=>$storageStmt->fetchAll(PDO::FETCH_ASSOC),
        'shelf_batches'=>$shelfStmt->fetchAll(PDO::FETCH_ASSOC),
    ], JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
} catch (InvalidArgumentException $e) {
    http_response_code(400); echo json_encode(['status'=>'error','message'=>$e->getMessage()]);
} catch (Throwable $e) {
    http_response_code(500); echo json_encode(['status'=>'error','message'=>'Unable to load transfer options.','error'=>$e->getMessage()]);
}
