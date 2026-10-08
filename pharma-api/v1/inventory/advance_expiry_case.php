<?php
$allowedRoles = ['super_admin','admin','manager','supervisor','inventory_manager','Admin','Supervisor','Inventory Manager','ro-super-admin','ro-admin','ro-manager','ro-supervisor','ro-inventory-manager'];
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once 'expiry_case_helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') expiryCaseReply(false, 'Only POST requests are allowed.', [], 405);
$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) expiryCaseReply(false, 'Invalid JSON payload.', [], 400);

try {
    $caseId = cleanId($input['case_id'] ?? null);
    $action = trim((string) ($input['action'] ?? ''));
    if ($caseId === '' || !in_array($action, ['pickup','replacement','credit','schedule','dispose'], true)) {
        throw new InvalidArgumentException('Select a case action.');
    }
    ensureActivityLogSchema($pdo);
    $pdo->beginTransaction();
    $statement = $pdo->prepare('SELECT * FROM inventory_resolution_cases WHERE case_id=:case_id FOR UPDATE');
    $statement->execute([':case_id'=>$caseId]);
    $case = $statement->fetch(PDO::FETCH_ASSOC);
    if (!$case) throw new InvalidArgumentException('Case not found.');
    $batchStmt = $pdo->prepare('SELECT * FROM inventory_batches WHERE batch_id=:batch_id FOR UPDATE');
    $batchStmt->execute([':batch_id'=>$case['batch_id']]);
    $batch = $batchStmt->fetch(PDO::FETCH_ASSOC);
    if (!$batch) throw new RuntimeException('The source batch is missing.');
    $reference = trim((string) ($input['reference_number'] ?? ''));
    if (mb_strlen($reference) > 100) throw new InvalidArgumentException('Reference number is too long.');
    $status = (string) $case['status'];
    $next = '';
    $description = '';
    if ($action === 'pickup') {
        if ($case['case_type'] !== 'Return' || $status !== 'Pending pickup') throw new InvalidArgumentException('This return is not pending pickup.');
        expiryCaseConsumeReserved($pdo, $case, $batch);
        $total = (int) $case['shelf_qty'] + (int) $case['storage_qty'];
        $pdo->prepare('UPDATE inventory_batches SET returned_qty=returned_qty+:qty WHERE batch_id=:batch_id')
            ->execute([':qty'=>$total,':batch_id'=>$case['batch_id']]);
        $next = $case['expected_resolution'] === 'Credit' ? 'Awaiting credit' : 'Awaiting replacement';
        $description = "Picked up by supplier; {$total} base units removed from inventory.";
    } elseif ($action === 'replacement') {
        if ($case['case_type'] !== 'Return' || $status !== 'Awaiting replacement') throw new InvalidArgumentException('This case is not awaiting replacement.');
        $quantity = expiryCaseQuantity($input['quantity'] ?? null, 'Received quantity');
        $expected = (int) $case['shelf_qty'] + (int) $case['storage_qty'];
        if ($quantity > $expected - (int) $case['received_qty']) throw new InvalidArgumentException('Received quantity exceeds the outstanding replacement quantity.');
        $number = trim((string) ($input['batch_number'] ?? ''));
        if ($number === '' || mb_strlen($number) > 50 || preg_match('/[\x00-\x1F\x7F]/', $number)) throw new InvalidArgumentException('Enter the supplier replacement batch number.');
        $existing = $pdo->prepare('SELECT 1 FROM product_inventory WHERE product_id=:product_id AND batch_number=:number LIMIT 1');
        $existing->execute([':product_id'=>$case['product_id'],':number'=>$number]);
        if ($existing->fetchColumn()) throw new InvalidArgumentException('That batch number is already recorded for this product.');
        $categoryStmt = $pdo->prepare('SELECT pc.category_name FROM product p LEFT JOIN product_categories pc ON pc.category_id=p.category_id WHERE p.product_id=:id');
        $categoryStmt->execute([':id'=>$case['product_id']]);
        $medicine = strtolower((string) $categoryStmt->fetchColumn()) === 'medicine';
        $expiry = expiryCaseDate($input['expiry_date'] ?? null, $medicine);
        if ($expiry !== null && $expiry <= date('Y-m-d')) throw new InvalidArgumentException('Replacement stock must have a future expiry date.');
        $inventoryId = newUuid($pdo);
        $replacementBatchId = newUuid($pdo);
        $pdo->prepare("INSERT INTO product_inventory (inventory_id,product_id,batch_number,quantity_stocked,quantity_remaining,expiration_date,expiry_date,no_expiry,status)
            VALUES (:id,:product_id,:number,:stocked,:remaining,:expiration,:expiry,:no_expiry,'Available')")
            ->execute([':id'=>$inventoryId,':product_id'=>$case['product_id'],':number'=>$number,
                ':stocked'=>$quantity,':remaining'=>$quantity,':expiration'=>$expiry,':expiry'=>$expiry,':no_expiry'=>$expiry===null?1:0]);
        $pdo->prepare("INSERT INTO inventory_batches
            (batch_id,legacy_inventory_id,po_id,po_item_id,product_id,supplier_id,received_date,expiry_date,no_expiry,received_qty,storage_qty,shelf_qty,damaged_qty,returned_qty,unit_cost,batch_status)
            VALUES (:batch_id,:inventory_id,:po_id,:po_item_id,:product_id,:supplier_id,NOW(),:expiry,:no_expiry,:received,:storage,0,0,0,:unit_cost,'active')")
            ->execute([':batch_id'=>$replacementBatchId,':inventory_id'=>$inventoryId,':po_id'=>$batch['po_id'],
                ':po_item_id'=>$batch['po_item_id'],':product_id'=>$case['product_id'],':supplier_id'=>$case['supplier_id'],
                ':expiry'=>$expiry,':no_expiry'=>$expiry===null?1:0,':received'=>$quantity,':storage'=>$quantity,':unit_cost'=>$case['unit_cost']]);
        $received = (int) $case['received_qty'] + $quantity;
        $next = $received === $expected ? 'Replaced' : 'Awaiting replacement';
        $pdo->prepare('UPDATE inventory_resolution_cases SET received_qty=:qty,replacement_batch_id=:batch_id WHERE case_id=:case_id')
            ->execute([':qty'=>$received,':batch_id'=>$replacementBatchId,':case_id'=>$caseId]);
        $description = "Received {$quantity} replacement base units into new storage batch {$number}.";
        $reference = $number;
    } elseif ($action === 'credit') {
        if ($case['case_type'] !== 'Return' || $status !== 'Awaiting credit') throw new InvalidArgumentException('This case is not awaiting credit.');
        $amount = $input['amount'] ?? null;
        if (!is_numeric($amount) || !is_finite((float) $amount) || (float) $amount < 0 || (float) $amount > 9999999999) throw new InvalidArgumentException('Enter a valid credit amount.');
        if ($reference === '') throw new InvalidArgumentException('Enter the credit memo number.');
        $pdo->prepare('UPDATE inventory_resolution_cases SET credit_amount=:amount WHERE case_id=:case_id')
            ->execute([':amount'=>round((float)$amount,2),':case_id'=>$caseId]);
        $next = 'Credited';
        $description = 'Credit memo recorded for ₱'.number_format((float)$amount,2).'.';
    } elseif ($action === 'schedule') {
        if ($case['case_type'] !== 'Disposal' || $status !== 'Quarantined') throw new InvalidArgumentException('This disposal is not awaiting scheduling.');
        $date = expiryCaseDate($input['scheduled_date'] ?? null, true);
        if ($date < date('Y-m-d')) throw new InvalidArgumentException('Disposal date cannot be in the past.');
        $storedMethod = trim((string) ($case['disposal_method'] ?? ''));
        $submittedMethod = trim((string) ($input['disposal_method'] ?? ''));
        if ($storedMethod !== '' && $submittedMethod !== '' && $submittedMethod !== $storedMethod) {
            throw new InvalidArgumentException('The disposal method is locked after it is selected.');
        }
        $method = $storedMethod !== '' ? $storedMethod : $submittedMethod;
        $witness = trim((string) ($input['witness'] ?? $case['witness'] ?? ''));
        if ($method === '' || mb_strlen($method) > 120 || mb_strlen($witness) > 100) throw new InvalidArgumentException('Enter a valid method and witness.');
        $pdo->prepare('UPDATE inventory_resolution_cases SET scheduled_date=:date,disposal_method=:method,witness=:witness WHERE case_id=:case_id')
            ->execute([':date'=>$date,':method'=>$method,':witness'=>$witness ?: null,':case_id'=>$caseId]);
        $next = 'Disposal scheduled';
        $description = "Disposal scheduled for {$date} using {$method}.";
    } else {
        if ($case['case_type'] !== 'Disposal' || !in_array($status, ['Quarantined','Disposal scheduled'], true)) throw new InvalidArgumentException('This case cannot be disposed.');
        if (!empty($case['scheduled_date']) && $case['scheduled_date'] > date('Y-m-d')) throw new InvalidArgumentException('The scheduled disposal date has not arrived.');
        $witness = trim((string) ($input['witness'] ?? $case['witness'] ?? ''));
        if (mb_strlen($witness) > 100) throw new InvalidArgumentException('Witness name is too long.');
        $rxStmt = $pdo->prepare("SELECT EXISTS (SELECT 1 FROM product_specification_values psv
            INNER JOIN product_specifications ps ON ps.specification_id=psv.specification_id
            WHERE psv.product_id=:product_id AND LOWER(TRIM(ps.specification_name))='medicine classification'
            AND LOWER(TRIM(psv.value_text)) IN ('prescription (rx)','prescription','rx'))");
        $rxStmt->execute([':product_id'=>$case['product_id']]);
        if ((int)$rxStmt->fetchColumn() === 1 && $witness === '') throw new InvalidArgumentException('A pharmacist witness is required for Rx disposal.');
        expiryCaseConsumeReserved($pdo, $case, $batch);
        $pdo->prepare('UPDATE inventory_resolution_cases SET witness=:witness WHERE case_id=:case_id')
            ->execute([':witness'=>$witness ?: null,':case_id'=>$caseId]);
        $next = 'Disposed';
        $description = 'Stock destroyed and written off from inventory.';
    }
    $closed = in_array($next, ['Replaced','Credited','Disposed'], true);
    $pdo->prepare('UPDATE inventory_resolution_cases SET status=:status,reference_number=COALESCE(NULLIF(:reference,\'\'),reference_number),
        closed_at=CASE WHEN :is_closed=1 THEN NOW() ELSE closed_at END WHERE case_id=:case_id')
        ->execute([':status'=>$next,':reference'=>$reference,':is_closed'=>$closed?1:0,':case_id'=>$caseId]);
    expiryCaseEvent($pdo, $caseId, $next, $description, $reference ?: null);
    expiryCaseAudit($pdo, $case, $next, $description);
    $pdo->commit();
    expiryCaseReply(true, 'Case updated.', ['case_id'=>$caseId,'case_status'=>$next]);
} catch (InvalidArgumentException $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    expiryCaseReply(false, $error->getMessage(), [], 400);
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('Advance expiry case failed: '.$error->getMessage());
    expiryCaseReply(false, 'Unable to update this case.', [], 500);
}
