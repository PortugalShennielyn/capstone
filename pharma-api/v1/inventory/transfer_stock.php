<?php
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once '../activity_log_helpers.php';
require_once 'transfer_helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo json_encode(['status'=>'error','message'=>'Only POST requests are allowed.']); exit; }
$payload = json_decode(file_get_contents('php://input'), true);

try {
    if (!is_array($payload)) throw new InvalidArgumentException('Invalid JSON payload.');
    $productId = cleanId($payload['product_id'] ?? null);
    $direction = strtoupper(trim((string) ($payload['movement_type'] ?? 'STORAGE_TO_SHELF')));
    $selectedQty = filter_var($payload['quantity'] ?? null, FILTER_VALIDATE_INT);
    $selectedUnit = trim((string) ($payload['unit'] ?? ''));
    $requestId = cleanId($payload['request_id'] ?? null);
    if ($productId === '') throw new InvalidArgumentException('Product is required.');
    if (!in_array($direction, ['STORAGE_TO_SHELF','SHELF_TO_STORAGE'], true)) throw new InvalidArgumentException('Invalid inventory transfer direction.');
    if ($selectedQty === false || $selectedQty <= 0) throw new InvalidArgumentException('Transfer quantity must be a positive whole number.');
    $units = inventoryTransferUnits($pdo, $productId);
    $unit = inventoryTransferUnit($pdo, $productId, $selectedUnit);
    $factor = (int) $unit['base_quantity'];
    if ($selectedQty > intdiv(PHP_INT_MAX, $factor)) throw new InvalidArgumentException('Converted transfer quantity is too large.');
    $baseQty = $selectedQty * $factor;
    $baseUnit = inventoryTransferBaseUnit($units);
    $source = $direction === 'STORAGE_TO_SHELF' ? 'Storage' : 'Shelf';
    $destination = $direction === 'STORAGE_TO_SHELF' ? 'Shelf' : 'Storage';

    $pdo->beginTransaction();
    $productStmt = $pdo->prepare("SELECT product_name FROM product WHERE product_id=:product_id AND status='Active' LIMIT 1 FOR UPDATE");
    $productStmt->execute([':product_id'=>$productId]);
    $productName = $productStmt->fetchColumn();
    if (!$productName) throw new InvalidArgumentException('Only active products can be transferred.');
    if ($requestId !== '') {
        $duplicate = $pdo->prepare('SELECT transfer_id FROM inventory_transfers WHERE transfer_id=:request_id LIMIT 1');
        $duplicate->execute([':request_id'=>$requestId]);
        if ($duplicate->fetchColumn()) {
            $pdo->commit();
            echo json_encode(['status'=>'success','message'=>'This stock transfer was already posted.','transfer_id'=>$requestId,'duplicate'=>true]);
            exit;
        }
    }

    $storageBeforeStmt = $pdo->prepare('SELECT COALESCE(SUM(storage_qty),0) FROM inventory_batches WHERE product_id=:id');
    $shelfBeforeStmt = $pdo->prepare('SELECT COALESCE(SUM(quantity_remaining),0) FROM product_selling_stock WHERE product_id=:id');
    $storageBeforeStmt->execute([':id'=>$productId]); $storageBefore = (int) $storageBeforeStmt->fetchColumn();
    $shelfBeforeStmt->execute([':id'=>$productId]); $shelfBefore = (int) $shelfBeforeStmt->fetchColumn();

    if ($direction === 'STORAGE_TO_SHELF') {
        $stockStmt = $pdo->prepare("SELECT ib.batch_id, ib.legacy_inventory_id inventory_id, ib.storage_qty available_qty,
                COALESCE(pi.batch_number, ib.batch_id) batch_number, ib.expiry_date
            FROM inventory_batches ib LEFT JOIN product_inventory pi ON pi.inventory_id=ib.legacy_inventory_id
            WHERE ib.product_id=:product_id AND ib.batch_status='active' AND ib.storage_qty>0
              AND (ib.expiry_date IS NULL OR ib.expiry_date>=CURDATE())
            ORDER BY ib.expiry_date IS NULL, ib.expiry_date, ib.received_date, ib.batch_id FOR UPDATE");
    } else {
        $stockStmt = $pdo->prepare("SELECT ib.batch_id, ib.legacy_inventory_id inventory_id, pss.quantity_remaining available_qty,
                pss.batch_number, pss.expiration_date expiry_date, pss.selling_stock_id
            FROM product_selling_stock pss INNER JOIN inventory_batches ib ON ib.batch_id=pss.source_batch_id
            WHERE pss.product_id=:product_id AND pss.quantity_remaining>0
              AND (pss.expiration_date IS NULL OR pss.expiration_date>=CURDATE())
            ORDER BY pss.expiration_date IS NULL, pss.expiration_date, pss.created_at, pss.selling_stock_id FOR UPDATE");
    }
    $stockStmt->execute([':product_id'=>$productId]);
    $stocks = $stockStmt->fetchAll(PDO::FETCH_ASSOC);
    $available = array_sum(array_map(static fn($r)=>(int)$r['available_qty'], $stocks));
    if ($baseQty > $available) {
        $maxSelected = intdiv($available, $factor);
        $selectedLabel = purchasingQuantityUnitLabel((string) $unit['unit'], $maxSelected);
        $baseLabel = purchasingQuantityUnitLabel($baseUnit, $available);
        throw new InvalidArgumentException("Only {$maxSelected} {$selectedLabel} can be transferred from the current {$available} {$baseLabel}.");
    }

    $transferId = $requestId !== '' ? $requestId : newUuid($pdo);
    $insertTransfer = $pdo->prepare('INSERT INTO inventory_transfers (transfer_id,product_id,movement_type,selected_quantity,selected_unit,base_quantity,base_unit,source_location,destination_location,transferred_by) VALUES (:id,:product,:type,:selected_qty,:selected_unit,:base_qty,:base_unit,:source,:destination,:user)');
    $insertTransfer->execute([':id'=>$transferId,':product'=>$productId,':type'=>$direction,':selected_qty'=>$selectedQty,':selected_unit'=>$unit['unit'],':base_qty'=>$baseQty,':base_unit'=>$baseUnit,':source'=>$source,':destination'=>$destination,':user'=>activityCurrentUserId()]);
    $insertAllocation = $pdo->prepare('INSERT INTO inventory_transfer_allocations (allocation_id,transfer_id,source_batch_id,selling_stock_id,batch_number,expiry_date,base_quantity) VALUES (:id,:transfer,:batch,:selling,:number,:expiry,:qty)');
    $remaining = $baseQty; $allocations = [];
    foreach ($stocks as $stock) {
        if ($remaining <= 0) break;
        $move = min($remaining, (int) $stock['available_qty']);
        $sellingId = cleanId($stock['selling_stock_id'] ?? null);
        if ($direction === 'STORAGE_TO_SHELF') {
            $update = $pdo->prepare('UPDATE inventory_batches SET storage_qty=storage_qty-:qty WHERE batch_id=:batch AND storage_qty>=:guard');
            $update->execute([':qty'=>$move,':batch'=>$stock['batch_id'],':guard'=>$move]);
            if ($update->rowCount() !== 1) throw new RuntimeException('Storage changed during transfer; no stock was moved.');
            if (!empty($stock['inventory_id'])) $pdo->prepare('UPDATE product_inventory SET quantity_remaining=quantity_remaining-:qty WHERE inventory_id=:id AND quantity_remaining>=:guard')->execute([':qty'=>$move,':id'=>$stock['inventory_id'],':guard'=>$move]);
            $find = $pdo->prepare('SELECT selling_stock_id FROM product_selling_stock WHERE source_batch_id=:batch LIMIT 1 FOR UPDATE');
            $find->execute([':batch'=>$stock['batch_id']]); $sellingId = cleanId($find->fetchColumn());
            if ($sellingId !== '') {
                $pdo->prepare('UPDATE product_selling_stock SET quantity_stocked=quantity_stocked+:qty,quantity_remaining=quantity_remaining+:qty2 WHERE selling_stock_id=:id')->execute([':qty'=>$move,':qty2'=>$move,':id'=>$sellingId]);
            } else {
                $sellingId = newUuid($pdo);
                $pdo->prepare('INSERT INTO product_selling_stock (selling_stock_id,product_id,source_inventory_id,source_batch_id,batch_number,quantity_stocked,quantity_remaining,expiration_date) VALUES (:id,:product,:inventory,:batch,:number,:qty,:remaining,:expiry)')->execute([':id'=>$sellingId,':product'=>$productId,':inventory'=>$stock['inventory_id'],':batch'=>$stock['batch_id'],':number'=>$stock['batch_number'],':qty'=>$move,':remaining'=>$move,':expiry'=>$stock['expiry_date']]);
            }
        } else {
            $update = $pdo->prepare('UPDATE product_selling_stock SET quantity_remaining=quantity_remaining-:qty WHERE selling_stock_id=:id AND quantity_remaining>=:guard AND (expiration_date IS NULL OR expiration_date>=CURDATE())');
            $update->execute([':qty'=>$move,':id'=>$sellingId,':guard'=>$move]);
            if ($update->rowCount() !== 1) throw new RuntimeException('Shelf stock changed during transfer; no stock was moved.');
            $pdo->prepare("UPDATE inventory_batches SET storage_qty=storage_qty+:qty,batch_status=CASE WHEN expiry_date<CURDATE() THEN 'expired' ELSE 'active' END WHERE batch_id=:batch")->execute([':qty'=>$move,':batch'=>$stock['batch_id']]);
            if (!empty($stock['inventory_id'])) $pdo->prepare('UPDATE product_inventory SET quantity_remaining=quantity_remaining+:qty WHERE inventory_id=:id')->execute([':qty'=>$move,':id'=>$stock['inventory_id']]);
        }
        $insertAllocation->execute([':id'=>newUuid($pdo),':transfer'=>$transferId,':batch'=>$stock['batch_id'],':selling'=>$sellingId ?: null,':number'=>$stock['batch_number'],':expiry'=>$stock['expiry_date'],':qty'=>$move]);
        $allocations[] = ['batch_id'=>$stock['batch_id'],'batch_number'=>$stock['batch_number'],'expiry_date'=>$stock['expiry_date'],'base_quantity'=>$move];
        $remaining -= $move;
    }
    if ($remaining !== 0) throw new RuntimeException('Unable to allocate the complete transfer quantity.');
    recordActivityLog($pdo, 'Inventory', $direction === 'STORAGE_TO_SHELF' ? 'Moved to Shelf' : 'Returned to Storage', "{$selectedQty} {$unit['unit']} ({$baseQty} {$baseUnit}) transferred {$source} to {$destination}: {$productName}", $transferId);
    $pdo->commit();
    echo json_encode(['status'=>'success','message'=>"Stock transferred from {$source} to {$destination}.",'transfer_id'=>$transferId,'movement_type'=>$direction,'selected_quantity'=>$selectedQty,'selected_unit'=>$unit['unit'],'base_quantity'=>$baseQty,'base_unit'=>$baseUnit,'storage_before'=>$storageBefore,'storage_after'=>$storageBefore+($direction==='STORAGE_TO_SHELF'?-$baseQty:$baseQty),'shelf_before'=>$shelfBefore,'shelf_after'=>$shelfBefore+($direction==='STORAGE_TO_SHELF'?$baseQty:-$baseQty),'allocations'=>$allocations], JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
} catch (InvalidArgumentException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack(); http_response_code(400); echo json_encode(['status'=>'error','message'=>$e->getMessage()]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack(); http_response_code(500); echo json_encode(['status'=>'error','message'=>'Unable to complete the stock transfer.','error'=>$e->getMessage()]);
}
