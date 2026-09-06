<?php
$allowedRoles = ['super_admin', 'admin', 'manager', 'Admin', 'ro-super-admin', 'ro-admin', 'ro-manager'];
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once __DIR__ . '/purchase_order_receiving_helpers.php';
require_once __DIR__ . '/purchase_order_receiving_revision_helpers.php';

const GRN_RECEIVING_META_PREFIX = "[RECEIVING_META_V1]\n";

function grnEditResponse(bool $success, string $message, array $extra = [], int $code = 200): void
{
    http_response_code($code);
    echo json_encode(array_merge(['status' => $success ? 'success' : 'error', 'success' => $success, 'message' => $message], $extra), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit();
}

function grnEditWholeNumber($value, string $label): int
{
    if (!is_numeric($value) || floor((float) $value) !== (float) $value) throw new InvalidArgumentException("{$label} must be a whole number.");
    $number = (int) $value;
    if ($number < 0) throw new InvalidArgumentException("{$label} cannot be negative.");
    return $number;
}

function grnEditDate($value, bool $required): ?string
{
    $date = trim((string) $value);
    if ($date === '') {
        if ($required) throw new InvalidArgumentException('Expiry date is required for medicine batches.');
        return null;
    }
    $parsed = DateTime::createFromFormat('Y-m-d', $date);
    if (!$parsed || $parsed->format('Y-m-d') !== $date) throw new InvalidArgumentException('Enter a valid batch expiry date.');
    return $date;
}

function grnEditDisposition(string $value): ?string
{
    return supplierClaimDispositionFromLegacy(strtolower(trim($value)));
}

function grnEditResolution(string $value): ?string
{
    return supplierClaimResolutionFromLegacy(strtolower(trim($value)));
}

function grnEditAdjustBatch(PDO $pdo, array $batch, int $targetQuantity, ?string $expiryDate): void
{
    $batchId = cleanId($batch['batch_id']);
    $oldQuantity = (int) $batch['received_qty'];
    $delta = $targetQuantity - $oldQuantity;
    $storage = (int) $batch['storage_qty'];
    $inventoryId = cleanId($batch['legacy_inventory_id'] ?? null);

    $shelfStatement = $pdo->prepare(
        'SELECT selling_stock_id, quantity_stocked, quantity_remaining
         FROM product_selling_stock
         WHERE source_batch_id = :batch_id
         ORDER BY created_at DESC, selling_stock_id DESC
         FOR UPDATE'
    );
    $shelfStatement->execute([':batch_id' => $batchId]);
    $shelfRows = $shelfStatement->fetchAll(PDO::FETCH_ASSOC);
    $shelfAvailable = array_sum(array_map(static fn(array $row): int => (int) $row['quantity_remaining'], $shelfRows));

    if ($delta < 0) {
        $remove = abs($delta);
        if ($remove > $storage + $shelfAvailable) {
            throw new InvalidArgumentException('The corrected batch quantity is below stock that has already been sold or otherwise consumed. Restore or reconcile that stock before editing this GRN.');
        }
        $fromStorage = min($remove, $storage);
        $remaining = $remove - $fromStorage;
        if ($fromStorage > 0) {
            $storage -= $fromStorage;
            if ($inventoryId !== '') {
                $statement = $pdo->prepare('UPDATE product_inventory SET quantity_remaining = quantity_remaining - :quantity WHERE inventory_id = :inventory_id AND quantity_remaining >= :guard');
                $statement->execute([':quantity' => $fromStorage, ':inventory_id' => $inventoryId, ':guard' => $fromStorage]);
                if ($statement->rowCount() !== 1) throw new RuntimeException('Storage inventory changed while the GRN was being corrected.');
            }
        }
        foreach ($shelfRows as $shelf) {
            if ($remaining <= 0) break;
            $take = min($remaining, (int) $shelf['quantity_remaining']);
            if ($take <= 0) continue;
            $statement = $pdo->prepare('UPDATE product_selling_stock SET quantity_stocked = quantity_stocked - :quantity, quantity_remaining = quantity_remaining - :quantity2 WHERE selling_stock_id = :selling_stock_id AND quantity_remaining >= :guard AND quantity_stocked >= :guard2');
            $statement->execute([':quantity' => $take, ':quantity2' => $take, ':selling_stock_id' => $shelf['selling_stock_id'], ':guard' => $take, ':guard2' => $take]);
            if ($statement->rowCount() !== 1) throw new RuntimeException('Shelf inventory changed while the GRN was being corrected.');
            $remaining -= $take;
        }
    } elseif ($delta > 0) {
        $storage += $delta;
        if ($inventoryId !== '') {
            $pdo->prepare('UPDATE product_inventory SET quantity_stocked = quantity_stocked + :quantity, quantity_remaining = quantity_remaining + :quantity2 WHERE inventory_id = :inventory_id')
                ->execute([':quantity' => $delta, ':quantity2' => $delta, ':inventory_id' => $inventoryId]);
        }
    }

    if ($inventoryId !== '') {
        if ($delta < 0) {
            $pdo->prepare('UPDATE product_inventory SET quantity_stocked = quantity_stocked - :quantity WHERE inventory_id = :inventory_id AND quantity_stocked >= :guard')
                ->execute([':quantity' => abs($delta), ':inventory_id' => $inventoryId, ':guard' => abs($delta)]);
        }
        $pdo->prepare("UPDATE product_inventory SET expiration_date = :expiry, expiry_date = :expiry_copy, status = CASE WHEN quantity_remaining <= 0 THEN 'Out of Stock' WHEN :expiry_status_null IS NOT NULL AND :expiry_status_date < CURDATE() THEN 'Expired' ELSE 'Available' END WHERE inventory_id = :inventory_id")
            ->execute([':expiry' => $expiryDate, ':expiry_copy' => $expiryDate, ':expiry_status_null' => $expiryDate, ':expiry_status_date' => $expiryDate, ':inventory_id' => $inventoryId]);
    }
    foreach ($shelfRows as $shelf) {
        $pdo->prepare('UPDATE product_selling_stock SET expiration_date = :expiry WHERE selling_stock_id = :selling_stock_id')
            ->execute([':expiry' => $expiryDate, ':selling_stock_id' => $shelf['selling_stock_id']]);
    }
    $pdo->prepare("UPDATE inventory_batches SET received_qty = :quantity, storage_qty = :storage, expiry_date = :expiry, batch_status = CASE WHEN :expiry_status_null IS NOT NULL AND :expiry_status_date < CURDATE() THEN 'expired' WHEN :quantity_status <= 0 THEN 'depleted' ELSE 'active' END WHERE batch_id = :batch_id")
        ->execute([':quantity' => $targetQuantity, ':storage' => $storage, ':expiry' => $expiryDate, ':expiry_status_null' => $expiryDate, ':expiry_status_date' => $expiryDate, ':quantity_status' => $targetQuantity, ':batch_id' => $batchId]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') grnEditResponse(false, 'Only POST requests are allowed.', [], 405);
$payload = json_decode(file_get_contents('php://input'), true);
if (!is_array($payload)) grnEditResponse(false, 'Invalid JSON payload.', [], 400);

try {
    ensurePurchaseOrderReceivingRevisionSchema($pdo);
    $receivingId = cleanId($payload['receiving_id'] ?? null);
    $reason = trim((string) ($payload['edit_reason'] ?? ''));
    $remarks = cleanTransactionalText($payload['receiving_remarks'] ?? '') ?? '';
    $items = is_array($payload['items'] ?? null) ? $payload['items'] : [];
    $acknowledgeFinancialImpact = !empty($payload['acknowledge_financial_impact']);
    if ($receivingId === '') throw new InvalidArgumentException('Receiving record is required.');
    if ($reason === '') throw new InvalidArgumentException('Reason for Edit is required.');
    if (mb_strlen($reason) > 500) throw new InvalidArgumentException('Reason for Edit must not exceed 500 characters.');
    if (!$items) throw new InvalidArgumentException('At least one receiving item is required.');

    $pdo->beginTransaction();
    $headerStatement = $pdo->prepare("SELECT por.receiving_id, por.po_id, por.received_date, po.po_number, po.status, po.final_payment FROM purchase_order_receiving por INNER JOIN purchase_orders po ON po.po_id = por.po_id WHERE por.receiving_id = :receiving_id AND por.inspection_status = 'Confirmed' LIMIT 1 FOR UPDATE");
    $headerStatement->execute([':receiving_id' => $receivingId]);
    $header = $headerStatement->fetch(PDO::FETCH_ASSOC);
    if (!$header) throw new InvalidArgumentException('Confirmed receiving record not found.');
    $beforeDetails = buildPurchaseOrderReceivingDetails($pdo, cleanId($header['po_id']));
    if (!$beforeDetails) throw new InvalidArgumentException('Receiving details could not be loaded.');
    $beforeSnapshot = receivingRevisionSnapshot($beforeDetails);

    $poItemsStatement = $pdo->prepare(
        "SELECT poi.po_item_id, poi.product_id, COALESCE(NULLIF(poi.inventory_qty_ordered,0),poi.quantity) ordered_quantity,
                COALESCE(poi.units_per_purchase_unit_snapshot,1) units_per_purchase_unit,
                COALESCE(NULLIF(poi.purchase_unit_snapshot,''),'Package') purchase_unit,
                COALESCE(poi.unit_price_snapshot,0) unit_price,
                COALESCE(NULLIF(poi.product_name_snapshot,''),p.product_name) product_name,
                CASE WHEN md.product_id IS NOT NULL OR LOWER(COALESCE(pc.category_name,'')) LIKE '%medicine%' THEN 1 ELSE 0 END requires_expiry
         FROM purchase_order_items poi
         INNER JOIN product p ON p.product_id=poi.product_id
         LEFT JOIN product_categories pc ON pc.category_id=p.category_id
         LEFT JOIN medicine_details md ON md.product_id=p.product_id
         WHERE poi.po_id=:po_id FOR UPDATE"
    );
    $poItemsStatement->execute([':po_id' => $header['po_id']]);
    $poItems = [];
    foreach ($poItemsStatement->fetchAll(PDO::FETCH_ASSOC) as $row) $poItems[cleanId($row['po_item_id'])] = $row;
    if (count($items) !== count($poItems)) throw new InvalidArgumentException('Every original PO item must remain in the corrected GRN.');

    $receivingItemUpdate = $pdo->prepare('UPDATE purchase_order_receiving_items SET received_quantity=:quantity, accepted_quantity=:accepted, damaged_quantity=:damaged, missing_quantity=:missing WHERE receiving_id=:receiving_id AND po_item_id=:po_item_id');
    $receivingItemSelect = $pdo->prepare('SELECT receiving_item_id FROM purchase_order_receiving_items WHERE receiving_id=:receiving_id AND po_item_id=:po_item_id LIMIT 1');
    $claimSelect = $pdo->prepare("SELECT * FROM supplier_claims WHERE po_item_id=:po_item_id AND COALESCE(resolution_type,'')<>'replacement_damage_event' ORDER BY created_at,claim_id LIMIT 1 FOR UPDATE");
    $claimUpdate = $pdo->prepare('UPDATE supplier_claims SET damaged_quantity=:damaged_quantity,damaged_unit_conversion_id=:damaged_conversion,action_quantity=:action_quantity,action_unit_conversion_id=:action_conversion,affected_quantity=:affected_quantity,unit_conversion_id=:conversion_id,damage_reason=:reason,disposition=:disposition,resolution_type=:resolution,requested_resolution_type=COALESCE(requested_resolution_type,:requested_resolution),claim_status=:status,remarks=:remarks,resolved_at=:resolved_at WHERE claim_id=:claim_id');
    $claimInsert = $pdo->prepare('INSERT INTO supplier_claims(claim_id,po_item_id,damaged_quantity,damaged_unit_conversion_id,action_quantity,action_unit_conversion_id,affected_quantity,unit_conversion_id,damage_reason,disposition,resolution_type,requested_resolution_type,claim_status,reported_by,remarks) VALUES(:claim_id,:po_item_id,:damaged_quantity,:damaged_conversion,:action_quantity,:action_conversion,:affected_quantity,:conversion_id,:reason,:disposition,:resolution,:requested_resolution,:status,:reported_by,:remarks)');
    $damageDelete = $pdo->prepare('DELETE FROM supplier_claim_damage_lines WHERE claim_id=:claim_id');
    $damageInsert = $pdo->prepare('INSERT INTO supplier_claim_damage_lines(damage_line_id,claim_id,receiving_item_id,sequence_no,affected_unit_conversion_id,affected_quantity,damaged_quantity,damaged_unit_conversion_id,inventory_batch_id) VALUES(:id,:claim_id,:receiving_item_id,:sequence,:affected_conversion,1,:quantity,:damaged_conversion,:inventory_batch_id)');
    $newPayable = 0.0;
    $hasIssues = false;
    $seen = [];

    foreach ($items as $item) {
        $poItemId = cleanId($item['po_item_id'] ?? null);
        if (!isset($poItems[$poItemId]) || isset($seen[$poItemId])) throw new InvalidArgumentException('Corrected GRN contains an invalid or duplicate PO item.');
        $seen[$poItemId] = true;
        $poItem = $poItems[$poItemId];
        $ordered = (int) $poItem['ordered_quantity'];
        $received = grnEditWholeNumber($item['received_quantity'] ?? 0, 'Received quantity');
        if ($received > $ordered) throw new InvalidArgumentException('Received quantity cannot exceed the original ordered quantity for ' . $poItem['product_name'] . '.');
        $receivedPackageCount = intdiv($received, max(1, (int) $poItem['units_per_purchase_unit']));
        $purchaseConversion = supplierClaimPurchaseConversion($pdo, $poItemId);
        $packageCapacity = supplierClaimBaseQuantity($pdo, $poItemId, $purchaseConversion);

        $damageLines = is_array($item['damage_lines'] ?? null) ? $item['damage_lines'] : [];
        $validatedDamageLines = [];
        $damagedBase = 0;
        $seenPackageSequences = [];
        foreach ($damageLines as $line) {
            $packageSequence = grnEditWholeNumber($line['package_sequence'] ?? ($line['sequence_no'] ?? 0), 'Affected package');
            if ($packageSequence < 1 || $packageSequence > $receivedPackageCount || isset($seenPackageSequences[$packageSequence])) throw new InvalidArgumentException('Select each valid physical package only once.');
            $seenPackageSequences[$packageSequence] = true;
            $damagedConversion = cleanId($line['damaged_unit_conversion_id'] ?? null);
            $quantity = grnEditWholeNumber($line['damaged_quantity'] ?? 0, 'Damage quantity');
            if ($damagedConversion === '' || $quantity <= 0) throw new InvalidArgumentException('Every affected package requires a configured unit and positive damaged quantity.');
            $damagedUnitBase = supplierClaimBaseQuantity($pdo, $poItemId, $damagedConversion);
            if ($quantity * $damagedUnitBase > $packageCapacity) throw new InvalidArgumentException('An affected package exceeds its configured contents capacity.');
            $damagedBase += $quantity * $damagedUnitBase;
            $validatedDamageLines[] = ['sequence' => $packageSequence, 'affected_conversion' => $purchaseConversion, 'damaged_conversion' => $damagedConversion, 'quantity' => $quantity, 'inventory_batch_id' => cleanId($line['inventory_batch_id'] ?? null)];
        }
        $damagedQuantity = grnEditWholeNumber($item['damaged_quantity'] ?? $damagedBase, 'Damaged quantity');
        $damagedConversion = cleanId($item['damaged_unit_conversion_id'] ?? null) ?: supplierClaimDefaultConversion($pdo, $poItemId);
        if (!$damageLines) $damagedBase = $damagedQuantity * supplierClaimBaseQuantity($pdo, $poItemId, $damagedConversion);
        if ($damagedBase > $received) throw new InvalidArgumentException('Damaged quantity cannot exceed received quantity for ' . $poItem['product_name'] . '.');

        $actionQuantity = grnEditWholeNumber($item['action_quantity'] ?? 0, 'Affected goods action quantity');
        $actionConversion = cleanId($item['action_unit_conversion_id'] ?? null) ?: supplierClaimDefaultConversion($pdo, $poItemId);
        $actionBase = $actionQuantity * supplierClaimBaseQuantity($pdo, $poItemId, $actionConversion);
        if ($validatedDamageLines) {
            $actionConversion = supplierClaimDefaultConversion($pdo, $poItemId);
            $actionQuantity = $damagedBase;
            $actionBase = $damagedBase;
        }
        if ($actionBase > $received || $actionBase < $damagedBase) throw new InvalidArgumentException('Affected goods action quantity must cover damaged goods without exceeding received quantity.');
        $accepted = $received - $actionBase;
        $missing = $ordered - $received;
        $affected = max($damagedBase, $actionBase) + $missing;
        $dispositionLegacy = strtolower(trim((string) ($item['disposition'] ?? 'not_applicable')));
        $resolutionLegacy = strtolower(trim((string) ($item['resolution'] ?? 'none')));
        $confirmedAdjustment = round((float) ($item['confirmed_adjustment'] ?? 0), 2);
        $hasItemIssue = $affected > 0 || !empty($validatedDamageLines);
        $disposition = $hasItemIssue ? grnEditDisposition($dispositionLegacy) : null;
        $resolution = $hasItemIssue ? grnEditResolution($resolutionLegacy) : null;
        $issueType = trim((string) ($item['issue_type'] ?? ''));
        $itemRemarks = cleanTransactionalText($item['remarks'] ?? '') ?? '';
        if ($hasItemIssue && ($disposition === null || $resolution === null || $issueType === '')) throw new InvalidArgumentException('Complete the issue, action, and supplier resolution for ' . $poItem['product_name'] . '.');
        if (in_array($resolution, ['Current PO Credit', 'Next PO Credit'], true) && $confirmedAdjustment <= 0) throw new InvalidArgumentException('Enter the monetary amount confirmed by the supplier for ' . $poItem['product_name'] . '.');
        if ($affected === 0 && ($actionQuantity > 0 || $damagedBase > 0)) throw new InvalidArgumentException('Issue quantities must be zero when there is no affected stock.');
        $hasIssues = $hasIssues || $hasItemIssue;

        $batchInputs = is_array($item['batches'] ?? null) ? $item['batches'] : [];
        $batchStatement = $pdo->prepare("SELECT ib.* FROM inventory_batches ib INNER JOIN product_inventory pi ON pi.inventory_id=ib.legacy_inventory_id WHERE ib.po_item_id=:po_item_id AND pi.receiving_id=:receiving_id AND ib.created_at<=DATE_ADD(:received_date,INTERVAL 10 MINUTE) ORDER BY ib.created_at,ib.batch_id FOR UPDATE");
        $batchStatement->execute([':po_item_id' => $poItemId, ':receiving_id' => $receivingId, ':received_date' => $header['received_date']]);
        $storedBatches = [];
        foreach ($batchStatement->fetchAll(PDO::FETCH_ASSOC) as $batch) $storedBatches[cleanId($batch['batch_id'])] = $batch;
        if (count($batchInputs) !== count($storedBatches)) throw new InvalidArgumentException('The original receiving batches must remain attached to the corrected GRN.');
        $allocated = 0;
        foreach ($batchInputs as $batchInput) {
            $batchId = cleanId($batchInput['batch_id'] ?? null);
            if (!isset($storedBatches[$batchId])) throw new InvalidArgumentException('A corrected batch does not belong to this receiving record.');
            $quantity = grnEditWholeNumber($batchInput['quantity'] ?? 0, 'Batch quantity');
            if ($quantity <= 0) throw new InvalidArgumentException('Batch quantity must be greater than zero.');
            $expiry = grnEditDate($batchInput['expiry_date'] ?? '', (int) $poItem['requires_expiry'] === 1);
            grnEditAdjustBatch($pdo, $storedBatches[$batchId], $quantity, $expiry);
            $allocated += $quantity;
        }
        foreach ($validatedDamageLines as &$damageLine) {
            if ($damageLine['inventory_batch_id'] !== '' && !isset($storedBatches[$damageLine['inventory_batch_id']])) throw new InvalidArgumentException('An affected goods row references a batch outside this receiving record.');
            if ($damageLine['inventory_batch_id'] === '' && count($storedBatches) === 1) $damageLine['inventory_batch_id'] = array_key_first($storedBatches);
        }
        unset($damageLine);
        if ($allocated !== $accepted) throw new InvalidArgumentException("Batch quantities for {$poItem['product_name']} must equal the corrected accepted quantity of {$accepted}.");
        $receivingItemUpdate->execute([':quantity' => $received, ':accepted' => $accepted, ':damaged' => $damagedBase, ':missing' => $missing, ':receiving_id' => $receivingId, ':po_item_id' => $poItemId]);
        $receivingItemSelect->execute([':receiving_id' => $receivingId, ':po_item_id' => $poItemId]);
        $receivingItemId = cleanId($receivingItemSelect->fetchColumn());
        if ($receivingItemId === '') throw new RuntimeException('The receiving item could not be resolved for its affected-package details.');

        $claimSelect->execute([':po_item_id' => $poItemId]);
        $claim = $claimSelect->fetch(PDO::FETCH_ASSOC) ?: null;
        if ($claim || $hasItemIssue) {
            $claimId = $claim ? cleanId($claim['claim_id']) : newUuid($pdo);
            $replacementReceivedStatement = $pdo->prepare("SELECT COALESCE(SUM(ri.accepted_quantity),0) FROM purchase_order_receiving r INNER JOIN purchase_order_receiving_items ri ON ri.receiving_id=r.receiving_id WHERE r.claim_id=:claim_id AND r.receiving_type='Replacement'");
            $replacementReceivedStatement->execute([':claim_id' => $claimId]);
            $replacementReceived = (int) $replacementReceivedStatement->fetchColumn();
            $replacementExpected = $resolution === 'Replacement' ? $affected : 0;
            if ($replacementReceived > $replacementExpected) throw new InvalidArgumentException('Replacement already received exceeds the corrected replacement claim quantity. Correct the replacement record first.');
            $status = !$hasItemIssue ? 'Corrected / Resolved' : ($replacementExpected > 0 && $replacementReceived >= $replacementExpected ? 'Replacement Received / Resolved' : supplierClaimStatus($resolution));
            $defaultConversion = $actionBase > 0 ? $actionConversion : $damagedConversion;
            $storedAffectedQuantity = $actionQuantity ?: $damagedQuantity;
            if ($missing > 0) {
                $defaultConversion = supplierClaimDefaultConversion($pdo, $poItemId);
                $storedAffectedQuantity = $actionBase + $missing;
            }
            $claimParams = [
                ':damaged_quantity' => $hasItemIssue ? $damagedQuantity : 0, ':damaged_conversion' => $damagedConversion,
                ':action_quantity' => $hasItemIssue ? $actionQuantity : 0, ':action_conversion' => $actionConversion,
                ':affected_quantity' => $affected > 0 ? $storedAffectedQuantity : 0,
                ':conversion_id' => $defaultConversion, ':reason' => $hasItemIssue ? $issueType : ($claim['damage_reason'] ?? 'Corrected GRN'),
                ':disposition' => $disposition, ':resolution' => $resolution, ':requested_resolution' => $resolution, ':status' => $status,
                ':remarks' => $itemRemarks ?: null, ':resolved_at' => str_contains($status, 'Resolved') ? date('Y-m-d H:i:s') : null,
            ];
            if ($claim) {
                $claimUpdate->execute($claimParams + [':claim_id' => $claimId]);
            } else {
                unset($claimParams[':resolved_at']);
                $claimInsert->execute($claimParams + [':claim_id' => $claimId, ':po_item_id' => $poItemId, ':reported_by' => $_SESSION['user_id'] ?? null]);
            }
            $damageDelete->execute([':claim_id' => $claimId]);
            foreach ($validatedDamageLines as $line) $damageInsert->execute([':id' => newUuid($pdo), ':claim_id' => $claimId, ':receiving_item_id' => $receivingItemId, ':sequence' => $line['sequence'], ':affected_conversion' => $line['affected_conversion'], ':quantity' => $line['quantity'], ':damaged_conversion' => $line['damaged_conversion'], ':inventory_batch_id' => $line['inventory_batch_id'] ?: null]);

            $creditStatement = $pdo->prepare('SELECT cr.credit_id,cr.credit_amount,cr.credit_status,COALESCE(SUM(app.amount_applied),0) amount_applied FROM supplier_credits cr LEFT JOIN supplier_credit_applications app ON app.credit_id=cr.credit_id WHERE cr.claim_id=:claim_id GROUP BY cr.credit_id,cr.credit_amount,cr.credit_status LIMIT 1 FOR UPDATE');
            $creditStatement->execute([':claim_id' => $claimId]);
            $credit = $creditStatement->fetch(PDO::FETCH_ASSOC);
            if ($credit) {
                if (!in_array($resolution, ['Supplier Credit', 'Current PO Credit', 'Next PO Credit'], true)) throw new InvalidArgumentException('This claim already has a supplier credit. Resolve that credit before changing the GRN supplier resolution.');
                if ((float) $credit['amount_applied'] > $confirmedAdjustment) throw new InvalidArgumentException('The supplier-confirmed amount is lower than credit already applied. Reverse or reconcile the applied credit first.');
                $pdo->prepare('UPDATE supplier_credits SET credit_amount=:amount WHERE credit_id=:credit_id')->execute([':amount' => $confirmedAdjustment, ':credit_id' => $credit['credit_id']]);
                if ($resolution === 'Current PO Credit') {
                    $sourceApplication = $pdo->prepare('SELECT application_id FROM supplier_credit_applications WHERE credit_id=:credit_id AND po_id=:po_id LIMIT 1 FOR UPDATE');
                    $sourceApplication->execute([':credit_id' => $credit['credit_id'], ':po_id' => $header['po_id']]);
                    $sourceApplicationId = $sourceApplication->fetchColumn();
                    if ($sourceApplicationId) {
                        $pdo->prepare('UPDATE supplier_credit_applications SET amount_applied=:amount,applied_at=CURRENT_TIMESTAMP,applied_by=:applied_by WHERE application_id=:id')->execute([':amount' => $confirmedAdjustment, ':applied_by' => $_SESSION['user_id'] ?? null, ':id' => $sourceApplicationId]);
                    } else {
                        $pdo->prepare('INSERT INTO supplier_credit_applications(application_id,credit_id,po_id,amount_applied,applied_by) VALUES(:id,:credit_id,:po_id,:amount,:applied_by)')->execute([':id' => newUuid($pdo), ':credit_id' => $credit['credit_id'], ':po_id' => $header['po_id'], ':amount' => $confirmedAdjustment, ':applied_by' => $_SESSION['user_id'] ?? null]);
                    }
                    $pdo->prepare("UPDATE supplier_credits SET credit_status='Applied' WHERE credit_id=:credit_id")->execute([':credit_id' => $credit['credit_id']]);
                }
            } elseif (in_array($resolution, ['Current PO Credit', 'Next PO Credit'], true)) {
                $creditId = newUuid($pdo);
                $isCurrentDiscount = $resolution === 'Current PO Credit';
                $pdo->prepare('INSERT INTO supplier_credits(credit_id,claim_id,credit_amount,credit_status) VALUES(:credit_id,:claim_id,:amount,:status)')->execute([':credit_id' => $creditId, ':claim_id' => $claimId, ':amount' => $confirmedAdjustment, ':status' => $isCurrentDiscount ? 'Applied' : 'Available']);
                if ($isCurrentDiscount) {
                    $pdo->prepare('INSERT INTO supplier_credit_applications(application_id,credit_id,po_id,amount_applied,applied_by) VALUES(:id,:credit_id,:po_id,:amount,:applied_by)')->execute([':id' => newUuid($pdo), ':credit_id' => $creditId, ':po_id' => $header['po_id'], ':amount' => $confirmedAdjustment, ':applied_by' => $_SESSION['user_id'] ?? null]);
                }
            }
            if (in_array($resolution, ['Supplier Credit', 'Current PO Credit', 'Next PO Credit'], true)) {
                $creditEvidence = $pdo->prepare('SELECT cr.credit_amount,cr.credit_status,COALESCE(SUM(app.amount_applied),0) amount_applied FROM supplier_credits cr LEFT JOIN supplier_credit_applications app ON app.credit_id=cr.credit_id WHERE cr.claim_id=:claim_id GROUP BY cr.credit_amount,cr.credit_status LIMIT 1');
                $creditEvidence->execute([':claim_id' => $claimId]);
                $evidence = $creditEvidence->fetch(PDO::FETCH_ASSOC) ?: [];
                $creditApplied = (float) ($evidence['credit_amount'] ?? 0) > 0
                    && ((float) ($evidence['amount_applied'] ?? 0) + 0.005 >= (float) $evidence['credit_amount'] || ($evidence['credit_status'] ?? '') === 'Applied');
                $pdo->prepare('UPDATE supplier_claims SET claim_status=:status,resolved_at=:resolved_at WHERE claim_id=:claim_id')->execute([
                    ':status' => $creditApplied ? 'Credit Applied' : 'Awaiting Supplier Credit',
                    ':resolved_at' => $creditApplied ? date('Y-m-d H:i:s') : null,
                    ':claim_id' => $claimId,
                ]);
            }
        }

        $newPayable += $ordered * (float) $poItem['unit_price'];
    }

    $paymentStatement = $pdo->prepare('SELECT COALESCE(SUM(amount),0) FROM purchase_order_payments WHERE po_id=:po_id');
    $paymentStatement->execute([':po_id' => $header['po_id']]);
    $totalPaid = round((float) $paymentStatement->fetchColumn(), 2);
    $oldPayable = purchaseOrderEffectivePayable($pdo, cleanId($header['po_id']), (float) $header['final_payment']);
    $newPayable = round($newPayable, 2);
    if ($totalPaid > 0 && abs($newPayable - $oldPayable) >= 0.01 && !$acknowledgeFinancialImpact) {
        throw new InvalidArgumentException('This correction changes the PO payable while payment history exists. Review the warning and acknowledge the financial impact before saving.');
    }
    $creditApplied = supplierClaimCreditAppliedToPo($pdo, cleanId($header['po_id']));
    if ($totalPaid > max(0, $newPayable - $creditApplied) && !$acknowledgeFinancialImpact) {
        throw new InvalidArgumentException('This correction would make recorded payments exceed the corrected amount due. Acknowledge the financial inconsistency before saving.');
    }

    $storedRemarks = GRN_RECEIVING_META_PREFIX . json_encode(['version' => 1, 'workflow' => 'physical_receiving'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n" . $remarks;
    $pdo->prepare("UPDATE purchase_order_receiving SET remarks=:remarks,inspection_status='Confirmed' WHERE receiving_id=:receiving_id")
        ->execute([':remarks' => $storedRemarks, ':receiving_id' => $receivingId]);
        $newStatus = 'Delivered';
    $pdo->prepare('UPDATE purchase_orders SET status=:status,final_payment=:payable WHERE po_id=:po_id')
        ->execute([':status' => $newStatus, ':payable' => $newPayable, ':po_id' => $header['po_id']]);
    synchronizePurchaseOrderPaymentStatus($pdo, cleanId($header['po_id']), $newPayable);

    $afterDetails = buildPurchaseOrderReceivingDetails($pdo, cleanId($header['po_id']));
    $afterSnapshot = receivingRevisionSnapshot($afterDetails ?: []);
    $revisionId = newUuid($pdo);
    $revisionStatement = $pdo->prepare('INSERT INTO purchase_order_receiving_revisions(revision_id,receiving_id,edited_by,edit_reason,before_data,after_data) VALUES(:revision_id,:receiving_id,:edited_by,:edit_reason,:before_data,:after_data)');
    $revisionStatement->execute([
        ':revision_id' => $revisionId, ':receiving_id' => $receivingId, ':edited_by' => $_SESSION['user_id'] ?? null,
        ':edit_reason' => $reason,
        ':before_data' => json_encode($beforeSnapshot, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR),
        ':after_data' => json_encode($afterSnapshot, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR),
    ]);
    recordActivityLog($pdo, 'Goods Received Note', 'Edited', 'GRN corrected. Reason: ' . $reason . ' Changes stored in revision ' . $revisionId . '.', $receivingId);
    $pdo->commit();
    grnEditResponse(true, 'Goods Received Note updated safely.', ['po_id' => $header['po_id'], 'receiving_id' => $receivingId, 'revision_id' => $revisionId]);
} catch (InvalidArgumentException $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    grnEditResponse(false, $error->getMessage(), [], 422);
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    grnEditResponse(false, 'Unable to update the Goods Received Note.', ['error' => $error->getMessage()], 500);
}
