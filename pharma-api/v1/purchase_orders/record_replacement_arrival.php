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
    $parsed = DateTime::createFromFormat('Y-m-d', $date);
    if (!$parsed || $parsed->format('Y-m-d') !== $date) throw new InvalidArgumentException('Expiry date must be valid.');
    return $date;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') replacementResponse(false, 'Only POST requests are allowed.', [], 405);
$payload = json_decode(file_get_contents('php://input'), true);
if (!is_array($payload)) replacementResponse(false, 'Invalid JSON payload.', [], 400);

try {
    $returnId = cleanId($payload['return_id'] ?? null);
    if ($returnId === '') throw new InvalidArgumentException('Return/Damage record is required.');
    $delivered = replacementQuantity($payload['delivered_quantity'] ?? 0, 'Replacement delivered quantity');
    $damaged = replacementQuantity($payload['damaged_quantity'] ?? 0, 'Replacement damaged quantity');
    if ($delivered <= 0) throw new InvalidArgumentException('Replacement delivered quantity must be greater than zero.');
    if ($damaged > $delivered) throw new InvalidArgumentException('Damaged quantity cannot exceed replacement delivered quantity.');
    $good = $delivered - $damaged;
    $remarks = trim((string) ($payload['remarks'] ?? ''));
    $issueType = trim((string) ($payload['issue_type'] ?? ''));
    $allowedIssues = ['Expired', 'Broken package', 'Wrong item delivered', 'Incorrect quantity', 'Damaged during delivery', 'Other'];
    if ($damaged > 0 && (!in_array($issueType, $allowedIssues, true) || $remarks === '')) throw new InvalidArgumentException('Issue type and remarks are required when replacement stock is damaged.');

    $pdo->beginTransaction();
    $recordStatement = $pdo->prepare(
        "SELECT por.*, po.po_number, po.total_amount, po.final_payment, poi.product_id,
                COALESCE(poi.unit_price_snapshot, 0) AS unit_price,
                COALESCE(NULLIF(poi.product_name_snapshot, ''), p.product_name) AS product_name,
                po.supplier_id, receiving.receiving_id,
                CASE WHEN md.product_id IS NOT NULL OR LOWER(COALESCE(pc.category_name, '')) LIKE '%medicine%' THEN 1 ELSE 0 END AS requires_expiry
         FROM purchase_order_returns por
         INNER JOIN purchase_orders po ON po.po_id = por.po_id
         INNER JOIN purchase_order_items poi ON poi.po_item_id = por.po_item_id
         INNER JOIN product p ON p.product_id = poi.product_id
         LEFT JOIN product_categories pc ON pc.category_id = p.category_id
         LEFT JOIN medicine_details md ON md.product_id = p.product_id
         LEFT JOIN purchase_order_receiving receiving ON receiving.po_id = po.po_id
         WHERE por.return_id = :return_id
         LIMIT 1 FOR UPDATE"
    );
    $recordStatement->execute([':return_id' => $returnId]);
    $record = $recordStatement->fetch(PDO::FETCH_ASSOC);
    if (!$record) throw new InvalidArgumentException('Return/Damage record not found.');
    $parsed = parsePurchaseOrderReturnRemarks($record['remarks'] ?? '');
    $metadata = $parsed['metadata'];
    if (($metadata['resolution'] ?? '') !== 'return_for_replacement') throw new InvalidArgumentException('This record is not awaiting replacement stock.');
    $expected = (int) ($metadata['replacement_expected_qty'] ?? 0);
    $alreadyReceived = (int) ($metadata['replacement_received_qty'] ?? 0);
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

    $inventoryStatement = $pdo->prepare("INSERT INTO product_inventory (inventory_id, receiving_id, product_id, batch_number, quantity_stocked, quantity_remaining, expiration_date, expiry_date, status) VALUES (:id, :receiving_id, :product_id, :batch_number, :quantity, :remaining, :expiry, :expiry_copy, 'Available')");
    $batchStatement = $pdo->prepare("INSERT INTO inventory_batches (batch_id, legacy_inventory_id, po_id, po_item_id, product_id, supplier_id, received_date, expiry_date, received_qty, storage_qty, shelf_qty, damaged_qty, returned_qty, unit_cost, batch_status) VALUES (:batch_id, :inventory_id, NULL, :po_item_id, :product_id, :supplier_id, CURRENT_TIMESTAMP, :expiry, :received, :storage, 0, 0, 0, :unit_cost, 'active')");
    foreach ($validatedBatches as $batch) {
        $inventoryId = newUuid($pdo);
        $inventoryStatement->execute([':id' => $inventoryId, ':receiving_id' => $record['receiving_id'], ':product_id' => $record['product_id'], ':batch_number' => $batch['identifier'], ':quantity' => $batch['quantity'], ':remaining' => $batch['quantity'], ':expiry' => $batch['expiry'], ':expiry_copy' => $batch['expiry']]);
        $batchStatement->execute([':batch_id' => newUuid($pdo), ':inventory_id' => $inventoryId, ':po_item_id' => $record['po_item_id'], ':product_id' => $record['product_id'], ':supplier_id' => $record['supplier_id'], ':expiry' => $batch['expiry'], ':received' => $batch['quantity'], ':storage' => $batch['quantity'], ':unit_cost' => $record['unit_price']]);
    }

    $newReceived = $alreadyReceived + $good;
    $metadata['replacement_received_qty'] = $newReceived;
    $remaining = max(0, $expected - $newReceived);
    $newStatus = $remaining === 0 ? 'Replacement received' : 'Replacement partially received';
    $updateReturn = $pdo->prepare('UPDATE purchase_order_returns SET remarks = :remarks, return_status = :status WHERE return_id = :return_id');
    $updateReturn->execute([':remarks' => buildPurchaseOrderReturnRemarks($metadata, $parsed['remarks']), ':status' => $newStatus, ':return_id' => $returnId]);

    if ($damaged > 0) {
        $eventMeta = ['version' => 1, 'resolution' => 'replacement_damage_event', 'delivered_quantity' => $delivered, 'damaged_quantity' => $damaged, 'missing_quantity' => 0, 'supplier_adjustment' => 0, 'replacement_expected_qty' => 0, 'replacement_received_qty' => 0, 'parent_return_id' => $returnId];
        $event = $pdo->prepare("INSERT INTO purchase_order_returns (return_id, po_id, po_item_id, return_quantity, damage_reason, remarks, return_status) VALUES (:id, :po_id, :po_item_id, :quantity, :reason, :remarks, 'Awaiting supplier action')");
        $event->execute([':id' => newUuid($pdo), ':po_id' => $record['po_id'], ':po_item_id' => $record['po_item_id'], ':quantity' => $damaged, ':reason' => $issueType, ':remarks' => buildPurchaseOrderReturnRemarks($eventMeta, $remarks)]);
    }

    $releasedValue = round($good * (float) $record['unit_price'], 2);
    $newFinalPayment = min((float) $record['total_amount'], (float) $record['final_payment'] + $releasedValue);
    $updatePo = $pdo->prepare("UPDATE purchase_orders SET final_payment = :final_payment, status = 'Delivered with Return/Damage' WHERE po_id = :po_id");
    $updatePo->execute([':final_payment' => $newFinalPayment, ':po_id' => $record['po_id']]);
    synchronizePurchaseOrderPaymentStatus($pdo, cleanId($record['po_id']), $newFinalPayment);
    $pdo->commit();

    recordActivityLog($pdo, 'Return/Damage', 'Replacement Arrival', $good . ' replacement units accepted for PO ' . $record['po_number'], $returnId);
    replacementResponse(true, $remaining === 0 ? 'Replacement fully received.' : 'Partial replacement recorded.', [
        'accepted_quantity' => $good, 'damaged_quantity' => $damaged, 'remaining_outstanding' => $remaining,
        'return_status' => $newStatus, 'final_payment' => $newFinalPayment
    ]);
} catch (InvalidArgumentException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    replacementResponse(false, $e->getMessage(), [], 400);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    replacementResponse(false, 'Unable to record replacement arrival.', ['error' => $e->getMessage()], 500);
}
?>
