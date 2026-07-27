<?php
$allowedRoles = ['super_admin', 'admin', 'manager', 'Admin', 'ro-super-admin', 'ro-admin', 'ro-manager'];
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once 'purchase_order_helpers.php';

const RECEIVING_DRAFT_PREFIX = "[INSPECTION_DRAFT_V1]\n";
const RECEIVING_META_PREFIX = "[RECEIVING_META_V1]\n";
const RETURN_META_PREFIX = "[RETURN_META_V1]";

function receiveResponse(bool $success, string $message, string $error = '', array $extra = [], int $httpCode = 200): void
{
    http_response_code($httpCode);
    echo json_encode(array_merge([
        'success' => $success,
        'status' => $success ? 'success' : 'error',
        'message' => $message,
        'error' => $error
    ], $extra), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit();
}

function receiveIntQuantity($value, string $label): int
{
    if (!is_numeric($value) || floor((float) $value) !== (float) $value) {
        throw new InvalidArgumentException("{$label} must be a whole number.");
    }
    return (int) $value;
}

function receiveMoney($value, string $label): float
{
    if ($value === '' || $value === null) return 0.0;
    if (!is_numeric($value)) throw new InvalidArgumentException("{$label} must be a valid amount.");
    $amount = round((float) $value, 2);
    if ($amount < 0) throw new InvalidArgumentException("{$label} cannot be negative.");
    return $amount;
}

function receiveDate($value, string $label, bool $required = false): ?string
{
    $date = trim((string) $value);
    if ($date === '') {
        if ($required) throw new InvalidArgumentException("{$label} is required.");
        return null;
    }
    $parsed = DateTime::createFromFormat('Y-m-d', $date);
    if (!$parsed || $parsed->format('Y-m-d') !== $date) {
        throw new InvalidArgumentException("{$label} must be a valid date.");
    }
    return $date;
}

function receiveReturnRemarks(array $metadata, string $remarks): string
{
    return RETURN_META_PREFIX . json_encode($metadata, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
        . "\n" . trim($remarks);
}

function receiveStatusForResolution(string $resolution): string
{
    return match ($resolution) {
        'return_for_replacement' => 'Awaiting replacement',
        'return_for_credit' => 'Awaiting supplier action',
        default => 'Resolved'
    };
}

function receiveBatchNumber(string $poNumber, string $poItemId, int $index, string $requested): string
{
    $clean = preg_replace('/[^A-Za-z0-9._-]+/', '-', trim($requested));
    if ($clean !== '') return substr($clean, 0, 50);
    $po = preg_replace('/[^A-Za-z0-9]+/', '', $poNumber) ?: 'PO';
    return substr($po . '-' . substr(str_replace('-', '', $poItemId), 0, 8) . '-B' . ($index + 1), 0, 50);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    receiveResponse(false, 'Only POST requests are allowed.', 'Invalid request method.', [], 405);
}

$payload = json_decode(file_get_contents('php://input'), true);
if (!is_array($payload)) {
    receiveResponse(false, 'Invalid JSON payload.', 'Request body is not valid JSON.', [], 400);
}

try {
    $poId = cleanId($payload['po_id'] ?? null);
    $mode = strtolower(trim((string) ($payload['mode'] ?? 'confirm')));
    $isDraft = $mode === 'draft';
    $remarks = cleanTransactionalText($payload['remarks'] ?? '') ?? '';
    $supplierDiscount = receiveMoney($payload['supplier_discount'] ?? ($payload['additional_amount'] ?? 0), 'Supplier discount');
    $paymentStatus = 'Unpaid';
    $amountPaidInput = 0.0;
    $items = is_array($payload['items'] ?? null) ? $payload['items'] : [];

    if ($poId === '') throw new InvalidArgumentException('Purchase order is required.');
    if (!$isDraft && count($items) === 0) throw new InvalidArgumentException('Received items are required.');

    $pdo->beginTransaction();

    $orderStatement = $pdo->prepare(
        'SELECT po_id, supplier_id, status, po_number
         FROM purchase_orders
         WHERE po_id = :po_id
         LIMIT 1
         FOR UPDATE'
    );
    $orderStatement->execute([':po_id' => $poId]);
    $order = $orderStatement->fetch(PDO::FETCH_ASSOC);
    if (!$order) throw new InvalidArgumentException('Purchase order not found.');
    if ($order['status'] !== 'Arrived') throw new InvalidArgumentException('Only arrived purchase orders can be inspected.');

    $receivingHeaderStatement = $pdo->prepare(
        'SELECT por.receiving_id, por.remarks,
                (SELECT COUNT(*) FROM purchase_order_receiving_items pori WHERE pori.receiving_id = por.receiving_id) AS item_count
         FROM purchase_order_receiving por
         WHERE por.po_id = :po_id
         LIMIT 1
         FOR UPDATE'
    );
    $receivingHeaderStatement->execute([':po_id' => $poId]);
    $receivingHeader = $receivingHeaderStatement->fetch(PDO::FETCH_ASSOC);
    if ($receivingHeader && (int) $receivingHeader['item_count'] > 0) {
        throw new InvalidArgumentException('This purchase order has already been received.');
    }

    if ($isDraft) {
        $draftPayload = [
            'version' => 1,
            'po_id' => $poId,
            'items' => $items,
            'supplier_discount' => $supplierDiscount,
            'payment_status' => $paymentStatus,
            'amount_paid' => $amountPaidInput,
            'remarks' => $remarks,
            'updated_by' => $_SESSION['user_id'] ?? null,
            'updated_by_name' => $_SESSION['full_name'] ?? ($_SESSION['username'] ?? null),
            'updated_at' => date(DATE_ATOM)
        ];
        $draftRemarks = RECEIVING_DRAFT_PREFIX . json_encode($draftPayload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($receivingHeader) {
            $statement = $pdo->prepare('UPDATE purchase_order_receiving SET remarks = :remarks, received_date = CURRENT_TIMESTAMP WHERE receiving_id = :receiving_id');
            $statement->execute([':remarks' => $draftRemarks, ':receiving_id' => $receivingHeader['receiving_id']]);
            $receivingId = $receivingHeader['receiving_id'];
        } else {
            $receivingId = newUuid($pdo);
            $statement = $pdo->prepare('INSERT INTO purchase_order_receiving (receiving_id, po_id, received_date, remarks) VALUES (:receiving_id, :po_id, CURRENT_TIMESTAMP, :remarks)');
            $statement->execute([':receiving_id' => $receivingId, ':po_id' => $poId, ':remarks' => $draftRemarks]);
        }
        $pdo->commit();
        recordActivityLog($pdo, 'Purchase Order', 'Inspection Draft Saved', 'Inspection draft saved for PO ' . $order['po_number'], $poId);
        receiveResponse(true, 'Inspection draft saved. Inventory and payment were not changed.', '', [
            'receiving_id' => $receivingId,
            'inspection_in_progress' => true
        ]);
    }

    $poItemStatement = $pdo->prepare(
        "SELECT poi.po_item_id, poi.product_id, poi.quantity,
                COALESCE(NULLIF(poi.inventory_qty_ordered, 0), poi.quantity) AS inventory_qty_ordered,
                COALESCE(NULLIF(poi.inventory_qty_ordered, 0), poi.quantity) * COALESCE(poi.unit_price_snapshot, 0) AS line_total,
                COALESCE(poi.unit_price_snapshot, 0) AS unit_price,
                COALESCE(NULLIF(poi.product_name_snapshot, ''), p.product_name) AS product_name,
                CASE WHEN md.product_id IS NOT NULL OR LOWER(COALESCE(pc.category_name, '')) LIKE '%medicine%' THEN 1 ELSE 0 END AS requires_expiry
         FROM purchase_order_items poi
         INNER JOIN product p ON p.product_id = poi.product_id
         LEFT JOIN product_categories pc ON pc.category_id = p.category_id
         LEFT JOIN medicine_details md ON md.product_id = p.product_id
         WHERE poi.po_id = :po_id"
    );
    $poItemStatement->execute([':po_id' => $poId]);
    $poItems = [];
    foreach ($poItemStatement->fetchAll(PDO::FETCH_ASSOC) as $row) $poItems[cleanId($row['po_item_id'])] = $row;
    if (!$poItems) throw new InvalidArgumentException('This purchase order has no items to receive.');

    $allowedIssues = ['Expired', 'Broken package', 'Wrong item delivered', 'Incorrect quantity', 'Damaged during delivery', 'Other'];
    $allowedResolutions = ['none', 'return_for_credit', 'return_for_replacement', 'keep_with_discount', 'keep_damaged', 'reject_without_replacement'];
    $validatedItems = [];
    $seenItems = [];
    $totalAmount = 0.0;
    $supplierCredit = 0.0;
    $replacementPending = 0.0;
    $itemDiscounts = 0.0;
    $hasIssues = false;

    foreach ($poItems as $poItem) $totalAmount += (float) $poItem['line_total'];

    foreach ($items as $index => $item) {
        $poItemId = cleanId($item['po_item_id'] ?? null);
        if (!isset($poItems[$poItemId])) throw new InvalidArgumentException('An inspected item does not belong to this purchase order.');
        if (isset($seenItems[$poItemId])) throw new InvalidArgumentException('Each purchase order item may be submitted only once.');
        $seenItems[$poItemId] = true;

        $ordered = (int) $poItems[$poItemId]['inventory_qty_ordered'];
        $delivered = receiveIntQuantity($item['delivered_quantity'] ?? ($item['received_quantity'] ?? 0), 'Delivered quantity');
        $damaged = receiveIntQuantity($item['damaged_quantity'] ?? 0, 'Damaged quantity');
        $returned = receiveIntQuantity($item['returned_quantity'] ?? 0, 'Returned quantity');
        $disposed = receiveIntQuantity($item['disposed_quantity'] ?? 0, 'Disposed quantity');
        if ($delivered < 0 || $damaged < 0 || $returned < 0 || $disposed < 0) throw new InvalidArgumentException('Inspection quantities cannot be negative.');
        if ($delivered > $ordered) throw new InvalidArgumentException('Delivered quantity cannot exceed ordered quantity. Resolve excess stock with the supplier before confirming.');
        if ($damaged > $delivered) throw new InvalidArgumentException('Damaged quantity cannot exceed delivered quantity.');

        $missing = $ordered - $delivered;
        $affected = $damaged + $missing;
        $issueType = trim((string) ($item['issue_type'] ?? ''));
        $resolution = strtolower(trim((string) ($item['resolution'] ?? ($item['damage_action'] ?? 'none'))));
        $resolution = match ($resolution) { 'return' => 'return_for_credit', 'keep' => 'keep_damaged', default => $resolution };
        $itemRemarks = cleanTransactionalText($item['remarks'] ?? '') ?? '';
        $itemDiscount = receiveMoney($item['supplier_adjustment'] ?? 0, 'Item supplier adjustment');
        $productLabel = trim((string) ($poItems[$poItemId]['product_name'] ?? 'Purchase order item'));

        if (empty($item['inspection_complete'])) throw new InvalidArgumentException("Complete the inspection for {$productLabel} before confirming receiving.");

        if (!in_array($resolution, $allowedResolutions, true)) throw new InvalidArgumentException('Select a valid issue resolution.');
        if ($affected > 0) {
            $hasIssues = true;
            if (!in_array($issueType, $allowedIssues, true)) throw new InvalidArgumentException('Select a valid issue type for every affected item.');
            if ($resolution === 'none') throw new InvalidArgumentException('Select a resolution for every affected item.');
            if ($itemRemarks === '') throw new InvalidArgumentException('Remarks are required for every affected item.');
        } elseif ($resolution !== 'none' || $issueType !== '' || $returned > 0 || $itemDiscount > 0) {
            throw new InvalidArgumentException('Issue details must be empty when there is no affected quantity.');
        }

        $expectedReturned = in_array($resolution, ['return_for_credit', 'return_for_replacement'], true) ? $damaged : 0;
        $expectedDisposed = $resolution === 'reject_without_replacement' ? $damaged : 0;
        if ($returned !== $expectedReturned) throw new InvalidArgumentException('Returned quantity does not match the selected resolution.');
        if ($disposed !== $expectedDisposed) throw new InvalidArgumentException('Disposed quantity does not match the selected resolution.');
        $accepted = $delivered - $returned - $disposed;
        if ($resolution === 'keep_with_discount' && $itemDiscount <= 0) throw new InvalidArgumentException('A supplier adjustment is required when keeping an affected item with a discount.');
        if ($resolution !== 'keep_with_discount' && $itemDiscount > 0) throw new InvalidArgumentException('Item supplier adjustment is only allowed for Keep with supplier discount.');
        if ($missing > 0 && in_array($resolution, ['keep_with_discount', 'keep_damaged'], true)) throw new InvalidArgumentException('Keep is not valid while units are missing. Select a supplier return, replacement, or rejection resolution.');

        $batches = is_array($item['batches'] ?? null) ? $item['batches'] : [];
        $validatedBatches = [];
        $allocated = 0;
        foreach ($batches as $batchIndex => $batch) {
            $quantity = receiveIntQuantity($batch['quantity'] ?? 0, 'Batch quantity');
            if ($quantity <= 0) throw new InvalidArgumentException('Batch quantity must be greater than zero.');
            $noExpiry = !empty($batch['no_expiry']);
            if ((int) $poItems[$poItemId]['requires_expiry'] === 1 && $noExpiry) throw new InvalidArgumentException('Medicines require an expiry date.');
            $expiry = receiveDate($batch['expiry_date'] ?? '', 'Batch expiry date', (int) $poItems[$poItemId]['requires_expiry'] === 1 && !$noExpiry);
            $validatedBatches[] = [
                'batch_number' => receiveBatchNumber($order['po_number'], $poItemId, $batchIndex, (string) ($batch['batch_identifier'] ?? '')),
                'quantity' => $quantity,
                'expiry_date' => $noExpiry ? null : $expiry
            ];
            $allocated += $quantity;
        }
        if ($allocated > $accepted) throw new InvalidArgumentException("Allocated inventory for {$productLabel} exceeds accepted inventory by " . ($allocated - $accepted) . ' units.');
        if ($allocated < $accepted) throw new InvalidArgumentException(($accepted - $allocated) . " accepted units for {$productLabel} remain to be allocated to inventory batches.");

        $unitPrice = (float) $poItems[$poItemId]['unit_price'];
        if (in_array($resolution, ['return_for_credit', 'reject_without_replacement'], true)) $supplierCredit += $affected * $unitPrice;
        if ($resolution === 'return_for_replacement') $replacementPending += $affected * $unitPrice;
        $itemDiscounts += $itemDiscount;

        $validatedItems[] = compact('poItemId', 'ordered', 'delivered', 'damaged', 'missing', 'affected', 'accepted', 'returned', 'disposed', 'issueType', 'resolution', 'itemRemarks', 'itemDiscount', 'validatedBatches', 'unitPrice') + ['po_item' => $poItems[$poItemId]];
    }
    if (count($seenItems) !== count($poItems)) throw new InvalidArgumentException('Every purchase order item must be inspected before confirmation.');

    $totalDiscount = round($supplierDiscount + $itemDiscounts, 2);
    $finalPayment = round($totalAmount - $supplierCredit - $replacementPending - $totalDiscount, 2);
    if ($finalPayment < 0) throw new InvalidArgumentException('Final payable amount cannot be negative.');
    $amountPaid = 0.0;
    $remainingBalance = round(max(0, $finalPayment - $amountPaid), 2);
    $receivingMeta = [
        'version' => 1,
        'payment_status' => $paymentStatus,
        'amount_paid' => $amountPaid,
        'remaining_balance' => $remainingBalance,
        'supplier_credit' => round($supplierCredit, 2),
        'supplier_discount' => $totalDiscount,
        'final_amount_payable' => $finalPayment
    ];
    $storedReceivingRemarks = RECEIVING_META_PREFIX . json_encode($receivingMeta, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n" . $remarks;

    $receivingId = $receivingHeader ? cleanId($receivingHeader['receiving_id']) : newUuid($pdo);
    if ($receivingHeader) {
        $statement = $pdo->prepare('UPDATE purchase_order_receiving SET received_date = CURRENT_TIMESTAMP, remarks = :remarks WHERE receiving_id = :receiving_id');
        $statement->execute([':remarks' => $storedReceivingRemarks, ':receiving_id' => $receivingId]);
    } else {
        $statement = $pdo->prepare('INSERT INTO purchase_order_receiving (receiving_id, po_id, received_date, remarks) VALUES (:receiving_id, :po_id, CURRENT_TIMESTAMP, :remarks)');
        $statement->execute([':receiving_id' => $receivingId, ':po_id' => $poId, ':remarks' => $storedReceivingRemarks]);
    }

    $receiveItemStatement = $pdo->prepare('INSERT INTO purchase_order_receiving_items (receiving_item_id, receiving_id, po_item_id, received_quantity, damaged_quantity) VALUES (:id, :receiving_id, :po_item_id, :received, :damaged)');
    $inventoryStatement = $pdo->prepare("INSERT INTO product_inventory (inventory_id, receiving_id, product_id, batch_number, quantity_stocked, quantity_remaining, expiration_date, expiry_date, status) VALUES (:id, :receiving_id, :product_id, :batch_number, :quantity, :remaining, :expiry, :expiry_copy, :status)");
    $batchStatement = $pdo->prepare("INSERT INTO inventory_batches (batch_id, legacy_inventory_id, po_id, po_item_id, product_id, supplier_id, received_date, expiry_date, received_qty, storage_qty, shelf_qty, damaged_qty, returned_qty, unit_cost, batch_status) VALUES (:batch_id, :inventory_id, :po_id, :po_item_id, :product_id, :supplier_id, CURRENT_TIMESTAMP, :expiry, :received, :storage, 0, :damaged, :returned, :unit_cost, :status)");
    $returnStatement = $pdo->prepare('INSERT INTO purchase_order_returns (return_id, po_id, po_item_id, return_quantity, damage_reason, remarks, return_status) VALUES (:id, :po_id, :po_item_id, :quantity, :reason, :remarks, :status)');
    $activityRows = [];

    foreach ($validatedItems as $validated) {
        $receiveItemStatement->execute([
            ':id' => newUuid($pdo), ':receiving_id' => $receivingId, ':po_item_id' => $validated['poItemId'],
            ':received' => $validated['delivered'], ':damaged' => $validated['damaged']
        ]);

        $damagedToQuarantine = in_array($validated['resolution'], ['keep_damaged', 'keep_with_discount'], true) ? $validated['damaged'] : 0;
        foreach ($validated['validatedBatches'] as $batchIndex => $batch) {
            $quarantinedQuantity = min($batch['quantity'], $damagedToQuarantine);
            $storageQuantity = $batch['quantity'] - $quarantinedQuantity;
            $damagedToQuarantine -= $quarantinedQuantity;
            $inventoryId = newUuid($pdo);
            $inventoryStatement->execute([
                ':id' => $inventoryId, ':receiving_id' => $receivingId, ':product_id' => cleanId($validated['po_item']['product_id']),
                ':batch_number' => $batch['batch_number'], ':quantity' => $storageQuantity, ':remaining' => $storageQuantity,
                ':expiry' => $batch['expiry_date'], ':expiry_copy' => $batch['expiry_date'], ':status' => $storageQuantity > 0 ? 'Available' : 'Out of Stock'
            ]);
            $batchStatement->execute([
                ':batch_id' => newUuid($pdo), ':inventory_id' => $inventoryId,
                ':po_id' => $batchIndex === 0 ? $poId : null, ':po_item_id' => $validated['poItemId'],
                ':product_id' => cleanId($validated['po_item']['product_id']), ':supplier_id' => cleanId($order['supplier_id']),
                ':expiry' => $batch['expiry_date'], ':received' => $batch['quantity'], ':storage' => $storageQuantity,
                ':damaged' => $quarantinedQuantity,
                ':returned' => $batchIndex === 0 ? $validated['returned'] : 0,
                ':unit_cost' => $validated['unitPrice'], ':status' => 'active'
            ]);
            if ($storageQuantity > 0) $activityRows[] = ['inventory_id' => $inventoryId, 'quantity' => $storageQuantity, 'product_name' => $validated['po_item']['product_name']];
        }

        if (!$validated['validatedBatches'] && $validated['affected'] > 0) {
            $batchStatement->execute([
                ':batch_id' => newUuid($pdo), ':inventory_id' => null, ':po_id' => $poId, ':po_item_id' => $validated['poItemId'],
                ':product_id' => cleanId($validated['po_item']['product_id']), ':supplier_id' => cleanId($order['supplier_id']),
                ':expiry' => null, ':received' => $validated['delivered'], ':storage' => 0,
                ':damaged' => in_array($validated['resolution'], ['keep_damaged', 'keep_with_discount', 'reject_without_replacement'], true) ? $validated['damaged'] : 0,
                ':returned' => $validated['returned'], ':unit_cost' => $validated['unitPrice'], ':status' => $validated['returned'] > 0 ? 'returned' : 'damaged'
            ]);
        }

        if ($validated['affected'] > 0) {
            $metadata = [
                'version' => 1, 'resolution' => $validated['resolution'], 'delivered_quantity' => $validated['delivered'],
                'damaged_quantity' => $validated['damaged'], 'missing_quantity' => $validated['missing'],
                'supplier_adjustment' => $validated['itemDiscount'], 'replacement_expected_qty' => $validated['resolution'] === 'return_for_replacement' ? $validated['affected'] : 0,
                'replacement_received_qty' => 0, 'parent_return_id' => null
            ];
            $returnStatement->execute([
                ':id' => newUuid($pdo), ':po_id' => $poId, ':po_item_id' => $validated['poItemId'], ':quantity' => $validated['affected'],
                ':reason' => $validated['issueType'], ':remarks' => receiveReturnRemarks($metadata, $validated['itemRemarks']),
                ':status' => receiveStatusForResolution($validated['resolution'])
            ]);
        }
    }

    $newStatus = $hasIssues ? 'Delivered with Return/Damage' : 'Delivered';
    $hasPaymentChange = $supplierCredit > 0 || $replacementPending > 0 || $totalDiscount > 0;
    $updateOrder = $pdo->prepare('UPDATE purchase_orders SET status = :status, payment_status = :payment_status, total_amount = :total, final_payment = :final WHERE po_id = :po_id');
    $updateOrder->execute([':status' => $newStatus, ':payment_status' => $paymentStatus, ':total' => $totalAmount, ':final' => $finalPayment, ':po_id' => $poId]);
    $pdo->commit();

    recordActivityLog($pdo, 'Purchase Order', $newStatus, 'PO ' . $order['po_number'] . ' is ' . $newStatus, $poId);
    foreach ($activityRows as $activity) recordActivityLog($pdo, 'Inventory', 'Received', $activity['quantity'] . ' received into storage: ' . $activity['product_name'], $activity['inventory_id']);

    receiveResponse(true, 'Purchase order received successfully.', '', [
        'po_status' => $newStatus, 'has_adjustment' => $hasPaymentChange, 'total_amount' => $totalAmount,
        'final_payment' => $finalPayment, 'supplier_credit' => $supplierCredit,
        'supplier_discount' => $totalDiscount, 'replacement_value_pending' => $replacementPending,
        'payment_status' => $paymentStatus, 'amount_paid' => $amountPaid, 'remaining_balance' => $remainingBalance
    ]);
} catch (InvalidArgumentException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    receiveResponse(false, $e->getMessage(), $e->getMessage(), [], 400);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    receiveResponse(false, 'Unable to receive purchase order.', $e->getMessage(), [], 500);
}
?>
