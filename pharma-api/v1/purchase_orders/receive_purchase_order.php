<?php
$allowedRoles = ['super_admin', 'admin', 'manager', 'Admin', 'ro-super-admin', 'ro-admin', 'ro-manager'];
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once 'purchase_order_helpers.php';
require_once 'purchase_order_payment_helpers.php';
require_once '../products/product_pricing_schema.php';
require_once '../suppliers/purchasing_conversion.php';

const RECEIVING_DRAFT_PREFIX = "[INSPECTION_DRAFT_V1]\n";
const RECEIVING_META_PREFIX = "[RECEIVING_META_V1]\n";

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
    ensureProductPricingSchema($pdo);
    $poId = cleanId($payload['po_id'] ?? null);
    $mode = strtolower(trim((string) ($payload['mode'] ?? 'confirm')));
    $isDraft = $mode === 'draft';
    $remarks = cleanTransactionalText($payload['remarks'] ?? '') ?? '';
    $deliveredByName = trim((string) (cleanTransactionalText($payload['delivered_by_name'] ?? '') ?? ''));
    $deliveryReceiptNo = trim((string) (cleanTransactionalText($payload['delivery_receipt_no'] ?? '') ?? ''));
    $deliveredByName = mb_substr($deliveredByName, 0, 150);
    $deliveryReceiptNo = mb_substr($deliveryReceiptNo, 0, 100);
    $items = is_array($payload['items'] ?? null) ? $payload['items'] : [];

    if ($poId === '') throw new InvalidArgumentException('Purchase order is required.');
    if (!$isDraft && count($items) === 0) throw new InvalidArgumentException('Received items are required.');
    if (!$isDraft && $deliveredByName === '') throw new InvalidArgumentException('Delivered By / Driver is required.');
    if (!$isDraft && $deliveryReceiptNo === '') throw new InvalidArgumentException('Supplier delivery receipt number is required.');

    $pdo->beginTransaction();

    $orderStatement = $pdo->prepare(
        'SELECT po_id, pr_id, supplier_id, status, po_number, total_amount, final_payment
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
        "SELECT por.receiving_id, por.remarks,
                (SELECT COUNT(*) FROM purchase_order_receiving_items pori WHERE pori.receiving_id = por.receiving_id) AS item_count
         FROM purchase_order_receiving por
         WHERE por.po_id = :po_id AND por.receiving_type = 'Original'
         LIMIT 1
         FOR UPDATE"
    );
    $receivingHeaderStatement->execute([':po_id' => $poId]);
    $receivingHeader = $receivingHeaderStatement->fetch(PDO::FETCH_ASSOC);
    if ($receivingHeader && (int) $receivingHeader['item_count'] > 0) {
        throw new InvalidArgumentException('This purchase order has already been received.');
    }

    if ($isDraft) {
        $draftHasIssues = false;
        $draftAllInspected = count($items) > 0;
        foreach ($items as $draftItem) {
            $draftHasIssues = $draftHasIssues || (float) ($draftItem['affected_quantity'] ?? ($draftItem['damaged_quantity'] ?? 0)) > 0 || (float) ($draftItem['missing_quantity'] ?? 0) > 0;
            $draftAllInspected = $draftAllInspected && !empty($draftItem['inspection_complete']);
        }
        $draftInspectionStatus = $draftHasIssues ? 'With Issues' : ($draftAllInspected ? 'Ready to Confirm' : 'In Progress');
        $draftPayload = [
            'version' => 1,
            'po_id' => $poId,
            'delivered_by_name' => $deliveredByName,
            'delivery_receipt_no' => $deliveryReceiptNo,
            'items' => $items,
            'remarks' => $remarks,
            'updated_by' => $_SESSION['user_id'] ?? null,
            'updated_by_name' => $_SESSION['full_name'] ?? ($_SESSION['username'] ?? null),
            'updated_at' => date(DATE_ATOM)
        ];
        $draftRemarks = RECEIVING_DRAFT_PREFIX . json_encode($draftPayload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($receivingHeader) {
            $statement = $pdo->prepare('UPDATE purchase_order_receiving SET remarks = :remarks, delivered_by_name = :delivered_by_name, delivery_receipt_no = :delivery_receipt_no, received_date = CURRENT_TIMESTAMP, inspection_status = :inspection_status, inspected_by = :inspected_by WHERE receiving_id = :receiving_id');
            $statement->execute([':remarks' => $draftRemarks, ':delivered_by_name' => $deliveredByName ?: null, ':delivery_receipt_no' => $deliveryReceiptNo ?: null, ':inspection_status' => $draftInspectionStatus, ':inspected_by' => $_SESSION['user_id'] ?? null, ':receiving_id' => $receivingHeader['receiving_id']]);
            $receivingId = $receivingHeader['receiving_id'];
        } else {
            $receivingId = newUuid($pdo);
            $statement = $pdo->prepare("INSERT INTO purchase_order_receiving (receiving_id, po_id, receiving_type, received_date, remarks, inspection_status, inspected_by, delivered_by_name, delivery_receipt_no) VALUES (:receiving_id, :po_id, 'Original', CURRENT_TIMESTAMP, :remarks, :inspection_status, :inspected_by, :delivered_by_name, :delivery_receipt_no)");
            $statement->execute([':receiving_id' => $receivingId, ':po_id' => $poId, ':remarks' => $draftRemarks, ':inspection_status' => $draftInspectionStatus, ':inspected_by' => $_SESSION['user_id'] ?? null, ':delivered_by_name' => $deliveredByName ?: null, ':delivery_receipt_no' => $deliveryReceiptNo ?: null]);
        }
        $pdo->commit();
        recordActivityLog($pdo, 'Purchase Order', 'Inspection Draft Saved', 'Inspection draft saved for PO ' . $order['po_number'], $poId);
        receiveResponse(true, 'Inspection draft saved. Inventory was not changed.', '', [
            'receiving_id' => $receivingId,
            'inspection_in_progress' => true
        ]);
    }

    $poItemStatement = $pdo->prepare(
        "SELECT poi.po_item_id, poi.product_id, poi.quantity, poi.purchase_qty, poi.purchase_unit_snapshot,
                COALESCE(NULLIF(poi.unit_snapshot,''),pmu.unit_name) AS inventory_unit,
                COALESCE(NULLIF(poi.inventory_qty_ordered, 0), poi.quantity) AS inventory_qty_ordered,
                COALESCE(ROUND(piii.unit_cost * poi.purchase_qty, 2), NULLIF(poi.line_total, 0), COALESCE(NULLIF(poi.inventory_qty_ordered, 0), poi.quantity) * COALESCE(poi.unit_price_snapshot, 0)) AS line_total,
                COALESCE(piii.unit_cost / NULLIF(poi.units_per_purchase_unit_snapshot, 0), poi.unit_price_snapshot, 0) AS unit_price,
                COALESCE(poi.units_per_purchase_unit_snapshot, 1) AS units_per_purchase_unit,
                COALESCE(NULLIF(poi.product_name_snapshot, ''), p.product_name) AS product_name,
                CASE WHEN md.product_id IS NOT NULL OR LOWER(COALESCE(pc.category_name, '')) LIKE '%medicine%' THEN 1 ELSE 0 END AS requires_expiry
         FROM purchase_order_items poi
         INNER JOIN product p ON p.product_id = poi.product_id
         INNER JOIN product_measurement_units pmu ON pmu.measurement_unit_id=p.inventory_unit_id
         LEFT JOIN product_categories pc ON pc.category_id = p.category_id
         LEFT JOIN medicine_details md ON md.product_id = p.product_id
         LEFT JOIN purchase_order_invoice_items piii ON piii.po_item_id = poi.po_item_id
         WHERE poi.po_id = :po_id"
    );
    $poItemStatement->execute([':po_id' => $poId]);
    $poItems = [];
    foreach ($poItemStatement->fetchAll(PDO::FETCH_ASSOC) as $row) $poItems[cleanId($row['po_item_id'])] = $row;
    if (!$poItems) throw new InvalidArgumentException('This purchase order has no items to receive.');

    $allowedIssues = ['Damaged Product', 'Broken Package', 'Expired', 'Wrong Item', 'Short Quantity', 'Other'];
    $allowedDispositions = ['return_to_supplier', 'hold_quarantine', 'dispose', 'not_applicable'];
    $allowedResolutions = ['none', 'replacement', 'supplier_credit', 'next_po_credit', 'refund', 'no_compensation'];
    $validatedItems = [];
    $seenItems = [];
    $hasIssues = false;

    foreach ($items as $index => $item) {
        $poItemId = cleanId($item['po_item_id'] ?? null);
        if (!isset($poItems[$poItemId])) throw new InvalidArgumentException('An inspected item does not belong to this purchase order.');
        if (isset($seenItems[$poItemId])) throw new InvalidArgumentException('Each purchase order item may be submitted only once.');
        $seenItems[$poItemId] = true;

        $ordered = (int) $poItems[$poItemId]['inventory_qty_ordered'];
        $deliveredPurchaseQuantity = array_key_exists('delivered_purchase_quantity', $item)
            ? receiveIntQuantity($item['delivered_purchase_quantity'], 'Delivered Purchase Unit quantity')
            : null;
        $delivered = $deliveredPurchaseQuantity !== null
            ? inventoryQuantityForPurchaseQuantity($deliveredPurchaseQuantity, (int) $poItems[$poItemId]['units_per_purchase_unit'])
            : receiveIntQuantity($item['delivered_quantity'] ?? ($item['received_quantity'] ?? 0), 'Delivered quantity');
        if ($deliveredPurchaseQuantity !== null && $deliveredPurchaseQuantity > (int) $poItems[$poItemId]['purchase_qty']) {
            throw new InvalidArgumentException('Delivered Purchase Unit quantity cannot exceed the PO quantity.');
        }
        $hasSeparatedQuantities = array_key_exists('damaged_unit_conversion_id', $item) || array_key_exists('action_quantity', $item);
        $legacyClaimQuantity = receiveIntQuantity($item['affected_quantity'] ?? ($item['damaged_quantity'] ?? 0), 'Affected package quantity');
        $legacyConversionId = cleanId($item['unit_conversion_id'] ?? null);
        if ($legacyClaimQuantity > 0 && $legacyConversionId === '') $legacyConversionId = supplierClaimDefaultConversion($pdo, $poItemId);
        $legacyBaseQuantity = $legacyConversionId !== '' ? supplierClaimBaseQuantity($pdo, $poItemId, $legacyConversionId) : 1;

        $damagedQuantity = $hasSeparatedQuantities
            ? receiveIntQuantity($item['damaged_quantity'] ?? 0, 'Damaged quantity')
            : $legacyClaimQuantity;
        $damagedUnitConversionId = $hasSeparatedQuantities
            ? cleanId($item['damaged_unit_conversion_id'] ?? null)
            : $legacyConversionId;
        if ($damagedUnitConversionId === '') $damagedUnitConversionId = supplierClaimDefaultConversion($pdo, $poItemId);
        $damagedBaseQuantity = supplierClaimBaseQuantity($pdo, $poItemId, $damagedUnitConversionId);
        $damaged = $damagedQuantity * $damagedBaseQuantity;

        $actionQuantity = $hasSeparatedQuantities
            ? receiveIntQuantity($item['action_quantity'] ?? 0, 'Action quantity')
            : $legacyClaimQuantity;
        $actionUnitConversionId = $hasSeparatedQuantities
            ? cleanId($item['action_unit_conversion_id'] ?? null)
            : $legacyConversionId;
        if ($actionUnitConversionId === '') $actionUnitConversionId = supplierClaimDefaultConversion($pdo, $poItemId);
        $actionUnitBaseQuantity = supplierClaimBaseQuantity($pdo, $poItemId, $actionUnitConversionId);
        $action = $actionQuantity * $actionUnitBaseQuantity;
        $validatedDamageLines = [];
        $affectedPackageCapacity = 0;
        $damageLines = is_array($item['damage_lines'] ?? null) ? $item['damage_lines'] : [];
        if ($damageLines) {
            $damaged = 0;
            $receivedPackageCount = $deliveredPurchaseQuantity ?? intdiv($delivered, max(1, (int) $poItems[$poItemId]['units_per_purchase_unit']));
            $affectedUnitConversionId = supplierClaimPurchaseConversion($pdo, $poItemId);
            $affectedUnitCapacity = supplierClaimBaseQuantity($pdo, $poItemId, $affectedUnitConversionId);
            $seenPackageSequences = [];
            foreach ($damageLines as $damageLine) {
                $packageSequence = receiveIntQuantity($damageLine['package_sequence'] ?? ($damageLine['sequence_no'] ?? 0), 'Affected package');
                if ($packageSequence < 1 || $packageSequence > $receivedPackageCount) {
                    throw new InvalidArgumentException("Affected package must be between 1 and {$receivedPackageCount}.");
                }
                if (isset($seenPackageSequences[$packageSequence])) throw new InvalidArgumentException('The same physical package cannot be recorded twice.');
                $seenPackageSequences[$packageSequence] = true;
                $lineDamagedUnitConversionId = cleanId($damageLine['damaged_unit_conversion_id'] ?? null);
                if ($lineDamagedUnitConversionId === '') throw new InvalidArgumentException('Every affected package requires a configured damaged unit.');
                $lineDamagedUnitBase = supplierClaimBaseQuantity($pdo, $poItemId, $lineDamagedUnitConversionId);
                $lineDamagedQuantity = receiveIntQuantity($damageLine['damaged_quantity'] ?? 0, 'Damaged contents quantity');
                if ($lineDamagedQuantity <= 0) throw new InvalidArgumentException('Damaged quantity must be greater than zero for every affected package.');
                $lineDamagedBase = $lineDamagedQuantity * $lineDamagedUnitBase;
                if ($lineDamagedBase > $affectedUnitCapacity) {
                    throw new InvalidArgumentException("Damaged contents cannot exceed {$affectedUnitCapacity} {$poItems[$poItemId]['inventory_unit']} in one {$poItems[$poItemId]['purchase_unit_snapshot']}.");
                }
                $batchIndexValue = $damageLine['batch_index'] ?? null;
                if ($batchIndexValue !== null && $batchIndexValue !== '' && filter_var($batchIndexValue, FILTER_VALIDATE_INT) === false) {
                    throw new InvalidArgumentException('Select a valid batch/lot for every affected goods row.');
                }
                $damaged += $lineDamagedBase;
                $affectedPackageCapacity += $affectedUnitCapacity;
                $validatedDamageLines[] = [
                    'sequence_no' => $packageSequence,
                    'affected_quantity' => 1,
                    'affected_unit_conversion_id' => $affectedUnitConversionId,
                    'damaged_quantity' => $lineDamagedQuantity,
                    'damaged_unit_conversion_id' => $lineDamagedUnitConversionId,
                    'batch_index' => $batchIndexValue === null || $batchIndexValue === '' ? null : (int) $batchIndexValue,
                ];
            }
            if ($affectedPackageCapacity > $delivered) throw new InvalidArgumentException('Affected package rows exceed the quantity physically received.');
            $damagedUnitConversionId = supplierClaimDefaultConversion($pdo, $poItemId);
            $damagedBaseQuantity = supplierClaimBaseQuantity($pdo, $poItemId, $damagedUnitConversionId);
            $damagedQuantity = intdiv($damaged, $damagedBaseQuantity);
            $actionUnitConversionId = $damagedUnitConversionId;
            $actionUnitBaseQuantity = $damagedBaseQuantity;
            $actionQuantity = $damagedQuantity;
            $action = $damaged;
        }
        $returned = receiveIntQuantity($item['returned_quantity'] ?? 0, 'Returned quantity');
        $disposed = receiveIntQuantity($item['disposed_quantity'] ?? 0, 'Disposed quantity');
        if ($delivered < 0 || $damaged < 0 || $action < 0 || $returned < 0 || $disposed < 0) throw new InvalidArgumentException('Inspection quantities cannot be negative.');
        if ($delivered > $ordered) throw new InvalidArgumentException('Delivered quantity cannot exceed ordered quantity. Resolve excess stock with the supplier before confirming.');
        if ($damaged > $delivered) throw new InvalidArgumentException("Cannot exceed the received quantity of {$delivered} {$poItems[$poItemId]['inventory_unit']}.");
        if ($action > $delivered) throw new InvalidArgumentException('Action quantity cannot exceed delivered quantity.');

        $missing = $ordered - $delivered;
        $hasIssue = !empty($item['has_issue']) || $missing > 0 || !empty($validatedDamageLines);
        $affected = ($hasIssue ? max($action, $damaged) : 0) + $missing;
        $issueType = trim((string) ($item['issue_type'] ?? ''));
        $issueDetail = cleanTransactionalText($item['issue_detail'] ?? '') ?? '';
        $disposition = strtolower(trim((string) ($item['disposition'] ?? '')));
        $resolution = strtolower(trim((string) ($item['resolution'] ?? 'none')));
        $confirmedAdjustment = round((float) ($item['confirmed_adjustment'] ?? 0), 2);
        $itemRemarks = cleanTransactionalText($item['remarks'] ?? '') ?? '';
        $productLabel = trim((string) ($poItems[$poItemId]['product_name'] ?? 'Purchase order item'));

        if (empty($item['inspection_complete'])) throw new InvalidArgumentException("Complete the inspection for {$productLabel} before confirming receiving.");

        if (!in_array($resolution, $allowedResolutions, true)) throw new InvalidArgumentException('Select a valid issue resolution.');
        if ($hasIssue) {
            $hasIssues = true;
            if (!$validatedDamageLines && $missing === 0) throw new InvalidArgumentException('Add at least one affected goods row for every reported issue.');
            if (!in_array($issueType, $allowedIssues, true)) throw new InvalidArgumentException('Select a valid issue type for every affected item.');
            if ($issueType === 'Other' && $issueDetail === '') throw new InvalidArgumentException('Specify the issue when Other is selected.');
            if (!in_array($disposition, $allowedDispositions, true)) throw new InvalidArgumentException('Select a valid disposition for every affected item.');
            if ($resolution === 'none') throw new InvalidArgumentException('Select a resolution for every affected item.');
            if (in_array($resolution, ['supplier_credit', 'next_po_credit', 'refund'], true) && $confirmedAdjustment <= 0) throw new InvalidArgumentException('Enter the positive monetary amount confirmed by the supplier.');
        } elseif ($resolution !== 'none' || $issueType !== '' || $disposition !== '' || $returned > 0 || $disposed > 0) {
            throw new InvalidArgumentException('Issue details must be empty when there is no affected quantity.');
        }

        $physicalAction = in_array($disposition, ['return_to_supplier', 'hold_quarantine', 'dispose'], true);
        if ($physicalAction && $action <= 0) throw new InvalidArgumentException('Action quantity is required for the selected affected goods action.');
        if ($physicalAction && $action < $damaged) throw new InvalidArgumentException('Action quantity cannot be less than the physically damaged quantity.');
        if ($damaged > 0 && $disposition === 'not_applicable') throw new InvalidArgumentException('A physical action is required for damaged goods that were received.');
        if ($disposition === 'not_applicable' && $action !== 0) throw new InvalidArgumentException('Action quantity must be zero when the action is Not Applicable.');
        if ($missing > 0 && $damaged === 0 && $action === 0 && $disposition !== 'not_applicable') throw new InvalidArgumentException('Short deliveries without goods to remove must use the not-applicable action.');
        $expectedReturned = $disposition === 'return_to_supplier' ? $action : 0;
        $expectedDisposed = $disposition === 'dispose' ? $action : 0;
        if ($returned !== $expectedReturned) throw new InvalidArgumentException('Returned quantity does not match the selected resolution.');
        if ($disposed !== $expectedDisposed) throw new InvalidArgumentException('Disposed quantity does not match the selected resolution.');
        $accepted = $delivered - $action;

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
        foreach ($validatedDamageLines as &$damageLine) {
            if ($damageLine['batch_index'] === null && count($validatedBatches) === 1) $damageLine['batch_index'] = 0;
            if ($damageLine['batch_index'] !== null && !array_key_exists($damageLine['batch_index'], $validatedBatches)) {
                throw new InvalidArgumentException('Select a valid batch/lot for every affected goods row.');
            }
            if (count($validatedBatches) > 1 && $damageLine['batch_index'] === null) {
                throw new InvalidArgumentException('Select a batch/lot for every affected goods row when inventory is split across batches.');
            }
        }
        unset($damageLine);
        if ($allocated > $accepted) throw new InvalidArgumentException("Allocated inventory for {$productLabel} exceeds accepted inventory by " . ($allocated - $accepted) . ' units.');
        if ($allocated < $accepted) throw new InvalidArgumentException(($accepted - $allocated) . " accepted units for {$productLabel} remain to be allocated to inventory batches.");

        // PO item unit_price_snapshot is the approved cost per base inventory unit.
        $unitPrice = (float) $poItems[$poItemId]['unit_price'];
        $claimUnitConversionId = $action > 0 ? $actionUnitConversionId : $damagedUnitConversionId;
        $storedClaimQuantity = $action > 0 ? $actionQuantity : $damagedQuantity;
        if ($missing > 0) {
            $claimUnitConversionId = supplierClaimDefaultConversion($pdo, $poItemId);
            $storedClaimQuantity = $action + $missing;
        }
        $claimIssueType = $issueType === 'Other' ? substr('Other: ' . $issueDetail, 0, 80) : $issueType;
        $validatedItems[] = compact('poItemId', 'ordered', 'delivered', 'damagedQuantity', 'damagedUnitConversionId', 'damaged', 'validatedDamageLines', 'actionQuantity', 'actionUnitConversionId', 'action', 'missing', 'affected', 'accepted', 'returned', 'disposed', 'issueType', 'issueDetail', 'claimIssueType', 'disposition', 'resolution', 'confirmedAdjustment', 'itemRemarks', 'validatedBatches', 'unitPrice', 'claimUnitConversionId', 'storedClaimQuantity') + ['po_item' => $poItems[$poItemId]];
    }
    if (count($seenItems) !== count($poItems)) throw new InvalidArgumentException('Every purchase order item must be inspected before confirmation.');
    $confirmedCurrentDiscount = array_sum(array_map(
        static fn(array $item): float => $item['resolution'] === 'supplier_credit' ? (float) $item['confirmedAdjustment'] : 0.0,
        $validatedItems
    ));
    $grossPayable = round((float) ($order['final_payment'] ?: $order['total_amount']), 2);
    if ($confirmedCurrentDiscount > $grossPayable) throw new InvalidArgumentException('Confirmed current-PO discounts cannot exceed the original PO total.');

    $receivingMeta = [
        'version' => 1,
        'workflow' => 'physical_receiving'
    ];
    $storedReceivingRemarks = RECEIVING_META_PREFIX . json_encode($receivingMeta, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n" . $remarks;

    $receivingId = $receivingHeader ? cleanId($receivingHeader['receiving_id']) : newUuid($pdo);
    if ($receivingHeader) {
        $statement = $pdo->prepare("UPDATE purchase_order_receiving SET received_date = CURRENT_TIMESTAMP, remarks = :remarks, delivered_by_name = :delivered_by_name, delivery_receipt_no = :delivery_receipt_no, inspection_status = 'Confirmed', inspected_by = :inspected_by WHERE receiving_id = :receiving_id");
        $statement->execute([':remarks' => $storedReceivingRemarks, ':delivered_by_name' => $deliveredByName, ':delivery_receipt_no' => $deliveryReceiptNo, ':inspected_by' => $_SESSION['user_id'] ?? null, ':receiving_id' => $receivingId]);
    } else {
        $statement = $pdo->prepare("INSERT INTO purchase_order_receiving (receiving_id, po_id, receiving_type, received_date, remarks, inspection_status, inspected_by, delivered_by_name, delivery_receipt_no) VALUES (:receiving_id, :po_id, 'Original', CURRENT_TIMESTAMP, :remarks, 'Confirmed', :inspected_by, :delivered_by_name, :delivery_receipt_no)");
        $statement->execute([':receiving_id' => $receivingId, ':po_id' => $poId, ':remarks' => $storedReceivingRemarks, ':inspected_by' => $_SESSION['user_id'] ?? null, ':delivered_by_name' => $deliveredByName, ':delivery_receipt_no' => $deliveryReceiptNo]);
    }

    $receiveItemStatement = $pdo->prepare('INSERT INTO purchase_order_receiving_items (receiving_item_id, receiving_id, po_item_id, received_quantity, accepted_quantity, damaged_quantity, missing_quantity) VALUES (:id, :receiving_id, :po_item_id, :received, :accepted, :damaged, :missing)');
    $inventoryStatement = $pdo->prepare("INSERT INTO product_inventory (inventory_id, receiving_id, product_id, batch_number, quantity_stocked, quantity_remaining, expiration_date, expiry_date, status) VALUES (:id, :receiving_id, :product_id, :batch_number, :quantity, :remaining, :expiry, :expiry_copy, :status)");
    $batchStatement = $pdo->prepare("INSERT INTO inventory_batches (batch_id, legacy_inventory_id, po_id, po_item_id, product_id, supplier_id, received_date, expiry_date, received_qty, storage_qty, shelf_qty, damaged_qty, returned_qty, unit_cost, batch_status) VALUES (:batch_id, :inventory_id, :po_id, :po_item_id, :product_id, :supplier_id, CURRENT_TIMESTAMP, :expiry, :received, :storage, 0, :damaged, :returned, :unit_cost, :status)");
    $claimStatement = $pdo->prepare('INSERT INTO supplier_claims (claim_id, po_item_id, damaged_quantity, damaged_unit_conversion_id, action_quantity, action_unit_conversion_id, affected_quantity, unit_conversion_id, damage_reason, disposition, resolution_type, requested_resolution_type, claim_status, reported_by, remarks) VALUES (:id, :po_item_id, :damaged_quantity, :damaged_conversion_id, :action_quantity, :action_conversion_id, :quantity, :conversion_id, :reason, :disposition, :resolution, :requested_resolution, :status, :reported_by, :remarks)');
    $damageLineStatement = $pdo->prepare('INSERT INTO supplier_claim_damage_lines (damage_line_id, claim_id, receiving_item_id, sequence_no, affected_unit_conversion_id, affected_quantity, damaged_quantity, damaged_unit_conversion_id, inventory_batch_id) VALUES (:id, :claim_id, :receiving_item_id, :sequence_no, :affected_conversion_id, :affected_quantity, :damaged_quantity, :damaged_conversion_id, :inventory_batch_id)');
    $creditStatement = $pdo->prepare("INSERT INTO supplier_credits (credit_id, claim_id, credit_amount, credit_status) VALUES (:credit_id, :claim_id, :amount, :status)");
    $creditApplicationStatement = $pdo->prepare('INSERT INTO supplier_credit_applications (application_id, credit_id, po_id, amount_applied, applied_by) VALUES (:id, :credit_id, :po_id, :amount, :applied_by)');
    $refundStatement = $pdo->prepare("INSERT INTO supplier_refunds (refund_id,claim_id,amount_due,refund_status) VALUES (:id,:claim_id,:amount,'Due')");
    $inventoryAuditStatement = $pdo->prepare("INSERT INTO inventory_receiving_transactions (transaction_id, transaction_request_key, transaction_type, receiving_id, receiving_item_id, claim_id, po_id, po_item_id, inventory_batch_id, product_id, supplier_id, quantity, created_by) VALUES (:id, :request_key, 'Original Receiving', :receiving_id, :receiving_item_id, NULL, :po_id, :po_item_id, :batch_id, :product_id, :supplier_id, :quantity, :created_by)");
    $activityRows = [];
    $acceptedPricingRows = [];

    foreach ($validatedItems as $validated) {
        $receivingItemId = newUuid($pdo);
        $inventoryBatchIds = [];
        $receiveItemStatement->execute([
            ':id' => $receivingItemId, ':receiving_id' => $receivingId, ':po_item_id' => $validated['poItemId'],
            ':received' => $validated['delivered'], ':accepted' => $validated['accepted'], ':damaged' => $validated['damaged'], ':missing' => $validated['missing']
        ]);

        foreach ($validated['validatedBatches'] as $batchIndex => $batch) {
            $storageQuantity = $batch['quantity'];
            $inventoryId = newUuid($pdo);
            $inventoryStatement->execute([
                ':id' => $inventoryId, ':receiving_id' => $receivingId, ':product_id' => cleanId($validated['po_item']['product_id']),
                ':batch_number' => $batch['batch_number'], ':quantity' => $storageQuantity, ':remaining' => $storageQuantity,
                ':expiry' => $batch['expiry_date'], ':expiry_copy' => $batch['expiry_date'], ':status' => $storageQuantity > 0 ? 'Available' : 'Out of Stock'
            ]);
            $pricingBatchId = newUuid($pdo);
            $inventoryBatchIds[$batchIndex] = $pricingBatchId;
            $batchStatement->execute([
                ':batch_id' => $pricingBatchId, ':inventory_id' => $inventoryId,
                ':po_id' => $batchIndex === 0 ? $poId : null, ':po_item_id' => $validated['poItemId'],
                ':product_id' => cleanId($validated['po_item']['product_id']), ':supplier_id' => cleanId($order['supplier_id']),
                ':expiry' => $batch['expiry_date'], ':received' => $batch['quantity'], ':storage' => $storageQuantity,
                ':damaged' => 0,
                ':returned' => 0,
                ':unit_cost' => $validated['unitPrice'], ':status' => 'active'
            ]);
            if ($storageQuantity > 0) {
                $inventoryAuditStatement->execute([
                    ':id' => newUuid($pdo), ':request_key' => $receivingId . ':' . $pricingBatchId,
                    ':receiving_id' => $receivingId, ':receiving_item_id' => $receivingItemId,
                    ':po_id' => $poId, ':po_item_id' => $validated['poItemId'], ':batch_id' => $pricingBatchId,
                    ':product_id' => cleanId($validated['po_item']['product_id']), ':supplier_id' => cleanId($order['supplier_id']),
                    ':quantity' => $storageQuantity, ':created_by' => $_SESSION['user_id'] ?? null
                ]);
                $productId = cleanId($validated['po_item']['product_id']);
                $activityRows[] = ['inventory_id' => $inventoryId, 'quantity' => $storageQuantity, 'product_name' => $validated['po_item']['product_name']];
                if ($validated['unitPrice'] > 0) {
                    $acceptedPricingRows[$productId] = [
                        'batch_id' => $pricingBatchId,
                        'po_id' => $poId,
                        'po_item_id' => $validated['poItemId'],
                        'supplier_id' => cleanId($order['supplier_id']),
                        'unit_cost' => $validated['unitPrice'],
                        'received_date' => date('Y-m-d H:i:s'),
                        'inventory_unit' => $validated['po_item']['inventory_unit'],
                    ];
                }
            }
        }

        if ($validated['affected'] > 0) {
            $claimId = newUuid($pdo);
            $resolutionType = supplierClaimResolutionFromLegacy($validated['resolution']);
            $claimStatement->execute([
                ':id' => $claimId, ':po_item_id' => $validated['poItemId'], ':quantity' => $validated['storedClaimQuantity'],
                ':damaged_quantity' => $validated['damagedQuantity'], ':damaged_conversion_id' => $validated['damagedUnitConversionId'],
                ':action_quantity' => $validated['actionQuantity'], ':action_conversion_id' => $validated['actionUnitConversionId'],
                ':conversion_id' => $validated['claimUnitConversionId'], ':reason' => $validated['claimIssueType'],
                ':disposition' => supplierClaimDispositionFromLegacy($validated['disposition']), ':resolution' => $resolutionType, ':requested_resolution' => $resolutionType,
                ':status' => supplierClaimStatus($resolutionType), ':reported_by' => $_SESSION['user_id'] ?? null,
                ':remarks' => trim($validated['itemRemarks']) ?: null
            ]);
            foreach ($validated['validatedDamageLines'] as $damageLine) {
                $damageLineStatement->execute([
                    ':id' => newUuid($pdo), ':claim_id' => $claimId,
                    ':receiving_item_id' => $receivingItemId,
                    ':sequence_no' => $damageLine['sequence_no'],
                    ':affected_conversion_id' => $damageLine['affected_unit_conversion_id'],
                    ':affected_quantity' => $damageLine['affected_quantity'],
                    ':damaged_quantity' => $damageLine['damaged_quantity'],
                    ':damaged_conversion_id' => $damageLine['damaged_unit_conversion_id'],
                    ':inventory_batch_id' => $damageLine['batch_index'] === null ? null : ($inventoryBatchIds[$damageLine['batch_index']] ?? null),
                ]);
            }
            if (in_array($validated['resolution'], ['supplier_credit', 'next_po_credit'], true)) {
                $creditId = newUuid($pdo);
                $isCurrentDiscount = $validated['resolution'] === 'supplier_credit';
                $creditStatement->execute([
                    ':credit_id' => $creditId, ':claim_id' => $claimId, ':amount' => $validated['confirmedAdjustment'],
                    ':status' => $isCurrentDiscount ? 'Applied' : 'Available'
                ]);
                if ($isCurrentDiscount) {
                    $creditApplicationStatement->execute([
                        ':id' => newUuid($pdo), ':credit_id' => $creditId, ':po_id' => $poId,
                        ':amount' => $validated['confirmedAdjustment'], ':applied_by' => $_SESSION['user_id'] ?? null
                    ]);
                    $pdo->prepare("UPDATE supplier_claims SET claim_status = 'Credit Applied', resolved_at = CURRENT_TIMESTAMP WHERE claim_id = :claim_id")->execute([':claim_id' => $claimId]);
                }
            }
            if ($validated['resolution'] === 'refund') {
                $refundStatement->execute([':id'=>newUuid($pdo),':claim_id'=>$claimId,':amount'=>$validated['confirmedAdjustment']]);
            }
        }
    }

        $newStatus = 'Delivered';
    $updateOrder = $pdo->prepare('UPDATE purchase_orders SET status = :status WHERE po_id = :po_id');
    $updateOrder->execute([':status' => $newStatus, ':po_id' => $poId]);
    $pricingResults = [];
    foreach ($acceptedPricingRows as $productId => $costBasis) {
        $latestBasis = latestAcceptedCostBasis($pdo, $productId) ?? $costBasis;
        $pricingResults[$productId] = applyAcceptedDeliveryPricing($pdo, $productId, $latestBasis);
    }
    synchronizePurchaseOrderPaymentStatus($pdo, $poId, purchaseOrderEffectivePayable($pdo, $poId));
    $pdo->commit();

    recordActivityLog($pdo, 'Purchase Order', $newStatus, 'PO ' . $order['po_number'] . ' is ' . $newStatus, $poId);
    foreach ($activityRows as $activity) recordActivityLog($pdo, 'Inventory', 'Received', $activity['quantity'] . ' received into storage: ' . $activity['product_name'], $activity['inventory_id']);

    receiveResponse(true, 'Purchase order received successfully.', '', [
        'po_status' => $newStatus,
        'pricing_results' => $pricingResults
    ]);
} catch (InvalidArgumentException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    receiveResponse(false, $e->getMessage(), $e->getMessage(), [], 400);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    receiveResponse(false, 'Unable to receive purchase order.', $e->getMessage(), [], 500);
}
?>
