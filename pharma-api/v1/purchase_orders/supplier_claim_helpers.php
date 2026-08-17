<?php

function supplierClaimResolutionFromLegacy(string $resolution): ?string
{
    return match ($resolution) {
        'replacement', 'return_for_replacement' => 'Replacement',
        'supplier_credit' => 'Supplier Credit',
        'return_for_credit', 'keep_with_discount' => 'Current PO Credit',
        'next_po_credit' => 'Next PO Credit',
        'no_compensation' => 'No Supplier Compensation',
        default => null,
    };
}

function supplierClaimDispositionFromLegacy(string $resolution): ?string
{
    return match ($resolution) {
        'return_to_supplier', 'return_for_credit', 'return_for_replacement' => 'Return to Supplier',
        'hold_quarantine', 'keep_damaged', 'keep_with_discount' => 'Hold/Quarantine',
        'dispose', 'reject_without_replacement' => 'Dispose',
        'not_applicable' => 'Not Applicable',
        default => null,
    };
}

function supplierClaimLegacyResolution(?string $resolution, ?string $disposition): string
{
    return match ($resolution) {
        'Replacement' => 'return_for_replacement',
        'Supplier Credit' => 'supplier_credit',
        'Current PO Credit' => $disposition === 'Hold/Quarantine' ? 'keep_with_discount' : 'return_for_credit',
        'Next PO Credit' => 'next_po_credit',
        'No Supplier Compensation' => 'no_compensation',
        default => match ($disposition) {
            'Hold/Quarantine' => 'keep_damaged',
            'Dispose' => 'reject_without_replacement',
            default => 'none',
        },
    };
}

function supplierClaimStatus(?string $resolution): string
{
    return match ($resolution) {
        'Replacement' => 'Awaiting Replacement',
        'Next PO Credit' => 'Awaiting Supplier Credit',
        default => 'Awaiting Supplier Confirmation',
    };
}

function supplierClaimBaseQuantity(PDO $pdo, string $poItemId, string $conversionId): int
{
    $statement = $pdo->prepare(
        'SELECT c.base_quantity
         FROM purchase_order_items poi
         INNER JOIN purchase_orders po ON po.po_id = poi.po_id
         INNER JOIN supplier_products sp ON sp.product_id = poi.product_id AND sp.supplier_id = po.supplier_id
         INNER JOIN supplier_product_unit_conversions c ON c.supplier_product_id = sp.supplier_product_id
         WHERE poi.po_item_id = :po_item_id AND c.conversion_id = :conversion_id
         LIMIT 1'
    );
    $statement->execute([':po_item_id' => $poItemId, ':conversion_id' => $conversionId]);
    $quantity = (int) $statement->fetchColumn();
    if ($quantity <= 0) throw new InvalidArgumentException('Select a valid package level for the affected product.');
    return $quantity;
}

function supplierClaimDefaultConversion(PDO $pdo, string $poItemId): string
{
    $statement = $pdo->prepare(
        'SELECT c.conversion_id
         FROM purchase_order_items poi
         INNER JOIN purchase_orders po ON po.po_id = poi.po_id
         INNER JOIN supplier_products sp ON sp.product_id = poi.product_id AND sp.supplier_id = po.supplier_id
         INNER JOIN supplier_product_unit_conversions c ON c.supplier_product_id = sp.supplier_product_id
         WHERE poi.po_item_id = :po_item_id
         ORDER BY (c.base_quantity = 1) DESC, c.base_quantity ASC, c.level_order ASC
         LIMIT 1'
    );
    $statement->execute([':po_item_id' => $poItemId]);
    $conversionId = cleanId($statement->fetchColumn());
    if ($conversionId === '') throw new InvalidArgumentException('This supplier product has no package conversion configured.');
    return $conversionId;
}

function supplierClaimCreditAppliedToPo(PDO $pdo, string $poId): float
{
    $statement = $pdo->prepare('SELECT COALESCE(SUM(amount_applied), 0) FROM supplier_credit_applications WHERE po_id = :po_id');
    $statement->execute([':po_id' => $poId]);
    return round((float) $statement->fetchColumn(), 2);
}

function decorateSupplierClaim(array $claim): array
{
    $claim['return_id'] = $claim['claim_id'];
    $claim['return_quantity'] = (int) $claim['affected_quantity'];
    $claim['return_status'] = $claim['claim_status'];
    $claim['resolution'] = supplierClaimLegacyResolution($claim['resolution_type'] ?? null, $claim['disposition'] ?? null);
    $claim['damaged_quantity'] = (int) ($claim['affected_base_quantity'] ?? $claim['affected_quantity']);
    $claim['return_date'] = $claim['created_at'] ?? null;
    return $claim;
}
