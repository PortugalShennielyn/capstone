<?php

require_once __DIR__ . '/purchase_request_helpers.php';
require_once __DIR__ . '/../purchase_orders/purchase_order_helpers.php';

function purchaseRequestSupplierOptions(PDO $pdo, array $productIds): array
{
    ensureSupplierPurchasingConversionSchema($pdo);
    $productIds = array_values(array_unique(array_filter(array_map('cleanId', $productIds))));
    if (!$productIds) return [];

    $placeholders = implode(',', array_fill(0, count($productIds), '?'));
    $stmt = $pdo->prepare(
        "SELECT sp.supplier_product_id, sp.product_id, sp.supplier_id, s.supplier_name,
                s.address AS supplier_address, s.phone AS supplier_phone, s.email AS supplier_email,
                sp.purchase_unit, sp.purchase_unit_contains, sp.inner_unit, sp.units_per_inner_unit,
                sp.inventory_unit, sp.units_per_purchase_unit, sp.supplier_cost_price,
                sp.supplier_cost_input, sp.supplier_cost_basis
         FROM supplier_products sp
         INNER JOIN suppliers s ON s.supplier_id = sp.supplier_id
         WHERE sp.product_id IN ({$placeholders})
           AND s.archived_at IS NULL
         ORDER BY sp.product_id, s.supplier_name, sp.supplier_product_id"
    );
    $stmt->execute($productIds);
    $options = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $options[(string) $row['product_id']][] = enrichSupplierPurchasingSetup($row);
    }
    return $options;
}

function purchaseRequestProductDetails(PDO $pdo, array $productIds): array
{
    $productIds = array_values(array_unique(array_filter(array_map('cleanId', $productIds))));
    if (!$productIds) return [];

    $placeholders = implode(',', array_fill(0, count($productIds), '?'));
    $productStatement = $pdo->prepare(
        "SELECT p.product_id, p.product_name, p.brand_name, p.status AS product_status,
                pc.category_name, pt.type_name,
                md.generic_name, md.strength,
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
    if (!$pdo->inTransaction()) ensureSupplierPurchasingConversionSchema($pdo);
    $prId = cleanId($request['pr_id'] ?? null);
    $requestItems = purchaseRequestItems($pdo, $prId);
    if (!$requestItems) throw new InvalidArgumentException('The purchase request has no items to approve.');
    $productSnapshots = purchaseRequestProductSnapshots($pdo, array_column($requestItems, 'product_id'));

    $activeSetupCheck = $pdo->prepare(
        'SELECT COUNT(*) FROM supplier_products sp
         INNER JOIN suppliers s ON s.supplier_id = sp.supplier_id
         WHERE sp.product_id = :product_id AND s.archived_at IS NULL'
    );
    foreach ($requestItems as $requestItem) {
        $activeSetupCheck->execute([':product_id' => cleanId($requestItem['product_id'] ?? null)]);
        if ((int) $activeSetupCheck->fetchColumn() === 0) {
            throw new InvalidArgumentException(
                'Cannot generate PO for ' . ($requestItem['product_name'] ?? 'this product') .
                ' because no active supplier purchasing setup is assigned.'
            );
        }
    }

    $assignmentByItem = [];
    foreach ($assignments as $assignment) {
        $prItemId = cleanId($assignment['pr_item_id'] ?? null);
        if ($prItemId === '' || isset($assignmentByItem[$prItemId])) {
            throw new InvalidArgumentException('Each requested product must have one procurement assignment.');
        }
        $assignmentByItem[$prItemId] = $assignment;
    }

    $supplierProductStmt = $pdo->prepare(
        "SELECT sp.supplier_product_id, sp.supplier_id, sp.product_id,
                sp.purchase_unit, sp.purchase_unit_contains, sp.inner_unit, sp.units_per_inner_unit,
                sp.inventory_unit, sp.units_per_purchase_unit, sp.supplier_cost_price,
                sp.supplier_cost_input, sp.supplier_cost_basis,
                s.supplier_name
         FROM supplier_products sp
         INNER JOIN suppliers s ON s.supplier_id = sp.supplier_id
         WHERE sp.supplier_product_id = :supplier_product_id
           AND sp.product_id = :product_id
           AND s.archived_at IS NULL
         LIMIT 1 FOR UPDATE"
    );

    $groups = [];
    foreach ($requestItems as $requestItem) {
        $prItemId = cleanId($requestItem['pr_item_id']);
        $assignment = $assignmentByItem[$prItemId] ?? null;
        if (!$assignment) throw new InvalidArgumentException('Select a supplier for every requested product.');

        $supplierProductId = cleanId($assignment['supplier_product_id'] ?? null);
        $supplierProductStmt->execute([
            ':supplier_product_id' => $supplierProductId,
            ':product_id' => cleanId($requestItem['product_id']),
        ]);
        $setup = $supplierProductStmt->fetch(PDO::FETCH_ASSOC);
        if (!$setup) throw new InvalidArgumentException('A selected supplier-product assignment is no longer available.');

        $purchaseUnit = trim((string) ($setup['purchase_unit'] ?? ''));
        $inventoryUnit = trim((string) ($setup['inventory_unit'] ?? ''));
        $conversion = supplierPurchasingConversion($setup)['base_qty_per_purchase_unit'];
        $cost = supplierPurchasingCost($setup, supplierPurchasingConversion($setup));
        if ($purchaseUnit === '') throw new InvalidArgumentException('Purchase Unit is required for every approved product.');
        if ($inventoryUnit === '') throw new InvalidArgumentException('Inventory Unit is required for every approved product.');
        if ($conversion <= 0) throw new InvalidArgumentException('Units per Purchase Unit must be greater than zero.');
        if ((float) $cost['estimated_purchase_unit_cost'] <= 0 || (float) $cost['supplier_cost_per_inventory_unit'] <= 0) {
            throw new InvalidArgumentException('Supplier cost must be greater than zero for every approved product.');
        }

        // PR quantities are always stored in the Product Master base inventory
        // unit. The supplier conversion selected during PO generation determines
        // the minimum purchase-unit quantity without mutating the PR item.
        $minimumOrderQty = (int) ceil((float) $requestItem['requested_qty'] / $conversion);
        $orderQtyRaw = $assignment['order_qty'] ?? $minimumOrderQty;
        if (!is_numeric($orderQtyRaw) || (int) $orderQtyRaw <= 0 || (float) $orderQtyRaw !== (float) (int) $orderQtyRaw) {
            throw new InvalidArgumentException('Order Quantity must be a positive whole number.');
        }
        $orderQty = (int) $orderQtyRaw;
        if ($orderQty < $minimumOrderQty) {
            throw new InvalidArgumentException('Order Quantity cannot be less than the package quantity needed to cover the request.');
        }

        $snapshot = $productSnapshots[cleanId($requestItem['product_id'])] ?? null;
        if (!$snapshot || strcasecmp((string) ($snapshot['product_status'] ?? ''), 'Active') !== 0) {
            throw new InvalidArgumentException('An approved product is missing or inactive.');
        }
        $supplierId = cleanId($setup['supplier_id']);
        // PO items retain the normalized base-unit price plus their purchase
        // unit and conversion snapshots, so the purchase-unit quote is stable.
        $unitCost = round((float) $cost['supplier_cost_per_inventory_unit'], 4);
        $purchaseUnitCost = round((float) $cost['estimated_purchase_unit_cost'], 2);
        $lineTotal = round($orderQty * $purchaseUnitCost, 2);
        $groups[$supplierId]['supplier_name'] = $setup['supplier_name'];
        $groups[$supplierId]['items'][] = [
            'request_item' => $requestItem,
            'purchase_unit' => $purchaseUnit,
            'inventory_unit' => $inventoryUnit,
            'conversion' => $conversion,
            'order_qty' => $orderQty,
            'expected_base_qty' => inventoryQuantityForPurchaseQuantity($orderQty, $conversion),
            'unit_cost' => $unitCost,
            'purchase_unit_cost' => $purchaseUnitCost,
            'line_total' => $lineTotal,
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
            (:po_id, :pr_id, :supplier_id, :po_number, :payment_terms, :eta, 'Pending', 'Approved', :total_amount, NOW())"
    );
    $insertItem = $pdo->prepare(
        'INSERT INTO purchase_order_items
            (po_item_id, po_id, pr_item_id, product_id, quantity, purchase_qty,
             purchase_unit_snapshot, units_per_purchase_unit_snapshot, inventory_qty_ordered,
             product_name_snapshot, brand_name_snapshot, category_name_snapshot, type_name_snapshot,
             generic_name_snapshot, variant_flavor_snapshot, strength_snapshot, size_value_snapshot,
             unit_snapshot, packaging_snapshot, unit_price_snapshot, line_total)
         VALUES
            (:po_item_id, :po_id, :pr_item_id, :product_id, :quantity, :purchase_qty,
             :purchase_unit, :conversion, :inventory_qty_ordered,
             :product_name, :brand_name, :category_name, :type_name,
             :generic_name, :variant_flavor, :strength, :size_value,
             :unit, :packaging, :unit_cost, :line_total)'
    );
    $generated = [];
    foreach ($groups as $supplierId => $group) {
        $total = round(array_sum(array_column($group['items'], 'line_total')), 2);
        $poId = newUuid($pdo);
        $poNumber = automaticPurchaseOrderNumber();
        $eta = trim((string) ($supplierEtas[$supplierId] ?? ''));
        $paymentTerms = 'Cash';
        if ($eta === '') throw new InvalidArgumentException('ETA is required for every supplier purchase order.');
        $date = DateTime::createFromFormat('Y-m-d', $eta);
        if (!$date || $date->format('Y-m-d') !== $eta) throw new InvalidArgumentException('ETA must be a valid date.');
        $insertPo->execute([
            ':po_id' => $poId, ':pr_id' => $prId, ':supplier_id' => $supplierId,
            ':po_number' => $poNumber, ':payment_terms' => $paymentTerms, ':eta' => $eta, ':total_amount' => $total,
        ]);
        foreach ($group['items'] as $item) {
            $snapshot = $item['snapshot'];
            $requestItem = $item['request_item'];
            $insertItem->execute([
                ':po_item_id' => newUuid($pdo), ':po_id' => $poId, ':pr_item_id' => $requestItem['pr_item_id'],
                ':product_id' => $requestItem['product_id'], ':quantity' => $item['expected_base_qty'],
                ':purchase_qty' => $item['order_qty'], ':purchase_unit' => $item['purchase_unit'],
                ':conversion' => $item['conversion'], ':inventory_qty_ordered' => $item['expected_base_qty'],
                ':product_name' => $snapshot['product_name'], ':brand_name' => $snapshot['brand_name'],
                ':category_name' => $snapshot['category_name'], ':type_name' => $snapshot['type_name'],
                ':generic_name' => $snapshot['generic_name'], ':variant_flavor' => $snapshot['variant_flavor'],
                ':strength' => $snapshot['strength'], ':size_value' => $snapshot['size_value'],
                ':unit' => $item['inventory_unit'], ':packaging' => $snapshot['packaging'],
                ':unit_cost' => $item['unit_cost'], ':line_total' => $item['line_total'],
            ]);
        }
        $generated[] = [
            'po_id' => $poId, 'po_number' => $poNumber, 'supplier_id' => $supplierId,
            'supplier_name' => $group['supplier_name'], 'item_count' => count($group['items']), 'total_amount' => $total,
            'payment_terms' => $paymentTerms, 'expected_delivery_date' => $eta,
        ];
    }
    return $generated;
}
