<?php
$allowedRoles = ['super_admin','admin','manager','supervisor','inventory_manager','Admin','Supervisor','Inventory Manager','ro-super-admin','ro-admin','ro-manager','ro-supervisor','ro-inventory-manager'];
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once 'expiry_case_helpers.php';
require_once '../suppliers/supplier_schema.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') expiryCaseReply(false, 'Only POST requests are allowed.', [], 405);
$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) expiryCaseReply(false, 'Invalid JSON payload.', [], 400);

try {
    $batchId = cleanId($input['batch_id'] ?? null);
    $type = trim((string) ($input['case_type'] ?? ''));
    $shelfQty = expiryCaseQuantity($input['shelf_qty'] ?? null, 'Shelf quantity', true);
    $storageQty = expiryCaseQuantity($input['storage_qty'] ?? null, 'Storage quantity', true);
    $returnSupplierId = cleanId($input['supplier_id'] ?? null);
    $reasonChoice = trim((string) ($input['reason'] ?? ''));
    $reasonOther = trim((string) ($input['reason_other'] ?? ''));
    $reason = $type === 'Disposal' && $reasonChoice === 'Other' ? $reasonOther : $reasonChoice;
    $expect = trim((string) ($input['expected_resolution'] ?? ''));
    $methodChoice = trim((string) ($input['disposal_method'] ?? ''));
    $methodOther = trim((string) ($input['disposal_method_other'] ?? ''));
    $method = $type === 'Disposal' && $methodChoice === 'Other' ? $methodOther : $methodChoice;
    $witness = trim((string) ($input['witness'] ?? ''));
    $note = trim((string) ($input['note'] ?? ''));
    $scheduledDate = expiryCaseDate($input['scheduled_date'] ?? null, $type === 'Disposal');
    if ($batchId === '' || !in_array($type, ['Return','Disposal'], true)) throw new InvalidArgumentException('Select a batch and action.');
    if ($shelfQty + $storageQty <= 0) throw new InvalidArgumentException('Select stock to pull out.');
    if ($reason === '' || mb_strlen($reason) > 100 || mb_strlen($note) > 2000) throw new InvalidArgumentException('Enter a valid reason and note.');
    if ($type === 'Return' && $returnSupplierId === '') throw new InvalidArgumentException('Select the supplier accepting this return.');
    if ($type === 'Return' && !in_array($expect, ['Replacement','Credit'], true)) throw new InvalidArgumentException('Select replacement stock or a credit memo.');
    if ($type === 'Disposal' && !in_array($reasonChoice, ['Expired','Near expiry','Damaged','Recalled','Contaminated','Other'], true)) {
        throw new InvalidArgumentException('Select a valid disposal reason.');
    }
    if ($type === 'Disposal' && $reasonChoice === 'Other' && $reason === '') throw new InvalidArgumentException('Enter the other disposal reason.');
    if ($type === 'Disposal' && !in_array($methodChoice, [
        'Licensed hazardous waste contractor',
        'Incineration via partner hospital',
        'Return to manufacturer for destruction',
        'Approved non-hazardous disposal',
        'Other'
    ], true)) throw new InvalidArgumentException('Select a valid disposal method.');
    if ($type === 'Disposal' && $methodChoice === 'Other' && $method === '') throw new InvalidArgumentException('Enter the other disposal method.');
    if ($type === 'Disposal' && (mb_strlen($method) > 120 || mb_strlen($witness) > 100)) throw new InvalidArgumentException('Disposal method or witness is too long.');
    if ($type === 'Disposal' && $scheduledDate < date('Y-m-d')) throw new InvalidArgumentException('Disposal date cannot be in the past.');
    if ($type === 'Return') ensureSupplierArchiveColumn($pdo);

    ensureActivityLogSchema($pdo);
    $pdo->beginTransaction();
    $lock = $pdo->prepare("SELECT ib.batch_id,ib.product_id,COALESCE(ib.supplier_id,po.supplier_id) AS supplier_id,ib.storage_qty,
        ib.expiry_quarantined_storage_qty,ib.unit_cost,ib.expiry_date,
        pc.category_name,
        EXISTS (SELECT 1 FROM product_specification_values psv
                INNER JOIN product_specifications ps ON ps.specification_id=psv.specification_id
                WHERE psv.product_id=ib.product_id AND LOWER(TRIM(ps.specification_name))='medicine classification'
                  AND LOWER(TRIM(psv.value_text)) IN ('prescription (rx)','prescription','rx')) AS is_rx
        FROM inventory_batches ib
        INNER JOIN product p ON p.product_id=ib.product_id
        LEFT JOIN purchase_order_items poi ON poi.po_item_id=ib.po_item_id
        LEFT JOIN purchase_orders po ON po.po_id=COALESCE(ib.po_id,poi.po_id)
        LEFT JOIN product_categories pc ON pc.category_id=p.category_id
        WHERE ib.batch_id=:batch_id FOR UPDATE");
    $lock->execute([':batch_id'=>$batchId]);
    $batch = $lock->fetch(PDO::FETCH_ASSOC);
    if (!$batch) throw new InvalidArgumentException('Batch not found.');
    if ($type === 'Return') {
        $supplier = $pdo->prepare('SELECT 1 FROM suppliers WHERE supplier_id=:supplier_id AND archived_at IS NULL LIMIT 1');
        $supplier->execute([':supplier_id'=>$returnSupplierId]);
        if (!$supplier->fetchColumn()) throw new InvalidArgumentException('Select an active supplier for this return.');
    }
    if ($type === 'Disposal' && (int) $batch['is_rx'] === 1 && $witness === '') throw new InvalidArgumentException('A pharmacist witness is required for Rx disposal.');
    if ($type === 'Disposal' && $scheduledDate !== null && $scheduledDate < date('Y-m-d')) throw new InvalidArgumentException('The scheduled disposal date cannot be in the past.');
    $open = $pdo->prepare("SELECT 1 FROM inventory_resolution_cases WHERE batch_id=:batch_id
        AND status NOT IN ('Replaced','Credited','Disposed') LIMIT 1");
    $open->execute([':batch_id'=>$batchId]);
    if ($open->fetchColumn()) throw new InvalidArgumentException('This batch already has an open return or disposal case.');
    $shelfRows = expiryCaseShelfRows($pdo, $batchId);
    $existingShelfReservation = array_sum(array_map(static fn($row) => (int) $row['expiry_quarantined_qty'], $shelfRows));
    if ((int) $batch['expiry_quarantined_storage_qty'] > 0 || $existingShelfReservation > 0) {
        throw new InvalidArgumentException('This batch has an existing stock reservation. Resolve it before opening a case.');
    }
    $availableShelf = array_sum(array_map(static fn($row) => (int) $row['quantity_remaining'], $shelfRows));
    if ($storageQty > (int) $batch['storage_qty'] || $shelfQty > $availableShelf) {
        throw new InvalidArgumentException('Requested quantity exceeds the current batch stock.');
    }
    if ($storageQty > 0) {
        $update = $pdo->prepare('UPDATE inventory_batches SET expiry_quarantined_storage_qty=:qty
            WHERE batch_id=:batch_id AND storage_qty>=:guard AND expiry_quarantined_storage_qty=0');
        $update->execute([':qty'=>$storageQty,':batch_id'=>$batchId,':guard'=>$storageQty]);
        if ($update->rowCount() !== 1) throw new RuntimeException('Storage stock changed. Reload and try again.');
    }
    $remaining = $shelfQty;
    foreach ($shelfRows as $row) {
        if ($remaining === 0) break;
        $reserve = min($remaining, (int) $row['quantity_remaining']);
        if ($reserve <= 0) continue;
        $update = $pdo->prepare('UPDATE product_selling_stock SET expiry_quarantined_qty=:qty
            WHERE selling_stock_id=:id AND quantity_remaining>=:guard AND expiry_quarantined_qty=0');
        $update->execute([':qty'=>$reserve,':id'=>$row['selling_stock_id'],':guard'=>$reserve]);
        if ($update->rowCount() !== 1) throw new RuntimeException('Shelf stock changed. Reload and try again.');
        $remaining -= $reserve;
    }
    if ($remaining !== 0) throw new RuntimeException('Unable to reserve the requested shelf stock.');
    $caseId = newUuid($pdo);
    $status = $type === 'Return' ? 'Pending pickup' : 'Quarantined';
    $insert = $pdo->prepare('INSERT INTO inventory_resolution_cases
        (case_id,batch_id,product_id,supplier_id,case_type,status,reason,expected_resolution,shelf_qty,storage_qty,unit_cost,disposal_method,scheduled_date,witness,note,created_by)
        VALUES (:case_id,:batch_id,:product_id,:supplier_id,:case_type,:status,:reason,:expected,:shelf_qty,:storage_qty,:unit_cost,:method,:scheduled,:witness,:note,:actor)');
    $insert->execute([
        ':case_id'=>$caseId,':batch_id'=>$batchId,':product_id'=>$batch['product_id'],':supplier_id'=>$type==='Return'?$returnSupplierId:($batch['supplier_id'] ?: null),
        ':case_type'=>$type,':status'=>$status,':reason'=>$reason,':expected'=>$type==='Return'?$expect:null,
        ':shelf_qty'=>$shelfQty,':storage_qty'=>$storageQty,':unit_cost'=>$batch['unit_cost'],
        ':method'=>$type==='Disposal'?$method:null,':scheduled'=>$type==='Disposal'?$scheduledDate:null,
        ':witness'=>$type==='Disposal'?$witness:null,':note'=>$note ?: null,
        ':actor'=>cleanId($_SESSION['user_id'] ?? null) ?: null
    ]);
    expiryCaseEvent($pdo, $caseId, $status, 'Created from Expiry Monitoring; stock reserved from POS and storage.');
    expiryCaseAudit($pdo, ['case_id'=>$caseId], 'Case Created', "{$type} case created for batch {$batchId}; shelf {$shelfQty}, storage {$storageQty}.");
    $pdo->commit();
    expiryCaseReply(true, "{$type} case created.", ['case_id'=>$caseId]);
} catch (InvalidArgumentException $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    expiryCaseReply(false, $error->getMessage(), [], 400);
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('Create expiry case failed: '.$error->getMessage());
    expiryCaseReply(false, 'Unable to create the case.', [], 500);
}
