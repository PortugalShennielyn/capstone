<?php
function ensurePurchaseOrderSchema(PDO $pdo): void
{
    $pdo->exec("ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(40) NULL");
    $pdo->exec("ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS expected_delivery_date DATE NULL");
    $pdo->exec("ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(40) NOT NULL DEFAULT 'Unpaid'");
    $pdo->exec("ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS total_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00");
    $pdo->exec("ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS final_payment DECIMAL(12,2) NOT NULL DEFAULT 0.00");
    $pdo->exec("ALTER TABLE purchase_orders MODIFY status VARCHAR(40) NOT NULL DEFAULT 'Pending'");
    $pdo->exec("UPDATE purchase_orders SET status = 'Delivered with Return/Damage' WHERE status = 'Return/Damage'");
    $pdo->exec("ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS product_name_snapshot VARCHAR(150) NULL");
    $pdo->exec("ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS brand_name_snapshot VARCHAR(150) NULL");
    $pdo->exec("ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS category_name_snapshot VARCHAR(100) NULL");
    $pdo->exec("ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS type_name_snapshot VARCHAR(100) NULL");
    $pdo->exec("ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS generic_name_snapshot VARCHAR(150) NULL");
    $pdo->exec("ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS variant_flavor_snapshot VARCHAR(100) NULL");
    $pdo->exec("ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS strength_snapshot VARCHAR(100) NULL");
    $pdo->exec("ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS size_value_snapshot VARCHAR(100) NULL");
    $pdo->exec("ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS unit_snapshot VARCHAR(100) NULL");
    $pdo->exec("ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS packaging_snapshot VARCHAR(100) NULL");
    $pdo->exec("ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS unit_price_snapshot DECIMAL(12,2) NULL");
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS supplier_products (
            supplier_product_id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
            supplier_id CHAR(36) NOT NULL,
            product_id CHAR(36) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_supplier_product (supplier_id, product_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS purchase_order_receiving (
            receiving_id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
            po_id CHAR(36) NOT NULL,
            received_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            remarks TEXT NULL,
            UNIQUE KEY unique_po_receiving (po_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS purchase_order_receiving_items (
            receiving_item_id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
            receiving_id CHAR(36) NOT NULL,
            po_item_id CHAR(36) NOT NULL,
            received_quantity INT NOT NULL DEFAULT 0,
            damaged_quantity INT NOT NULL DEFAULT 0,
            UNIQUE KEY unique_receiving_item (receiving_id, po_item_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS purchase_order_returns (
            return_id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
            po_id CHAR(36) NOT NULL,
            po_item_id CHAR(36) NOT NULL,
            return_quantity INT NOT NULL DEFAULT 0,
            damage_reason VARCHAR(80) NOT NULL,
            remarks TEXT NULL,
            return_status VARCHAR(40) NOT NULL DEFAULT 'Open',
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );
    $pdo->exec("ALTER TABLE purchase_order_returns ADD COLUMN IF NOT EXISTS return_status VARCHAR(40) NOT NULL DEFAULT 'Open'");
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS product_inventory (
            inventory_id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
            product_id CHAR(36) NOT NULL,
            batch_number VARCHAR(80) NOT NULL,
            quantity_stocked INT NOT NULL DEFAULT 0,
            quantity_remaining INT NOT NULL DEFAULT 0,
            expiration_date DATE NULL,
            status VARCHAR(40) NOT NULL DEFAULT 'Available',
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );
    $pdo->exec("ALTER TABLE product_inventory MODIFY expiration_date DATE NULL");
    $pdo->exec("ALTER TABLE product_inventory ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP");
}

function purchaseOrderStatuses(): array
{
    return [
        'Pending',
        'Approved by the owner',
        'In transit',
        'Arrived',
        'Delivered',
        'Delivered with Return/Damage',
        'Cancelled'
    ];
}

function activePurchaseOrderStatuses(): array
{
    return [
        'Pending',
        'Approved by the owner',
        'In transit',
        'Arrived'
    ];
}

function completeDeliveryStatuses(): array
{
    return [
        'Delivered',
        'Delivered with Return/Damage'
    ];
}

function paymentTermsOptions(): array
{
    return ['Cash', 'GCash', 'Bank Transfer'];
}

function requireStringField(array $payload, string $field): string
{
    $value = trim((string) ($payload[$field] ?? ''));
    if ($value === '') {
        throw new InvalidArgumentException("The {$field} field is required.");
    }
    return $value;
}

function validatePaymentTerms(array $payload): string
{
    $paymentTerms = requireStringField($payload, 'payment_terms');
    if (!in_array($paymentTerms, paymentTermsOptions(), true)) {
        throw new InvalidArgumentException('Invalid payment terms.');
    }
    return $paymentTerms;
}

function validateExpectedDeliveryDate(array $payload): string
{
    $date = requireStringField($payload, 'expected_delivery_date');
    $parsed = DateTime::createFromFormat('Y-m-d', $date);
    if (!$parsed || $parsed->format('Y-m-d') !== $date) {
        throw new InvalidArgumentException('Expected delivery date must be a valid date.');
    }
    return $date;
}

function validatePurchaseOrderStatus(array $payload): string
{
    $status = requireStringField($payload, 'status');
    if (!in_array($status, purchaseOrderStatuses(), true)) {
        throw new InvalidArgumentException('Invalid purchase order status.');
    }
    return $status;
}

function validatePurchaseOrderItems(array $items): void
{
    if (count($items) === 0) {
        throw new InvalidArgumentException('At least one purchase-order item is required.');
    }

    foreach ($items as $item) {
        $purchaseQty = (int) ($item['purchase_qty'] ?? $item['quantity'] ?? 0);
        $unitsPerPurchaseUnit = (int) ($item['units_per_purchase_unit'] ?? 1);
        if (idIsMissing($item['product_id'] ?? null) || $purchaseQty <= 0 || $unitsPerPurchaseUnit <= 0) {
            throw new InvalidArgumentException('Each purchase-order item must have a valid product and quantity.');
        }

    }
}

function purchaseOrderItemSnapshotColumns(): array
{
    return [
        'product_name' => 'product_name_snapshot',
        'brand_name' => 'brand_name_snapshot',
        'category_name' => 'category_name_snapshot',
        'type_name' => 'type_name_snapshot',
        'generic_name' => 'generic_name_snapshot',
        'variant_flavor' => 'variant_flavor_snapshot',
        'strength' => 'strength_snapshot',
        'size_value' => 'size_value_snapshot',
        'unit' => 'unit_snapshot',
        'packaging' => 'packaging_snapshot',
        'price' => 'unit_price_snapshot'
    ];
}

function cleanSnapshotText(array $item, string $field): ?string
{
    $value = trim((string) ($item[$field] ?? ''));
    return $value === '' ? null : $value;
}

function cleanSnapshotPrice(array $item): ?float
{
    if (!array_key_exists('price', $item) || $item['price'] === '' || $item['price'] === null) {
        return null;
    }

    if (!is_numeric($item['price']) || (float) $item['price'] < 0) {
        throw new InvalidArgumentException('Unit price must be a valid amount.');
    }

    return (float) $item['price'];
}

function purchaseOrderQuantityParams(array $item): array
{
    $purchaseQty = max(1, (int) ($item['purchase_qty'] ?? $item['quantity'] ?? 1));
    $unitsPerPurchaseUnit = max(1, (int) ($item['units_per_purchase_unit'] ?? 1));
    $inventoryQtyOrdered = max(1, (int) ($item['inventory_qty_ordered'] ?? ($purchaseQty * $unitsPerPurchaseUnit)));
    $unitPrice = cleanSnapshotPrice($item) ?? 0.0;

    return [
        ':quantity' => $inventoryQtyOrdered,
        ':purchase_qty' => $purchaseQty,
        ':purchase_unit_snapshot' => cleanSnapshotText($item, 'purchase_unit') ?: cleanSnapshotText($item, 'unit'),
        ':units_per_purchase_unit_snapshot' => $unitsPerPurchaseUnit,
        ':inventory_qty_ordered' => $inventoryQtyOrdered,
        ':line_total' => $inventoryQtyOrdered * $unitPrice
    ];
}

function purchaseOrderItemSnapshotParams(array $item): array
{
    return [
        ':product_name_snapshot' => cleanSnapshotText($item, 'product_name'),
        ':brand_name_snapshot' => cleanSnapshotText($item, 'brand_name'),
        ':category_name_snapshot' => cleanSnapshotText($item, 'category_name'),
        ':type_name_snapshot' => cleanSnapshotText($item, 'type_name'),
        ':generic_name_snapshot' => cleanSnapshotText($item, 'generic_name'),
        ':variant_flavor_snapshot' => cleanSnapshotText($item, 'variant_flavor'),
        ':strength_snapshot' => cleanSnapshotText($item, 'strength'),
        ':size_value_snapshot' => cleanSnapshotText($item, 'size_value'),
        ':unit_snapshot' => cleanSnapshotText($item, 'unit'),
        ':packaging_snapshot' => cleanSnapshotText($item, 'packaging'),
        ':unit_price_snapshot' => cleanSnapshotPrice($item)
    ];
}

function validateProductsForSupplier(PDO $pdo, string $supplierId, array $items): void
{
    $statement = $pdo->prepare(
        'SELECT COUNT(*)
         FROM supplier_products sp
         WHERE sp.product_id = :product_id
           AND sp.supplier_id = :supplier_id'
    );

    foreach ($items as $item) {
        $statement->execute([
            ':product_id' => cleanId($item['product_id']),
            ':supplier_id' => $supplierId
        ]);

        if ((int) $statement->fetchColumn() !== 1) {
            throw new InvalidArgumentException('A purchase-order item is not assigned to the selected supplier.');
        }
    }
}

function supplierProductSetupByProduct(PDO $pdo, string $supplierId, array $items): array
{
    $productIds = array_values(array_unique(array_filter(array_map(
        static fn($item) => cleanId($item['product_id'] ?? null),
        $items
    ))));

    if (count($productIds) === 0) {
        return [];
    }

    $placeholders = implode(',', array_fill(0, count($productIds), '?'));
    $statement = $pdo->prepare(
        "SELECT
            sp.product_id,
            sp.supplier_cost_price,
            COALESCE(NULLIF(sp.purchase_unit, ''), gd.package_type, md.package_type, md.dosage_form, 'pcs') AS purchase_unit,
            CASE
                WHEN COALESCE(sp.units_per_purchase_unit, 1) > 1 THEN sp.units_per_purchase_unit
                WHEN gd.pack_content REGEXP '^[0-9]+' THEN GREATEST(CAST(SUBSTRING_INDEX(gd.pack_content, ' ', 1) AS UNSIGNED), 1)
                ELSE 1
            END AS units_per_purchase_unit
         FROM supplier_products sp
         INNER JOIN product p ON p.product_id = sp.product_id
         LEFT JOIN medicine_details md ON md.product_id = p.product_id
         LEFT JOIN grocery_details gd ON gd.product_id = p.product_id
         WHERE sp.supplier_id = ?
           AND sp.product_id IN ({$placeholders})"
    );
    $statement->execute(array_merge([$supplierId], $productIds));

    $setup = [];
    foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $setup[cleanId($row['product_id'])] = $row;
    }
    return $setup;
}

function applySupplierProductSetup(PDO $pdo, string $supplierId, array $items): array
{
    $setupByProduct = supplierProductSetupByProduct($pdo, $supplierId, $items);
    $hydratedItems = [];

    foreach ($items as $item) {
        $productId = cleanId($item['product_id'] ?? null);
        $setup = $setupByProduct[$productId] ?? [];
        $unitsPerPurchaseUnit = max(1, (int) ($item['units_per_purchase_unit'] ?? $setup['units_per_purchase_unit'] ?? 1));
        $purchaseUnit = preg_replace('/^by\s+/i', '', trim((string) ($item['purchase_unit'] ?? $setup['purchase_unit'] ?? $item['unit'] ?? 'pcs')));
        $supplierCost = $setup['supplier_cost_price'] ?? null;

        $item['purchase_unit'] = $purchaseUnit !== '' ? $purchaseUnit : 'pcs';
        $item['units_per_purchase_unit'] = $unitsPerPurchaseUnit;
        if ($supplierCost !== null && $supplierCost !== '') {
            $item['price'] = (float) $supplierCost;
        }

        $purchaseQty = max(1, (int) ($item['purchase_qty'] ?? $item['quantity'] ?? 1));
        $item['purchase_qty'] = $purchaseQty;
        $item['inventory_qty_ordered'] = $purchaseQty * $unitsPerPurchaseUnit;
        $item['quantity'] = $item['inventory_qty_ordered'];
        $hydratedItems[] = $item;
    }

    return $hydratedItems;
}

function updatePurchaseOrderStatus(PDO $pdo, string $poId, string $status, ?string $requiredCurrentStatus = null): void
{
    if (!in_array($status, purchaseOrderStatuses(), true)) {
        throw new InvalidArgumentException('Invalid purchase order status.');
    }

    $sql = 'UPDATE purchase_orders SET status = :status WHERE po_id = :po_id';
    $params = [':status' => $status, ':po_id' => $poId];

    if ($requiredCurrentStatus !== null) {
        $sql .= ' AND status = :required_status';
        $params[':required_status'] = $requiredCurrentStatus;
    }

    $statement = $pdo->prepare($sql);
    $statement->execute($params);

    if ($statement->rowCount() === 0) {
        $checkStatement = $pdo->prepare('SELECT status FROM purchase_orders WHERE po_id = :po_id LIMIT 1');
        $checkStatement->execute([':po_id' => $poId]);
        $currentStatus = $checkStatement->fetchColumn();

        if ($currentStatus === false) {
            throw new InvalidArgumentException('Purchase order not found.');
        }

        if ($requiredCurrentStatus !== null && $currentStatus !== $requiredCurrentStatus) {
            throw new InvalidArgumentException("Only {$requiredCurrentStatus} purchase orders can be updated this way.");
        }
    }
}
?>
