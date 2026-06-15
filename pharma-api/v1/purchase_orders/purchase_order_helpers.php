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
    $pdo->exec("ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS variation_id INT NULL AFTER product_id");
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS supplier_products (
            supplier_product_id INT AUTO_INCREMENT PRIMARY KEY,
            supplier_id INT NOT NULL,
            product_id INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_supplier_product (supplier_id, product_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS purchase_order_receiving (
            receiving_id INT AUTO_INCREMENT PRIMARY KEY,
            po_id INT NOT NULL,
            received_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            remarks TEXT NULL,
            UNIQUE KEY unique_po_receiving (po_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS purchase_order_receiving_items (
            receiving_item_id INT AUTO_INCREMENT PRIMARY KEY,
            receiving_id INT NOT NULL,
            po_item_id INT NOT NULL,
            received_quantity INT NOT NULL DEFAULT 0,
            damaged_quantity INT NOT NULL DEFAULT 0,
            UNIQUE KEY unique_receiving_item (receiving_id, po_item_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS purchase_order_returns (
            return_id INT AUTO_INCREMENT PRIMARY KEY,
            po_id INT NOT NULL,
            po_item_id INT NOT NULL,
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
            inventory_id INT AUTO_INCREMENT PRIMARY KEY,
            product_id INT NOT NULL,
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
        if ((int) ($item['product_id'] ?? 0) <= 0 || (int) ($item['quantity'] ?? 0) <= 0) {
            throw new InvalidArgumentException('Each purchase-order item must have a valid product and quantity.');
        }

        if ((int) ($item['variation_id'] ?? 0) <= 0) {
            throw new InvalidArgumentException('Each purchase-order item must include a selected product variation.');
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

function validateProductsForSupplier(PDO $pdo, int $supplierId, array $items): void
{
    $statement = $pdo->prepare(
        'SELECT COUNT(*)
         FROM supplier_products sp
         INNER JOIN product_variations pv ON pv.product_id = sp.product_id
         WHERE sp.product_id = :product_id
           AND sp.supplier_id = :supplier_id
           AND pv.variation_id = :variation_id'
    );

    foreach ($items as $item) {
        $statement->execute([
            ':product_id' => (int) $item['product_id'],
            ':supplier_id' => $supplierId,
            ':variation_id' => (int) ($item['variation_id'] ?? 0)
        ]);

        if ((int) $statement->fetchColumn() !== 1) {
            throw new InvalidArgumentException('A purchase-order item variation is not assigned to the selected supplier.');
        }
    }
}

function updatePurchaseOrderStatus(PDO $pdo, int $poId, string $status, ?string $requiredCurrentStatus = null): void
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
