<?php

require_once __DIR__ . '/purchase_request_helpers.php';
require_once __DIR__ . '/../purchase_orders/purchase_order_helpers.php';

function purchaseRequestProductDetails(PDO $pdo, array $productIds): array
{
    $productIds = array_values(array_unique(array_filter(array_map('cleanId', $productIds))));
    if (!$productIds) return [];

    $placeholders = implode(',', array_fill(0, count($productIds), '?'));
    $productStatement = $pdo->prepare(
        "SELECT p.product_id,
                COALESCE(NULLIF(TRIM(md.generic_name), ''), p.product_name) AS product_name,
                p.brand_name, p.status AS product_status,
                pc.category_name, pt.type_name,
                COALESCE(NULLIF(TRIM(md.generic_name), ''), p.product_name) AS generic_name,
                md.strength,
                md.strength_value AS medicine_strength_value, md.strength_unit,
                md.net_content_value, md.net_content_unit, md.dosage_form,
                COALESCE(md.package_type, gd.package_type, msd.package_type) AS package_type,
                gd.variant, gd.size, gd.net_weight, gd.unit AS grocery_unit, gd.pack_content,
                msd.variant AS medical_variant, msd.size AS medical_size,
                msd.material, msd.sterile_status, msd.pack_content AS medical_pack_content
         FROM product p
         LEFT JOIN product_categories pc ON pc.category_id = p.category_id
         LEFT JOIN product_types pt ON pt.type_id = p.type_id
         LEFT JOIN medicine_details md ON md.product_id = p.product_id
         LEFT JOIN grocery_details gd ON gd.product_id = p.product_id
         LEFT JOIN medical_supply_details msd ON msd.product_id = p.product_id
         WHERE p.product_id IN ({$placeholders})"
    );
    $productStatement->execute($productIds);
    $details = [];
    foreach ($productStatement->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $row['strength_value'] = $row['medicine_strength_value'] ?? ($row['strength'] ?? '');
        $row['volume_value'] = $row['net_content_value'] ?? '';
        $row['volume_unit'] = $row['net_content_unit'] ?? '';
        $row['variant_flavor'] = $row['variant'] ?? ($row['medical_variant'] ?? '');
        $row['size_value'] = $row['size'] ?? ($row['medical_size'] ?? '');
        $row['display_size'] = $row['size_value'];
        $row['weight_volume_value'] = $row['net_weight'] ?? '';
        $row['weight_volume_unit'] = $row['grocery_unit'] ?? '';
        $row['specifications'] = [];
        $details[(string) $row['product_id']] = $row;
    }

    $specificationStatement = $pdo->prepare(
        "SELECT psv.product_id, ps.specification_id, ps.specification_name,
                COALESCE(NULLIF(pts.display_label, ''), ps.specification_name) AS display_name,
                ps.field_style, psv.value_text, psv.value_number, psv.measurement_unit_id,
                COALESCE(NULLIF(pmu.unit_symbol, ''), pmu.unit_name) AS unit_symbol
         FROM product_specification_values psv
         INNER JOIN product p ON p.product_id = psv.product_id
         INNER JOIN product_specifications ps ON ps.specification_id = psv.specification_id
         LEFT JOIN product_type_specifications pts
                ON pts.type_id = p.type_id AND pts.specification_id = psv.specification_id
         LEFT JOIN product_measurement_units pmu
                ON pmu.measurement_unit_id = psv.measurement_unit_id
         WHERE psv.product_id IN ({$placeholders})
         ORDER BY psv.product_id, pts.sort_order, ps.specification_name"
    );
    $specificationStatement->execute($productIds);
    foreach ($specificationStatement->fetchAll(PDO::FETCH_ASSOC) as $specification) {
        $productId = (string) $specification['product_id'];
        if (isset($details[$productId])) $details[$productId]['specifications'][] = $specification;
    }
    return $details;
}

function purchaseRequestProductSnapshots(PDO $pdo, array $productIds): array
{
    $details = purchaseRequestProductDetails($pdo, $productIds);
    $snapshots = [];
    foreach ($details as $productId => $detail) {
        $variantFlavor = (string) ($detail['variant_flavor'] ?? '');
        $sizeValue = (string) ($detail['size_value'] ?? '');
        foreach ($detail['specifications'] ?? [] as $specification) {
            $name = strtolower(trim((string) ($specification['specification_name'] ?? '')));
            $value = trim((string) ($specification['value_text'] ?? ''));
            if ($value === '' && $specification['value_number'] !== null && $specification['value_number'] !== '') {
                $number = rtrim(rtrim((string) $specification['value_number'], '0'), '.');
                if ($number === '') $number = '0';
                $value = trim($number . ' ' . (string) ($specification['unit_symbol'] ?? ''));
            }
            if ($value === '') continue;
            if ($variantFlavor === '' && (str_contains($name, 'flavor') || str_contains($name, 'variant'))) $variantFlavor = $value;
            if ($sizeValue === '' && (str_contains($name, 'volume') || str_contains($name, 'size') || str_contains($name, 'weight'))) $sizeValue = $value;
        }
        $snapshots[$productId] = [
            'product_id' => $productId,
            'product_name' => $detail['product_name'] ?? '',
            'brand_name' => $detail['brand_name'] ?? '',
            'category_name' => $detail['category_name'] ?? '',
            'type_name' => $detail['type_name'] ?? '',
            'generic_name' => $detail['generic_name'] ?? '',
            'strength' => trim((string) ($detail['strength'] ?? '')) ?: trim(implode(' ', array_filter([
                $detail['medicine_strength_value'] ?? '', $detail['strength_unit'] ?? '',
            ]))),
            'variant_flavor' => $variantFlavor,
            'size_value' => $sizeValue,
            'unit' => $detail['grocery_unit'] ?? ($detail['dosage_form'] ?? ''),
            'packaging' => $detail['package_type'] ?? '',
            'product_status' => $detail['product_status'] ?? '',
        ];
    }
    return $snapshots;
}

function purchaseRequestProductSnapshot(PDO $pdo, string $productId): array
{
    $row = purchaseRequestProductSnapshots($pdo, [$productId])[$productId] ?? null;
    if (!$row || strcasecmp((string) ($row['product_status'] ?? ''), 'Active') !== 0) {
        throw new InvalidArgumentException('An approved product is missing or inactive.');
    }
    return $row;
}

function automaticPurchaseOrderNumber(): string
{
    return 'PO-' . date('Ymd-His') . '-' . strtoupper(bin2hex(random_bytes(3)));
}

function generatePurchaseOrdersForApprovedRequest(PDO $pdo, array $request, array $assignments, array $supplierEtas = []): array
{
    $ownsTransaction = !$pdo->inTransaction();
    if ($ownsTransaction) {
        ensureSupplierPurchasingConversionSchema($pdo);
        $pdo->beginTransaction();
    }
    $pdo->exec('SAVEPOINT generate_purchase_orders');
    try {
        $prId = cleanId($request['pr_id'] ?? null);
        $request = purchaseRequestById($pdo, $prId, true);
        if (!$request || $request['status'] !== 'Approved') throw new InvalidArgumentException('Only Supervisor-approved requests can generate purchase orders.');
        assertPurchaseRequestHasValidItems($pdo, $prId, 'Cannot generate Purchase Order because this Purchase Request has no products.');
        $existing = array_values(array_filter(purchaseRequestPurchaseOrders($pdo, $prId), static fn($po) => !in_array($po['status'], ['Cancelled', 'Rejected'], true)));
        if ($existing) {
            $result = $existing;
        } else {
            $allocated = $pdo->prepare("SELECT COUNT(*) FROM purchase_order_items poi INNER JOIN purchase_request_items pri ON pri.pr_item_id=poi.pr_item_id INNER JOIN purchase_orders po ON po.po_id=poi.po_id WHERE pri.pr_id=? AND po.status NOT IN ('Cancelled','Rejected')");
            $allocated->execute([$prId]);
            if ((int)$allocated->fetchColumn() > 0) throw new InvalidArgumentException('Requested products have already been allocated to a purchase order.');
            $result = insertPurchaseOrdersForApprovedRequest($pdo, $request, $assignments, $supplierEtas);
        }
        $pdo->exec('RELEASE SAVEPOINT generate_purchase_orders');
        if ($ownsTransaction) $pdo->commit();
        return $result;
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            if ($ownsTransaction) $pdo->rollBack();
            else $pdo->exec('ROLLBACK TO SAVEPOINT generate_purchase_orders');
        }
        throw $error;
    }
}

function insertPurchaseOrdersForApprovedRequest(PDO $pdo, array $request, array $assignments, array $supplierEtas = []): array
{
    if (!$pdo->inTransaction()) throw new LogicException('PO insertion requires a transaction.');
    if (($request['status'] ?? '') !== 'Approved') throw new InvalidArgumentException('Only Supervisor-approved requests can generate purchase orders.');
    $prId = cleanId($request['pr_id'] ?? null);
    $requestItems = purchaseRequestItems($pdo, $prId);
    if (!$requestItems) throw new InvalidArgumentException('The purchase request has no items to approve.');
    $productSnapshots = purchaseRequestProductSnapshots($pdo, array_column($requestItems, 'product_id'));

    $supplierOptions = purchaseRequestSupplierOptions($pdo, array_column($requestItems, 'product_id'), true);
    $setupsById = [];
    foreach ($supplierOptions as $options) {
        foreach ($options as $option) $setupsById[$option['supplier_product_id']] = $option;
    }

    $assignmentByItem = [];
    foreach ($assignments as $assignment) {
        $prItemId = cleanId($assignment['pr_item_id'] ?? null);
        if ($prItemId === '' || isset($assignmentByItem[$prItemId])) {
            throw new InvalidArgumentException('Each requested product must have one procurement assignment.');
        }
        $assignmentByItem[$prItemId] = $assignment;
    }

    $groups = [];
    foreach ($requestItems as $requestItem) {
        $prItemId = cleanId($requestItem['pr_item_id']);
        $assignment = $assignmentByItem[$prItemId] ?? null;
        if (!$assignment) throw new InvalidArgumentException('Select a supplier for every requested product.');

        $supplierProductId = cleanId($assignment['supplier_product_id'] ?? null);
        $setup = $setupsById[$supplierProductId] ?? null;
        if (!$setup || $setup['product_id'] !== $requestItem['product_id']) {
            throw new InvalidArgumentException('A selected supplier-product assignment is no longer available.');
        }
        if ($requestItem['request_unit_base_quantity'] === null) {
            throw new InvalidArgumentException('The approved request unit has an ambiguous or missing packaging conversion.');
        }

        $purchaseUnit = trim((string) ($setup['purchase_unit'] ?? ''));
        $inventoryUnit = trim((string) ($setup['inventory_unit'] ?? ''));
        $conversion = supplierPurchasingConversion($setup)['base_qty_per_purchase_unit'];
        if ($purchaseUnit === '') throw new InvalidArgumentException('Purchase Unit is required for every approved product.');
        if ($inventoryUnit === '') throw new InvalidArgumentException('Inventory Unit is required for every approved product.');
        if ($conversion <= 0) throw new InvalidArgumentException('Units per Purchase Unit must be greater than zero.');

        // The Supervisor-approved request quantity is the immutable purchasing
        // authority. Never trust or accept an order quantity from the browser.
        if ($requestItem['approved_qty'] === null || (float) $requestItem['approved_qty'] <= 0) {
            throw new InvalidArgumentException('Every approved product must have a valid Supervisor-approved quantity.');
        }
        $approvedQty = (float) $requestItem['approved_qty'];
        $orderQty = purchaseRequestExactOrderQuantity($approvedQty, (string)$requestItem['unit'], $setup);

        $snapshot = $productSnapshots[cleanId($requestItem['product_id'])] ?? null;
        if (!$snapshot || strcasecmp((string) ($snapshot['product_status'] ?? ''), 'Active') !== 0) {
            throw new InvalidArgumentException('An approved product is missing or inactive.');
        }
        $supplierId = cleanId($setup['supplier_id']);
        $groups[$supplierId]['supplier_name'] = $setup['supplier_name'];
        $groups[$supplierId]['items'][] = [
            'request_item' => $requestItem,
            'purchase_unit' => $purchaseUnit,
            'inventory_unit' => $inventoryUnit,
            'conversion' => $conversion,
            'order_qty' => $orderQty,
            'expected_base_qty' => inventoryQuantityForPurchaseQuantity($orderQty, $conversion),
            'approved_qty' => $approvedQty,
            'snapshot' => $snapshot,
        ];
    }

    if (count($assignmentByItem) !== count($requestItems)) {
        throw new InvalidArgumentException('The approval contains an item that is not part of this purchase request.');
    }

    $insertPo = $pdo->prepare(
        "INSERT INTO purchase_orders
            (po_id, pr_id, supplier_id, po_number, payment_terms, expected_delivery_date, status, approval_status, total_amount, created_at)
         VALUES
            (:po_id, :pr_id, :supplier_id, :po_number, :payment_terms, :eta, 'Draft', 'Approved', NULL, NOW())"
    );
    $insertItem = $pdo->prepare(
        'INSERT INTO purchase_order_items
            (po_item_id, po_id, pr_item_id, product_id, quantity, purchase_qty,
             purchase_unit_snapshot, units_per_purchase_unit_snapshot, inventory_qty_ordered,
             unit_snapshot, unit_price_snapshot, line_total)
         VALUES
            (:po_item_id, :po_id, :pr_item_id, :product_id, :quantity, :purchase_qty,
             :purchase_unit, :conversion, :inventory_qty_ordered,
             :unit, :unit_cost, :line_total)'
    );
    $generated = [];
    foreach ($groups as $supplierId => $group) {
        $poId = newUuid($pdo);
        $poNumber = automaticPurchaseOrderNumber();
        $eta = trim((string) ($supplierEtas[$supplierId] ?? ''));
        $paymentTerms = 'Cash';
        if ($eta === '') throw new InvalidArgumentException('ETA is required for every supplier purchase order.');
        $eta = validateDateNotBeforeToday($eta, 'ETA must be a valid date.', 'ETA cannot be earlier than today.');
        $insertPo->execute([
            ':po_id' => $poId, ':pr_id' => $prId, ':supplier_id' => $supplierId,
            ':po_number' => $poNumber, ':payment_terms' => $paymentTerms, ':eta' => $eta,
        ]);
        foreach ($group['items'] as $item) {
            $snapshot = $item['snapshot'];
            $requestItem = $item['request_item'];
            $insertItem->execute([
                ':po_item_id' => newUuid($pdo), ':po_id' => $poId, ':pr_item_id' => $requestItem['pr_item_id'],
                ':product_id' => $requestItem['product_id'], ':quantity' => $item['expected_base_qty'],
                ':purchase_qty' => $item['order_qty'], ':purchase_unit' => $item['purchase_unit'],
                ':conversion' => $item['conversion'], ':inventory_qty_ordered' => $item['expected_base_qty'],
                ':unit' => $item['inventory_unit'],
                ':unit_cost' => null, ':line_total' => null,
            ]);
        }
        $countItems = $pdo->prepare('SELECT COUNT(*) FROM purchase_order_items WHERE po_id=?');
        $countItems->execute([$poId]);
        if ((int)$countItems->fetchColumn() !== count($group['items']) || !$group['items']) throw new RuntimeException('Purchase order item insertion failed.');
        $generated[] = [
            'po_id' => $poId, 'po_number' => $poNumber, 'supplier_id' => $supplierId,
            'supplier_name' => $group['supplier_name'], 'item_count' => count($group['items']), 'total_amount' => null,
            'payment_terms' => $paymentTerms, 'expected_delivery_date' => $eta,
        ];
    }
    return $generated;
}
