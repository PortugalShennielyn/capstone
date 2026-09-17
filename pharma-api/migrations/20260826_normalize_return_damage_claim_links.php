<?php
require_once __DIR__ . '/../config/db_connection.php';
require_once __DIR__ . '/../v1/purchase_orders/purchase_order_helpers.php';

function rdColumnExists(PDO $pdo, string $table, string $column): bool
{
    $statement = $pdo->prepare('SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=:table_name AND COLUMN_NAME=:column_name');
    $statement->execute([':table_name' => $table, ':column_name' => $column]);
    return (int) $statement->fetchColumn() > 0;
}

function rdIndexExists(PDO $pdo, string $table, string $index): bool
{
    $statement = $pdo->prepare('SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=:table_name AND INDEX_NAME=:index_name');
    $statement->execute([':table_name' => $table, ':index_name' => $index]);
    return (int) $statement->fetchColumn() > 0;
}

function rdLegacyResolution(?string $resolutionType, ?string $disposition): string
{
    return supplierClaimLegacyResolution($resolutionType, $disposition);
}

function rdCanonicalLegacyResolution(string $value): string
{
    return match (strtolower(trim($value))) {
        'replacement', 'return_for_replacement' => 'return_for_replacement',
        'current po credit', 'next po credit', 'supplier credit', 'return_for_credit' => 'return_for_credit',
        'reject_without_replacement' => 'reject_without_replacement',
        default => strtolower(trim($value)),
    };
}

try {
    if (!rdColumnExists($pdo, 'supplier_claims', 'requested_resolution_type')) {
        $pdo->exec('ALTER TABLE supplier_claims ADD COLUMN requested_resolution_type VARCHAR(40) NULL AFTER resolution_type');
    }
    if (!rdColumnExists($pdo, 'supplier_claims', 'management_remarks')) {
        $pdo->exec('ALTER TABLE supplier_claims ADD COLUMN management_remarks TEXT NULL AFTER remarks');
    }
    if (!rdColumnExists($pdo, 'purchase_order_receiving_items', 'missing_quantity')) {
        $pdo->exec('ALTER TABLE purchase_order_receiving_items ADD COLUMN missing_quantity INT NOT NULL DEFAULT 0 AFTER damaged_quantity, ADD CONSTRAINT chk_po_receiving_items_missing CHECK (missing_quantity >= 0)');
    }
    if (!rdIndexExists($pdo, 'supplier_claim_damage_lines', 'idx_claim_damage_claim_receiving')) {
        $pdo->exec('ALTER TABLE supplier_claim_damage_lines ADD KEY idx_claim_damage_claim_receiving (claim_id, receiving_item_id)');
    }

    $claimCount = (int) $pdo->query('SELECT COUNT(*) FROM supplier_claims')->fetchColumn();
    $normalizedBefore = (int) $pdo->query('SELECT COUNT(*) FROM supplier_claims sc WHERE EXISTS (SELECT 1 FROM supplier_claim_damage_lines dl WHERE dl.claim_id=sc.claim_id AND dl.receiving_item_id IS NOT NULL)')->fetchColumn();
    $ambiguousBefore = (int) $pdo->query("SELECT COUNT(*) FROM supplier_claims sc WHERE NOT EXISTS (SELECT 1 FROM supplier_claim_damage_lines dl WHERE dl.claim_id=sc.claim_id) AND (SELECT COUNT(*) FROM purchase_order_receiving_items ri INNER JOIN purchase_order_receiving pr ON pr.receiving_id=ri.receiving_id WHERE ri.po_item_id=sc.po_item_id AND pr.receiving_type='Original')<>1")->fetchColumn();

    $pdo->beginTransaction();
    $backfill = $pdo->prepare(
        "INSERT INTO supplier_claim_damage_lines
            (damage_line_id,claim_id,receiving_item_id,sequence_no,affected_unit_conversion_id,affected_quantity,damaged_quantity,damaged_unit_conversion_id,inventory_batch_id,created_at)
         SELECT UUID(),sc.claim_id,MIN(ri.receiving_item_id),1,sc.unit_conversion_id,GREATEST(1,sc.affected_quantity),sc.damaged_quantity,
                COALESCE(sc.damaged_unit_conversion_id,sc.unit_conversion_id),sc.inventory_batch_id,sc.created_at
         FROM supplier_claims sc
         INNER JOIN purchase_order_receiving_items ri ON ri.po_item_id=sc.po_item_id
         INNER JOIN purchase_order_receiving pr ON pr.receiving_id=ri.receiving_id AND pr.receiving_type='Original'
         WHERE NOT EXISTS (SELECT 1 FROM supplier_claim_damage_lines existing WHERE existing.claim_id=sc.claim_id)
         GROUP BY sc.claim_id
         HAVING COUNT(DISTINCT ri.receiving_item_id)=1"
    );
    $backfill->execute();
    $backfilled = $backfill->rowCount();

    $lineRepair = $pdo->prepare(
        'UPDATE supplier_claim_damage_lines dl
         INNER JOIN supplier_claims sc ON sc.claim_id=dl.claim_id
         INNER JOIN (
             SELECT claim_id,SUM(affected_quantity) affected_total,SUM(damaged_quantity) damaged_total,COUNT(*) line_count
             FROM supplier_claim_damage_lines GROUP BY claim_id
         ) totals ON totals.claim_id=sc.claim_id
         SET dl.affected_quantity=dl.damaged_quantity
         WHERE totals.affected_total<>sc.affected_quantity
           AND totals.damaged_total=sc.affected_quantity
           AND dl.affected_unit_conversion_id=dl.damaged_unit_conversion_id
           AND dl.damaged_quantity>0'
    );
    $lineRepair->execute();
    $lineRowsCorrected = $lineRepair->rowCount();

    $claims = $pdo->query(
        "SELECT sc.*,
                affected_conversion.base_quantity AS affected_base,
                action_conversion.base_quantity AS action_base,
                damaged_conversion.base_quantity AS damaged_base,
                (SELECT COUNT(DISTINCT dl.receiving_item_id) FROM supplier_claim_damage_lines dl WHERE dl.claim_id=sc.claim_id AND dl.receiving_item_id IS NOT NULL) linked_item_count,
                (SELECT MAX(ri.received_quantity) FROM supplier_claim_damage_lines dl INNER JOIN purchase_order_receiving_items ri ON ri.receiving_item_id=dl.receiving_item_id INNER JOIN purchase_order_receiving pr ON pr.receiving_id=ri.receiving_id WHERE dl.claim_id=sc.claim_id AND pr.receiving_type='Original') delivered_quantity,
                (SELECT COALESCE(SUM(ri.accepted_quantity),0) FROM purchase_order_receiving pr INNER JOIN purchase_order_receiving_items ri ON ri.receiving_id=pr.receiving_id WHERE pr.claim_id=sc.claim_id AND pr.receiving_type='Replacement') replacement_received_quantity,
                (SELECT cr.credit_id FROM supplier_credits cr WHERE cr.claim_id=sc.claim_id LIMIT 1) credit_id,
                (SELECT cr.credit_amount FROM supplier_credits cr WHERE cr.claim_id=sc.claim_id LIMIT 1) credit_amount,
                (SELECT cr.credit_status FROM supplier_credits cr WHERE cr.claim_id=sc.claim_id LIMIT 1) credit_status,
                (SELECT COALESCE(SUM(app.amount_applied),0) FROM supplier_credits cr LEFT JOIN supplier_credit_applications app ON app.credit_id=cr.credit_id WHERE cr.claim_id=sc.claim_id) credit_applied
         FROM supplier_claims sc
         INNER JOIN supplier_product_unit_conversions affected_conversion ON affected_conversion.conversion_id=sc.unit_conversion_id
         LEFT JOIN supplier_product_unit_conversions action_conversion ON action_conversion.conversion_id=sc.action_unit_conversion_id
         LEFT JOIN supplier_product_unit_conversions damaged_conversion ON damaged_conversion.conversion_id=sc.damaged_unit_conversion_id
         WHERE sc.remarks LIKE '[RETURN_META_V1]%' FOR UPDATE"
    )->fetchAll(PDO::FETCH_ASSOC);

    $cleaned = 0;
    $preservedHumanRemarks = 0;
    $skippedMetadata = 0;
    $placeholderCreditsRemoved = 0;
    $updateClaim = $pdo->prepare('UPDATE supplier_claims SET requested_resolution_type=:requested_resolution,management_remarks=:management_remarks,remarks=:remarks WHERE claim_id=:claim_id');
    $updateMissing = $pdo->prepare("UPDATE purchase_order_receiving_items ri INNER JOIN supplier_claim_damage_lines dl ON dl.receiving_item_id=ri.receiving_item_id INNER JOIN purchase_order_receiving pr ON pr.receiving_id=ri.receiving_id AND pr.receiving_type='Original' SET ri.missing_quantity=:missing WHERE dl.claim_id=:claim_id");

    foreach ($claims as $claim) {
        $parsed = parsePurchaseOrderReturnRemarks($claim['remarks']);
        $metadata = $parsed['metadata'];
        $humanRemarks = trim($parsed['remarks']);
        $expected = ($claim['resolution_type'] ?? '') === 'Replacement'
            ? ((int) ($claim['action_quantity'] ?? 0) * max(1, (int) ($claim['action_base'] ?? 0)) ?: (int) $claim['affected_quantity'] * max(1, (int) $claim['affected_base']))
            : 0;
        $metadataExpected = (int) ($metadata['replacement_expected_qty'] ?? $expected);
        $metadataReceived = (int) ($metadata['replacement_received_qty'] ?? $claim['replacement_received_quantity']);
        $metadataDelivered = (int) ($metadata['delivered_quantity'] ?? $claim['delivered_quantity']);
        $metadataResolution = (string) ($metadata['resolution'] ?? rdLegacyResolution($claim['resolution_type'], $claim['disposition']));
        $hasUnsupportedParent = !empty($metadata['parent_return_id']);
        $valid = (int) $claim['linked_item_count'] === 1
            && $metadataExpected === $expected
            && $metadataReceived === (int) $claim['replacement_received_quantity']
            && $metadataDelivered === (int) $claim['delivered_quantity']
            && rdCanonicalLegacyResolution($metadataResolution) === rdCanonicalLegacyResolution(rdLegacyResolution($claim['resolution_type'], $claim['disposition']))
            && !$hasUnsupportedParent;
        if (!$valid) {
            $skippedMetadata++;
            continue;
        }

        $isPlaceholderCredit = (float) ($claim['credit_amount'] ?? 0) === 0.01
            && (float) ($claim['credit_applied'] ?? 0) === 0.0
            && (float) ($metadata['supplier_adjustment'] ?? 0) === 0.01
            && ($claim['credit_status'] ?? '') === 'Available'
            && ($claim['claim_status'] ?? '') === 'Resolved / Credit Issued';
        if ($isPlaceholderCredit && !empty($claim['credit_id'])) {
            $pdo->prepare('DELETE FROM supplier_credits WHERE credit_id=:credit_id')->execute([':credit_id' => $claim['credit_id']]);
            $pdo->prepare("UPDATE supplier_claims SET claim_status='Awaiting Supplier Credit',resolved_at=NULL WHERE claim_id=:claim_id")->execute([':claim_id' => $claim['claim_id']]);
            $placeholderCreditsRemoved++;
        }

        $requested = trim((string) ($metadata['requested_resolution_type'] ?? $claim['resolution_type'] ?? '')) ?: null;
        $management = trim((string) ($metadata['management_remarks'] ?? '')) ?: null;
        $updateClaim->execute([
            ':requested_resolution' => $requested,
            ':management_remarks' => $management,
            ':remarks' => $humanRemarks === '' ? null : $humanRemarks,
            ':claim_id' => $claim['claim_id'],
        ]);
        $updateMissing->execute([':missing' => max(0, (int) ($metadata['missing_quantity'] ?? 0)), ':claim_id' => $claim['claim_id']]);
        if ($humanRemarks !== '') $preservedHumanRemarks++;
        $cleaned++;
    }
    $pdo->commit();

    $pdo->exec(
        "CREATE OR REPLACE VIEW supplier_claim_legacy_projection AS
         SELECT sc.claim_id AS return_id,sc.claim_id,poi.po_id,sc.po_item_id,sc.inventory_batch_id,
                sc.affected_quantity,sc.unit_conversion_id,sc.affected_quantity*affected_c.base_quantity AS affected_base_quantity,
                CASE WHEN sc.action_unit_conversion_id IS NOT NULL THEN sc.action_quantity*action_c.base_quantity ELSE sc.affected_quantity*affected_c.base_quantity END AS return_quantity,
                affected_c.unit_name AS affected_unit_name,affected_c.base_quantity AS affected_unit_base_quantity,
                sc.damaged_quantity AS damaged_selected_quantity,sc.damaged_unit_conversion_id,damaged_c.unit_name AS damaged_unit_name,COALESCE(damaged_c.base_quantity,1) AS damaged_unit_base_quantity,
                CASE WHEN sc.damaged_unit_conversion_id IS NOT NULL THEN sc.damaged_quantity*damaged_c.base_quantity ELSE sc.damaged_quantity END AS damaged_quantity,
                sc.action_quantity,sc.action_unit_conversion_id,action_c.unit_name AS action_unit_name,COALESCE(action_c.base_quantity,1) AS action_unit_base_quantity,
                CASE WHEN sc.action_unit_conversion_id IS NOT NULL THEN sc.action_quantity*action_c.base_quantity ELSE sc.affected_quantity*affected_c.base_quantity END AS action_base_quantity,
                sc.damage_reason,sc.disposition,sc.resolution_type,sc.requested_resolution_type,sc.claim_status AS return_status,sc.claim_status,
                sc.reported_by,sc.remarks,sc.management_remarks,sc.created_at,sc.resolved_at,
                COALESCE((SELECT MAX(ri.received_quantity) FROM supplier_claim_damage_lines dl INNER JOIN purchase_order_receiving_items ri ON ri.receiving_item_id=dl.receiving_item_id INNER JOIN purchase_order_receiving pr ON pr.receiving_id=ri.receiving_id WHERE dl.claim_id=sc.claim_id AND pr.receiving_type='Original'),0) AS delivered_quantity,
                COALESCE((SELECT MAX(ri.missing_quantity) FROM supplier_claim_damage_lines dl INNER JOIN purchase_order_receiving_items ri ON ri.receiving_item_id=dl.receiving_item_id INNER JOIN purchase_order_receiving pr ON pr.receiving_id=ri.receiving_id WHERE dl.claim_id=sc.claim_id AND pr.receiving_type='Original'),0) AS missing_quantity,
                CASE WHEN sc.resolution_type='Replacement' THEN CASE WHEN sc.action_unit_conversion_id IS NOT NULL THEN sc.action_quantity*action_c.base_quantity ELSE sc.affected_quantity*affected_c.base_quantity END ELSE 0 END AS replacement_expected_qty,
                COALESCE((SELECT SUM(replacement_item.accepted_quantity) FROM purchase_order_receiving replacement INNER JOIN purchase_order_receiving_items replacement_item ON replacement_item.receiving_id=replacement.receiving_id WHERE replacement.claim_id=sc.claim_id AND replacement.receiving_type='Replacement'),0) AS replacement_received_qty,
                COALESCE((SELECT cr.credit_amount FROM supplier_credits cr WHERE cr.claim_id=sc.claim_id LIMIT 1),0) AS supplier_adjustment,
                NULL AS parent_return_id
         FROM supplier_claims sc
         INNER JOIN purchase_order_items poi ON poi.po_item_id=sc.po_item_id
         INNER JOIN supplier_product_unit_conversions affected_c ON affected_c.conversion_id=sc.unit_conversion_id
         LEFT JOIN supplier_product_unit_conversions damaged_c ON damaged_c.conversion_id=sc.damaged_unit_conversion_id
         LEFT JOIN supplier_product_unit_conversions action_c ON action_c.conversion_id=sc.action_unit_conversion_id"
    );

    echo json_encode([
        'status' => 'success',
        'claims' => $claimCount,
        'normalized_before' => $normalizedBefore,
        'backfilled_claims' => $backfilled,
        'ambiguous_claims' => $ambiguousBefore,
        'line_rows_corrected' => $lineRowsCorrected,
        'metadata_cleaned' => $cleaned,
        'metadata_skipped' => $skippedMetadata,
        'human_remarks_preserved' => $preservedHumanRemarks,
        'placeholder_credits_removed' => $placeholderCreditsRemoved,
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
} catch (Throwable $error) {
    if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
    fwrite(STDERR, $error->getMessage() . PHP_EOL);
    exit(1);
}
