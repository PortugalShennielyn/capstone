<?php
$allowedRoles = ['super_admin', 'admin', 'manager', 'Admin', 'ro-super-admin', 'ro-admin', 'ro-manager'];
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once 'purchase_order_helpers.php';
require_once 'purchase_order_payment_helpers.php';

function replacementResponse(bool $success, string $message, array $extra = [], int $code = 200): void
{
    http_response_code($code);
    echo json_encode(array_merge(['status' => $success ? 'success' : 'error', 'success' => $success, 'message' => $message], $extra), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit();
}

function replacementQuantity($value, string $label): int
{
    if (!is_numeric($value) || floor((float) $value) !== (float) $value) throw new InvalidArgumentException("{$label} must be a whole number.");
    $quantity = (int) $value;
    if ($quantity < 0) throw new InvalidArgumentException("{$label} cannot be negative.");
    return $quantity;
}

function replacementDate($value, bool $required): ?string
{
    $date = trim((string) $value);
    if ($date === '') {
        if ($required) throw new InvalidArgumentException('An expiry date is required for every medicine batch.');
        return null;
    }
    return validateDateNotBeforeToday($date, 'Expiry date must be valid.', 'Expiry date cannot be earlier than today.');
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') replacementResponse(false, 'Only POST requests are allowed.', [], 405);
$payload = json_decode(file_get_contents('php://input'), true);
if (!is_array($payload)) replacementResponse(false, 'Invalid JSON payload.', [], 400);

try {
    $returnId = cleanId($payload['return_id'] ?? null);
    if ($returnId === '') throw new InvalidArgumentException('Return/Damage record is required.');
    $requestKey = trim((string) ($payload['receiving_request_key'] ?? ''));
    if ($requestKey === '' || strlen($requestKey) > 100) throw new InvalidArgumentException('A valid replacement receiving submission key is required.');
    $delivered = replacementQuantity($payload['delivered_quantity'] ?? 0, 'Replacement delivered quantity');
    $deliveryReceiptNo = trim((string) ($payload['delivery_receipt_no'] ?? ''));
    if (strlen($deliveryReceiptNo) > 100) throw new InvalidArgumentException('Delivery Receipt No. cannot exceed 100 characters.');
    $damaged = replacementQuantity($payload['damaged_quantity'] ?? 0, 'Replacement damaged quantity');
    if ($delivered <= 0) throw new InvalidArgumentException('Replacement delivered quantity must be greater than zero.');
    if ($damaged > $delivered) throw new InvalidArgumentException('Damaged quantity cannot exceed replacement delivered quantity.');
    $good = $delivered - $damaged;
    $remarks = trim((string) ($payload['remarks'] ?? ''));
    $issueType = trim((string) ($payload['issue_type'] ?? ''));
    $allowedIssues = ['Expired', 'Broken package', 'Wrong item delivered', 'Incorrect quantity', 'Damaged during delivery', 'Other'];
    if ($damaged > 0 && (!in_array($issueType, $allowedIssues, true) || $remarks === '')) throw new InvalidArgumentException('Issue type and remarks are required when replacement stock is damaged.');

    $pdo->beginTransaction();
    $duplicateStatement = $pdo->prepare('SELECT receiving_id FROM purchase_order_receiving WHERE receiving_request_key = :request_key LIMIT 1');
    $duplicateStatement->execute([':request_key' => $requestKey]);
    if ($duplicateStatement->fetchColumn()) throw new DomainException('This replacement receiving submission was already recorded.');
    $recordStatement = $pdo->prepare(
        "SELECT por.*, po.po_number, po.total_amount, po.final_payment, poi.product_id,
                COALESCE(poi.unit_price_snapshot, 0) AS unit_price,
                COALESCE(NULLIF(poi.product_name_snapshot, ''), p.product_name) AS product_name,
                po.supplier_id, receiving.receiving_id AS original_receiving_id,
                receiving_item.receiving_item_id AS original_receiving_item_id,
                CASE WHEN md.product_id IS NOT NULL OR LOWER(COALESCE(pc.category_name, '')) LIKE '%medicine%' THEN 1 ELSE 0 END AS requires_expiry
         FROM supplier_claim_legacy_projection por
         INNER JOIN purchase_orders po ON po.po_id = por.po_id
         INNER JOIN purchase_order_items poi ON poi.po_item_id = por.po_item_id
         INNER JOIN product p ON p.product_id = poi.product_id
         LEFT JOIN product_categories pc ON pc.category_id = p.category_id
         LEFT JOIN medicine_details md ON md.product_id = p.product_id
         LEFT JOIN (SELECT claim_id, MIN(receiving_item_id) AS receiving_item_id FROM supplier_claim_damage_lines WHERE receiving_item_id IS NOT NULL GROUP BY claim_id HAVING COUNT(DISTINCT receiving_item_id)=1) claim_receiving ON claim_receiving.claim_id = por.return_id
         LEFT JOIN purchase_order_receiving_items receiving_item ON receiving_item.receiving_item_id = claim_receiving.receiving_item_id
         LEFT JOIN purchase_order_receiving receiving ON receiving.receiving_id = receiving_item.receiving_id
         WHERE por.return_id = :return_id
         LIMIT 1 FOR UPDATE"
    );
    $recordStatement->execute([':return_id' => $returnId]);
    $record = $recordStatement->fetch(PDO::FETCH_ASSOC);
    if (!$record) throw new InvalidArgumentException('Return/Damage record not found.');
    if (empty($record['original_receiving_id']) || empty($record['original_receiving_item_id'])) throw new InvalidArgumentException('The original receiving event for this claim could not be resolved.');
    if (($record['resolution_type'] ?? '') !== 'Replacement') throw new InvalidArgumentException('This record is not awaiting replacement stock.');
    $expected = (int) ($record['replacement_expected_qty'] ?? 0);
    $alreadyReceived = (int) ($record['replacement_received_qty'] ?? 0);
    $outstanding = max(0, $expected - $alreadyReceived);
    if ($outstanding <= 0) throw new InvalidArgumentException('The expected replacement quantity has already been received.');
    if ($delivered > $outstanding) throw new InvalidArgumentException('Replacement delivered quantity cannot exceed the outstanding quantity.');

    $batches = is_array($payload['batches'] ?? null) ? $payload['batches'] : [];
    $validatedBatches = [];
    $allocated = 0;
    foreach ($batches as $index => $batch) {
        $quantity = replacementQuantity($batch['quantity'] ?? 0, 'Batch quantity');
        if ($quantity <= 0) throw new InvalidArgumentException('Batch quantity must be greater than zero.');
        $noExpiry = !empty($batch['no_expiry']);
        if ((int) $record['requires_expiry'] === 1 && $noExpiry) throw new InvalidArgumentException('Medicines require an expiry date.');
        $expiry = replacementDate($batch['expiry_date'] ?? '', (int) $record['requires_expiry'] === 1 && !$noExpiry);
        $identifier = preg_replace('/[^A-Za-z0-9._-]+/', '-', trim((string) ($batch['batch_identifier'] ?? '')));
        if ($identifier === '') $identifier = preg_replace('/[^A-Za-z0-9]+/', '', $record['po_number']) . '-R' . substr(str_replace('-', '', $returnId), 0, 6) . '-B' . ($index + 1);
        $validatedBatches[] = ['quantity' => $quantity, 'expiry' => $noExpiry ? null : $expiry, 'identifier' => substr($identifier, 0, 50)];
        $allocated += $quantity;
    }
    if ($allocated !== $good) throw new InvalidArgumentException('Replacement batch quantities must equal the accepted good quantity.');

    $replacementReceivingId = newUuid($pdo);
    $replacementReceivingItemId = newUuid($pdo);
    $receivingRemarks = $remarks ?: null;
    $pdo->prepare("INSERT INTO purchase_order_receiving (receiving_id, po_id, receiving_type, parent_receiving_id, claim_id, receiving_request_key, received_date, delivery_receipt_no, remarks, inspection_status, inspected_by) VALUES (:id, :po_id, 'Replacement', :parent_id, :claim_id, :request_key, CURRENT_TIMESTAMP, :delivery_receipt_no, :remarks, 'Confirmed', :inspected_by)")
        ->execute([':id' => $replacementReceivingId, ':po_id' => $record['po_id'], ':parent_id' => $record['original_receiving_id'], ':claim_id' => $returnId, ':request_key' => $requestKey, ':delivery_receipt_no' => $deliveryReceiptNo ?: null, ':remarks' => $receivingRemarks, ':inspected_by' => $_SESSION['user_id'] ?? null]);
    $pdo->prepare('INSERT INTO purchase_order_receiving_items (receiving_item_id, receiving_id, po_item_id, parent_receiving_item_id, received_quantity, accepted_quantity, damaged_quantity, missing_quantity) VALUES (:id, :receiving_id, :po_item_id, :parent_item_id, :received, :accepted, :damaged, 0)')
        ->execute([':id' => $replacementReceivingItemId, ':receiving_id' => $replacementReceivingId, ':po_item_id' => $record['po_item_id'], ':parent_item_id' => $record['original_receiving_item_id'], ':received' => $delivered, ':accepted' => $good, ':damaged' => $damaged]);

    $inventoryStatement = $pdo->prepare("INSERT INTO product_inventory (inventory_id, receiving_id, product_id, batch_number, quantity_stocked, quantity_remaining, expiration_date, expiry_date, status) VALUES (:id, :receiving_id, :product_id, :batch_number, :quantity, :remaining, :expiry, :expiry_copy, 'Available')");
    $batchStatement = $pdo->prepare("INSERT INTO inventory_batches (batch_id, legacy_inventory_id, po_id, po_item_id, product_id, supplier_id, received_date, expiry_date, received_qty, storage_qty, shelf_qty, damaged_qty, returned_qty, unit_cost, batch_status) VALUES (:batch_id, :inventory_id, NULL, :po_item_id, :product_id, :supplier_id, CURRENT_TIMESTAMP, :expiry, :received, :storage, 0, 0, 0, :unit_cost, 'active')");
    $matchingBatchStatement = $pdo->prepare("SELECT ib.batch_id, ib.legacy_inventory_id FROM inventory_batches ib INNER JOIN product_inventory pi ON pi.inventory_id = ib.legacy_inventory_id WHERE ib.product_id = :product_id AND ib.supplier_id = :supplier_id AND pi.batch_number = :batch_number AND ib.expiry_date <=> :expiry AND ib.batch_status = 'active' ORDER BY ib.created_at LIMIT 1 FOR UPDATE");
    $auditStatement = $pdo->prepare("INSERT INTO inventory_receiving_transactions (transaction_id, transaction_request_key, transaction_type, receiving_id, receiving_item_id, claim_id, po_id, po_item_id, inventory_batch_id, product_id, supplier_id, quantity, created_by) VALUES (:id, :request_key, 'Replacement Receiving', :receiving_id, :receiving_item_id, :claim_id, :po_id, :po_item_id, :batch_id, :product_id, :supplier_id, :quantity, :created_by)");
    foreach ($validatedBatches as $batchIndex => $batch) {
        $matchingBatchStatement->execute([':product_id' => $record['product_id'], ':supplier_id' => $record['supplier_id'], ':batch_number' => $batch['identifier'], ':expiry' => $batch['expiry']]);
        $matchingBatch = $matchingBatchStatement->fetch(PDO::FETCH_ASSOC);
        if ($matchingBatch) {
            $batchId = cleanId($matchingBatch['batch_id']);
            $pdo->prepare('UPDATE inventory_batches SET received_qty = received_qty + :received_quantity, storage_qty = storage_qty + :storage_quantity WHERE batch_id = :batch_id')
                ->execute([':received_quantity' => $batch['quantity'], ':storage_quantity' => $batch['quantity'], ':batch_id' => $batchId]);
            $pdo->prepare("UPDATE product_inventory SET quantity_stocked = quantity_stocked + :stocked_quantity, quantity_remaining = quantity_remaining + :remaining_quantity, status = 'Available' WHERE inventory_id = :inventory_id")
                ->execute([':stocked_quantity' => $batch['quantity'], ':remaining_quantity' => $batch['quantity'], ':inventory_id' => $matchingBatch['legacy_inventory_id']]);
        } else {
            $inventoryId = newUuid($pdo);
            $batchId = newUuid($pdo);
            $inventoryStatement->execute([':id' => $inventoryId, ':receiving_id' => $replacementReceivingId, ':product_id' => $record['product_id'], ':batch_number' => $batch['identifier'], ':quantity' => $batch['quantity'], ':remaining' => $batch['quantity'], ':expiry' => $batch['expiry'], ':expiry_copy' => $batch['expiry']]);
            $batchStatement->execute([':batch_id' => $batchId, ':inventory_id' => $inventoryId, ':po_item_id' => $record['po_item_id'], ':product_id' => $record['product_id'], ':supplier_id' => $record['supplier_id'], ':expiry' => $batch['expiry'], ':received' => $batch['quantity'], ':storage' => $batch['quantity'], ':unit_cost' => $record['unit_price']]);
        }
        $auditStatement->execute([
            ':id' => newUuid($pdo), ':request_key' => $requestKey . ':' . ($batchIndex + 1),
            ':receiving_id' => $replacementReceivingId, ':receiving_item_id' => $replacementReceivingItemId,
            ':claim_id' => $returnId, ':po_id' => $record['po_id'], ':po_item_id' => $record['po_item_id'],
            ':batch_id' => $batchId, ':product_id' => $record['product_id'], ':supplier_id' => $record['supplier_id'],
            ':quantity' => $batch['quantity'], ':created_by' => $_SESSION['user_id'] ?? null
        ]);
    }

    $newReceived = $alreadyReceived + $good;
    $remaining = max(0, $expected - $newReceived);
    $newStatus = $remaining === 0 ? 'Resolved' : 'Partially Replaced';
    $updateReturn = $pdo->prepare('UPDATE supplier_claims SET claim_status = :status, resolved_at = :resolved_at WHERE claim_id = :return_id');
    $updateReturn->execute([':status' => $newStatus, ':resolved_at' => $remaining === 0 ? date('Y-m-d H:i:s') : null, ':return_id' => $returnId]);

    $newFinalPayment = purchaseOrderEffectivePayable($pdo, cleanId($record['po_id']), (float) $record['final_payment']);
    $updatePo = $pdo->prepare("UPDATE purchase_orders SET final_payment = :final_payment WHERE po_id = :po_id");
    $updatePo->execute([':final_payment' => $newFinalPayment, ':po_id' => $record['po_id']]);
    synchronizePurchaseOrderPaymentStatus($pdo, cleanId($record['po_id']), $newFinalPayment);
    $pdo->commit();

    recordActivityLog($pdo, 'Return/Damage', 'Replacement Arrival', $good . ' replacement units accepted for PO ' . $record['po_number'], $returnId);
    replacementResponse(true, $remaining === 0 ? 'Replacement fully received.' : 'Partial replacement recorded.', [
        'accepted_quantity' => $good, 'damaged_quantity' => $damaged, 'remaining_outstanding' => $remaining,
        'return_status' => $newStatus, 'final_payment' => $newFinalPayment,
        'receiving_id' => $replacementReceivingId, 'receiving_item_id' => $replacementReceivingItemId,
        'original_receiving_id' => $record['original_receiving_id'], 'original_receiving_item_id' => $record['original_receiving_item_id'],
        'claim_id' => $returnId
    ]);
} catch (DomainException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    replacementResponse(false, $e->getMessage(), [], 409);
} catch (InvalidArgumentException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    replacementResponse(false, $e->getMessage(), [], 400);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    replacementResponse(false, 'Unable to record replacement arrival.', ['error' => $e->getMessage()], 500);
}
?>
