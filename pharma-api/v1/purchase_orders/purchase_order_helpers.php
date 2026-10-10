<?php
require_once __DIR__ . '/../activity_log_helpers.php';
require_once __DIR__ . '/../products/product_status_schema.php';
require_once __DIR__ . '/../suppliers/purchasing_conversion.php';
require_once __DIR__ . '/supplier_claim_helpers.php';
function ensurePurchaseOrderSchema(PDO $pdo): void
{
    $pdo->exec("ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS no_expiry TINYINT(1) NOT NULL DEFAULT 0");
    $pdo->exec("ALTER TABLE product_inventory ADD COLUMN IF NOT EXISTS no_expiry TINYINT(1) NOT NULL DEFAULT 0");
    $pdo->exec("ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(40) NULL");
    $pdo->exec("ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS expected_delivery_date DATE NULL");
    $pdo->exec("ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(40) NOT NULL DEFAULT 'Unpaid'");
    $pdo->exec("ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS approval_status ENUM('Pending','Approved','Rejected') NOT NULL DEFAULT 'Pending'");
    $pdo->exec("ALTER TABLE purchase_orders MODIFY approval_status ENUM('Pending','Approved','Revision Requested','Rejected') NOT NULL DEFAULT 'Pending'");
    $pdo->exec("ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS total_amount DECIMAL(12,2) NULL DEFAULT NULL");
    $pdo->exec("ALTER TABLE purchase_orders MODIFY total_amount DECIMAL(12,2) NULL DEFAULT NULL");
    $pdo->exec("ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS final_payment DECIMAL(12,2) NOT NULL DEFAULT 0.00");
    $pdo->exec("ALTER TABLE purchase_orders MODIFY status VARCHAR(40) NOT NULL DEFAULT 'Draft'");
    $pdo->exec("CREATE TABLE IF NOT EXISTS supplier_refunds (
        refund_id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
        claim_id CHAR(36) NOT NULL,
        amount_due DECIMAL(12,2) NOT NULL,
        amount_received DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        refund_status VARCHAR(30) NOT NULL DEFAULT 'Due',
        received_date DATE NULL,
        reference_number VARCHAR(100) NULL,
        recorded_by CHAR(36) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_supplier_refund_claim (claim_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS purchase_order_approval_audit (
            audit_id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
            po_id CHAR(36) NOT NULL,
            previous_approval_status VARCHAR(40) NOT NULL,
            new_approval_status VARCHAR(40) NOT NULL,
            action VARCHAR(40) NOT NULL,
            reason TEXT NULL,
            user_id CHAR(36) NULL,
            user_name VARCHAR(160) NULL,
            user_role VARCHAR(80) NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            KEY idx_po_approval_audit_po (po_id),
            KEY idx_po_approval_audit_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );
    $pdo->exec("UPDATE purchase_orders SET status = 'Delivered' WHERE status IN ('Return/Damage', 'Delivered with Return/Damage')");
    $pdo->exec("UPDATE purchase_orders SET status = 'Pending' WHERE LOWER(TRIM(status)) = 'in transit'");
    $pdo->exec("UPDATE purchase_orders SET status = 'Cancelled' WHERE approval_status = 'Rejected' AND status = 'Pending'");
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
    $pdo->exec("ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS unit_price_snapshot DECIMAL(12,4) NULL");
    $pdo->exec("ALTER TABLE purchase_order_items MODIFY unit_price_snapshot DECIMAL(12,4) NULL");
    $pdo->exec("ALTER TABLE purchase_order_items MODIFY line_total DECIMAL(10,2) NULL DEFAULT NULL");
    $pdo->exec("ALTER TABLE inventory_batches MODIFY unit_cost DECIMAL(12,4) NOT NULL DEFAULT 0.0000");
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
            inspection_status VARCHAR(40) NOT NULL DEFAULT 'Awaiting Inspection',
            inspected_by CHAR(36) NULL,
            UNIQUE KEY unique_po_receiving (po_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS purchase_order_receiving_items (
            receiving_item_id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
            receiving_id CHAR(36) NOT NULL,
            po_item_id CHAR(36) NOT NULL,
            received_quantity INT NOT NULL DEFAULT 0,
            UNIQUE KEY unique_receiving_item (receiving_id, po_item_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS supplier_claims (
            claim_id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
            po_item_id CHAR(36) NOT NULL,
            inventory_batch_id CHAR(36) NULL,
            affected_quantity INT NOT NULL DEFAULT 0,
            unit_conversion_id CHAR(36) NOT NULL,
            damage_reason VARCHAR(80) NOT NULL,
            disposition VARCHAR(40) NULL,
            resolution_type VARCHAR(40) NULL,
            claim_status VARCHAR(40) NOT NULL DEFAULT 'Awaiting Supplier Resolution',
            reported_by CHAR(36) NULL,
            remarks TEXT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            resolved_at TIMESTAMP NULL DEFAULT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );
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
        'Draft',
        'Pending',
        'Arrived',
        'Delivered',
        'Cancelled'
    ];
}

function activePurchaseOrderStatuses(): array
{
    return [
        'Draft',
        'Pending',
        'Arrived'
    ];
}

function approvalStatuses(): array
{
    return ['Pending', 'Approved', 'Revision Requested', 'Rejected'];
}

function completeDeliveryStatuses(): array
{
    return ['Delivered'];
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
    return validateDateNotBeforeToday(
        $date,
        'Expected delivery date must be a valid date.',
        'ETA cannot be earlier than today.'
    );
}

function validateDateNotBeforeToday(string $value, string $invalidMessage, string $pastMessage, bool $allowEmpty = false): ?string
{
    $date = trim($value);
    if ($date === '') {
        if ($allowEmpty) return null;
        throw new InvalidArgumentException($invalidMessage);
    }

    $parsed = DateTime::createFromFormat('!Y-m-d', $date);
    $errors = DateTime::getLastErrors();
    if (!$parsed || ($errors !== false && ($errors['warning_count'] > 0 || $errors['error_count'] > 0)) || $parsed->format('Y-m-d') !== $date) {
        throw new InvalidArgumentException($invalidMessage);
    }
    if ($date < date('Y-m-d')) {
        throw new InvalidArgumentException($pastMessage);
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

function updatePurchaseOrderApprovalStatus(PDO $pdo, string $poId, string $approvalStatus, ?string $requiredCurrentApproval = null, ?string $requiredCurrentStatus = null): void
{
    if (!in_array($approvalStatus, approvalStatuses(), true)) {
        throw new InvalidArgumentException('Invalid approval status.');
    }

    $sql = 'UPDATE purchase_orders SET approval_status = :approval_status WHERE po_id = :po_id';
    $params = [':approval_status' => $approvalStatus, ':po_id' => $poId];

    if ($requiredCurrentApproval !== null) {
        $sql .= ' AND approval_status = :required_approval_status';
        $params[':required_approval_status'] = $requiredCurrentApproval;
    }
    if ($requiredCurrentStatus !== null) {
        $sql .= ' AND status = :required_status';
        $params[':required_status'] = $requiredCurrentStatus;
    }

    $statement = $pdo->prepare($sql);
    $statement->execute($params);

    if ($statement->rowCount() === 0) {
        $checkStatement = $pdo->prepare('SELECT approval_status, status FROM purchase_orders WHERE po_id = :po_id LIMIT 1');
        $checkStatement->execute([':po_id' => $poId]);
        $current = $checkStatement->fetch(PDO::FETCH_ASSOC);
        if ($current === false) {
            throw new InvalidArgumentException('Purchase order not found.');
        }
        if ($requiredCurrentStatus !== null && $current['status'] !== $requiredCurrentStatus) {
            throw new InvalidArgumentException('Only pending purchase orders can be approved or rejected.');
        }
        throw new InvalidArgumentException('Purchase order approval status has already changed.');
    }
}

function recordPurchaseOrderApprovalAudit(PDO $pdo, string $poId, string $previousStatus, string $newStatus, string $action, string $reason = ''): void
{
    $statement = $pdo->prepare(
        'INSERT INTO purchase_order_approval_audit
            (audit_id, po_id, previous_approval_status, new_approval_status, action, reason, user_id, user_name, user_role)
         VALUES
            (:audit_id, :po_id, :previous_approval_status, :new_approval_status, :action, :reason, :user_id, :user_name, :user_role)'
    );
    $userName = trim((string) ($_SESSION['full_name'] ?? $_SESSION['username'] ?? ''));
    $statement->execute([
        ':audit_id' => newUuid($pdo),
        ':po_id' => $poId,
        ':previous_approval_status' => $previousStatus,
        ':new_approval_status' => $newStatus,
        ':action' => $action,
        ':reason' => trim($reason),
        ':user_id' => $_SESSION['user_id'] ?? null,
        ':user_name' => $userName !== '' ? $userName : null,
        ':user_role' => $_SESSION['role'] ?? null,
    ]);
}

function revokePurchaseOrderApproval(PDO $pdo, string $poId, string $reason): void
{
    $reason = trim($reason);
    if ($reason === '') {
        throw new InvalidArgumentException('A revoke reason is required.');
    }

    $statement = $pdo->prepare(
        "SELECT approval_status, status
         FROM purchase_orders
         WHERE po_id = :po_id
         LIMIT 1"
    );
    $statement->execute([':po_id' => $poId]);
    $current = $statement->fetch(PDO::FETCH_ASSOC);

    if ($current === false) {
        throw new InvalidArgumentException('Purchase order not found.');
    }
    if (($current['approval_status'] ?? '') !== 'Approved') {
        throw new InvalidArgumentException('Only approved purchase orders can have approval revoked.');
    }
    if (($current['status'] ?? '') !== 'Pending') {
        throw new InvalidArgumentException('Approval is locked once the purchase order has been processed or sent to the supplier.');
    }

    $update = $pdo->prepare(
        "UPDATE purchase_orders
         SET approval_status = 'Pending'
         WHERE po_id = :po_id
           AND approval_status = 'Approved'
           AND status = 'Pending'"
    );
    $update->execute([':po_id' => $poId]);

    if ($update->rowCount() === 0) {
        throw new InvalidArgumentException('Purchase order approval status has already changed.');
    }

    recordPurchaseOrderApprovalAudit($pdo, $poId, 'Approved', 'Pending', 'revoke_approval', $reason);
}

function validatePurchaseOrderItems(array $items): void
{
    if (count($items) === 0) {
        throw new InvalidArgumentException('At least one purchase-order item is required.');
    }

    $seenProductUnits = [];
    foreach ($items as $item) {
        $purchaseQtyRaw = $item['purchase_qty'] ?? $item['quantity'] ?? 0;
        $unitsPerPurchaseUnitRaw = $item['units_per_purchase_unit'] ?? 1;
        if (
            idIsMissing($item['product_id'] ?? null)
            || !is_numeric($purchaseQtyRaw)
            || (int) $purchaseQtyRaw <= 0
            || (float) $purchaseQtyRaw !== (float) (int) $purchaseQtyRaw
            || !is_numeric($unitsPerPurchaseUnitRaw)
            || (int) $unitsPerPurchaseUnitRaw <= 0
            || (float) $unitsPerPurchaseUnitRaw !== (float) (int) $unitsPerPurchaseUnitRaw
        ) {
            throw new InvalidArgumentException('Each purchase-order item must have a valid product and positive whole-number quantities.');
        }

        $purchaseUnit = preg_replace('/^by\s+/i', '', trim((string) ($item['purchase_unit'] ?? $item['unit'] ?? 'pcs')));
        $duplicateKey = cleanId($item['product_id'])
            . '|' . strtolower($purchaseUnit !== '' ? $purchaseUnit : 'pcs')
            . '|' . (int) $unitsPerPurchaseUnitRaw;
        if (isset($seenProductUnits[$duplicateKey])) {
            throw new InvalidArgumentException('The same product and purchase-unit combination cannot appear more than once.');
        }
        $seenProductUnits[$duplicateKey] = true;
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
    return cleanTransactionalText($item[$field] ?? '');
}

function cleanTransactionalText($value): ?string
{
    $text = trim((string) $value);
    $normalized = strtolower($text);
    $invalidValues = ['', 'n/a', 'not provided', 'null', 'undefined', '-', "\u{2013}", "\u{2014}"];
    $containsMojibakeDash = str_contains($text, "\u{00E2}\u{20AC}")
        || str_contains($text, "\u{00C3}\u{00A2}");

    return in_array($normalized, $invalidValues, true) || $containsMojibakeDash ? null : $text;
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

function positivePurchaseOrderInt($value, string $message): int
{
    if (!is_numeric($value) || (int) $value <= 0 || (float) $value !== (float) (int) $value) {
        throw new InvalidArgumentException($message);
    }
    return (int) $value;
}

function purchaseOrderMoneyCents($value, string $message): int
{
    if (!is_numeric($value) || !is_finite((float) $value) || (float) $value < 0) {
        throw new InvalidArgumentException($message);
    }

    return (int) round((float) $value * 100, 0, PHP_ROUND_HALF_UP);
}

function calculatedPurchaseOrderItemAmounts(array $item): array
{
    $purchaseQty = positivePurchaseOrderInt($item['purchase_qty'] ?? $item['quantity'] ?? 1, 'Order quantity must be a positive whole number.');
    $unitsPerPurchaseUnit = positivePurchaseOrderInt($item['units_per_purchase_unit'] ?? 1, 'Units per Purchase Unit must be a positive whole number.');
    $unitPriceCents = purchaseOrderMoneyCents($item['price'] ?? 0, 'Supplier cost per base unit must be zero or greater.');
    $inventoryQtyOrdered = inventoryQuantityForPurchaseQuantity($purchaseQty, $unitsPerPurchaseUnit);
    $lineTotalCents = $inventoryQtyOrdered * $unitPriceCents;

    if ($inventoryQtyOrdered > PHP_INT_MAX || $lineTotalCents > PHP_INT_MAX) {
        throw new InvalidArgumentException('The purchase-order item total is too large.');
    }

    return [
        'purchase_qty' => $purchaseQty,
        'units_per_purchase_unit' => $unitsPerPurchaseUnit,
        'inventory_qty_ordered' => $inventoryQtyOrdered,
        'unit_price' => (float) ($unitPriceCents / 100),
        'line_total' => (float) ($lineTotalCents / 100),
        'line_total_cents' => $lineTotalCents,
    ];
}

function purchaseOrderQuantityParams(array $item): array
{
    $calculation = calculatedPurchaseOrderItemAmounts($item);

    return [
        ':quantity' => $calculation['inventory_qty_ordered'],
        ':purchase_qty' => $calculation['purchase_qty'],
        ':purchase_unit_snapshot' => cleanSnapshotText($item, 'purchase_unit') ?: cleanSnapshotText($item, 'unit'),
        ':units_per_purchase_unit_snapshot' => $calculation['units_per_purchase_unit'],
        ':inventory_qty_ordered' => $calculation['inventory_qty_ordered'],
        ':line_total' => $calculation['line_total']
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

function validateProductsForSupplier(PDO $pdo, string $supplierId, array $items, ?string $existingPoId = null): void
{
    $statement = $pdo->prepare(
        'SELECT p.status
         FROM supplier_products sp
         INNER JOIN product p ON p.product_id = sp.product_id
         WHERE sp.product_id = :product_id
           AND sp.supplier_id = :supplier_id
         LIMIT 1'
    );
    $existingItemStatement = $existingPoId !== null
        ? $pdo->prepare(
            'SELECT COUNT(*)
             FROM purchase_order_items
             WHERE po_id = :po_id
               AND po_item_id = :po_item_id
               AND product_id = :product_id'
        )
        : null;

    foreach ($items as $item) {
        $productId = cleanId($item['product_id']);
        $statement->execute([
            ':product_id' => $productId,
            ':supplier_id' => $supplierId
        ]);
        $productStatus = $statement->fetchColumn();

        if ($productStatus === false) {
            throw new InvalidArgumentException('A purchase-order item is not assigned to the selected supplier.');
        }

        if (strcasecmp(trim((string) $productStatus), 'Active') !== 0) {
            $isUnchangedExistingLine = false;
            $poItemId = cleanId($item['po_item_id'] ?? null);
            if ($existingItemStatement && $poItemId !== '') {
                $existingItemStatement->execute([
                    ':po_id' => $existingPoId,
                    ':po_item_id' => $poItemId,
                    ':product_id' => $productId,
                ]);
                $isUnchangedExistingLine = (int) $existingItemStatement->fetchColumn() === 1;
            }
            if (!$isUnchangedExistingLine) {
                throw new InvalidArgumentException('Inactive products cannot be added to a new purchase order.');
            }
        }
    }
}

function validatePurchaseOrderSupplier(PDO $pdo, string $supplierId): void
{
    $statement = $pdo->prepare('SELECT COUNT(*) FROM suppliers WHERE supplier_id = :supplier_id');
    $statement->execute([':supplier_id' => $supplierId]);
    if ((int) $statement->fetchColumn() !== 1) {
        throw new InvalidArgumentException('The selected supplier does not exist.');
    }
}

function validateSubmittedPurchaseOrderTotals(array $payload, array $items): float
{
    $subtotalCents = 0;
    foreach ($items as $index => $item) {
        if (!array_key_exists('line_total', $item)) {
            throw new InvalidArgumentException('Each purchase-order item must include its calculated line total.');
        }
        $calculation = calculatedPurchaseOrderItemAmounts($item);
        $submittedLineCents = purchaseOrderMoneyCents($item['line_total'], 'Submitted line total must be a valid amount.');
        if ($submittedLineCents !== $calculation['line_total_cents']) {
            throw new InvalidArgumentException('Line ' . ($index + 1) . ' total does not match the supplier cost and package quantity. Refresh the products and try again.');
        }
        $subtotalCents += $calculation['line_total_cents'];
    }

    foreach (['subtotal' => 'Subtotal', 'grand_total' => 'Grand total'] as $field => $label) {
        if (!array_key_exists($field, $payload)) {
            throw new InvalidArgumentException("{$label} is required.");
        }
        if (purchaseOrderMoneyCents($payload[$field], "{$label} must be a valid amount.") !== $subtotalCents) {
            throw new InvalidArgumentException("{$label} does not match the server-calculated purchase-order total.");
        }
    }

    return (float) ($subtotalCents / 100);
}

function supplierProductSetupByProduct(PDO $pdo, string $supplierId, array $items): array
{
    ensureProductStatusColumn($pdo);
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
            COALESCE(NULLIF(sp.purchase_unit, ''), 'pcs') AS purchase_unit,
            COALESCE(NULLIF(sp.inventory_unit, ''), 'pc') AS inventory_unit,
            COALESCE(sp.units_per_purchase_unit, 1) AS units_per_purchase_unit
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
        $unitsPerPurchaseUnit = positivePurchaseOrderInt(
            $setup['units_per_purchase_unit'] ?? $item['units_per_purchase_unit'] ?? 1,
            'Units per Purchase Unit must be numeric and greater than 0.'
        );
        $purchaseUnit = preg_replace('/^by\s+/i', '', trim((string) ($setup['purchase_unit'] ?? $item['purchase_unit'] ?? $item['unit'] ?? 'pcs')));
        $supplierCost = $setup['supplier_cost_price'] ?? null;

        $item['purchase_unit'] = $purchaseUnit !== '' ? $purchaseUnit : 'pcs';
        $item['unit'] = trim((string) ($setup['inventory_unit'] ?? $item['unit'] ?? 'pc')) ?: 'pc';
        $item['units_per_purchase_unit'] = $unitsPerPurchaseUnit;
        if ($supplierCost !== null && $supplierCost !== '') {
            $item['price'] = (float) $supplierCost;
        }

        $purchaseQty = positivePurchaseOrderInt($item['purchase_qty'] ?? $item['quantity'] ?? 1, 'Order quantity must be numeric and greater than 0.');
        $item['purchase_qty'] = $purchaseQty;
        $item['inventory_qty_ordered'] = $purchaseQty * $unitsPerPurchaseUnit;
        $item['quantity'] = $item['inventory_qty_ordered'];
        $hydratedItems[] = $item;
    }

    return $hydratedItems;
}

function assertPurchaseOrderHasProducts(PDO $pdo, string $poId): void
{
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM purchase_order_items poi INNER JOIN product p ON p.product_id=poi.product_id WHERE poi.po_id=? AND poi.quantity>0');
    $stmt->execute([$poId]);
    if ((int)$stmt->fetchColumn() < 1) throw new InvalidArgumentException('Invalid Purchase Order: no products.');
}

function updatePurchaseOrderStatus(PDO $pdo, string $poId, string $status, ?string $requiredCurrentStatus = null): void
{
    if (!in_array($status, purchaseOrderStatuses(), true)) {
        throw new InvalidArgumentException('Invalid purchase order status.');
    }
    if (!in_array($status, ['Cancelled', 'Rejected'], true)) {
        $exists = $pdo->prepare('SELECT po_id FROM purchase_orders WHERE po_id = :po_id LIMIT 1');
        $exists->execute([':po_id' => $poId]);
        if ($exists->fetchColumn() === false) {
            throw new InvalidArgumentException('Purchase order not found.');
        }
        assertPurchaseOrderHasProducts($pdo, $poId);
    }

    $sql = 'UPDATE purchase_orders SET status = :status WHERE po_id = :po_id';
    $params = [':status' => $status, ':po_id' => $poId];

    if ($requiredCurrentStatus !== null) {
        $sql .= ' AND status = :required_status';
        $params[':required_status'] = $requiredCurrentStatus;
    }

    $statement = $pdo->prepare($sql);
    $statement->execute($params);
    $changed = $statement->rowCount() > 0;

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

    if ($changed) {
        $poStmt = $pdo->prepare('SELECT po_number FROM purchase_orders WHERE po_id = :po_id LIMIT 1');
        $poStmt->execute([':po_id' => $poId]);
        $poNumber = trim((string) $poStmt->fetchColumn()) ?: $poId;
        recordActivityLog($pdo, 'Purchase Order', $status, 'PO ' . $poNumber . ' is ' . $status, $poId);
    }
}

function parsePurchaseOrderReturnRemarks(?string $storedRemarks): array
{
    $stored = (string) $storedRemarks;
    $prefix = '[RETURN_META_V1]';
    if (!str_starts_with($stored, $prefix)) {
        return ['metadata' => [], 'remarks' => trim($stored)];
    }
    $lineEnd = strpos($stored, "\n");
    $json = $lineEnd === false ? substr($stored, strlen($prefix)) : substr($stored, strlen($prefix), $lineEnd - strlen($prefix));
    $metadata = json_decode($json, true);
    return [
        'metadata' => is_array($metadata) ? $metadata : [],
        'remarks' => $lineEnd === false ? '' : trim(substr($stored, $lineEnd + 1))
    ];
}

function buildPurchaseOrderReturnRemarks(array $metadata, string $remarks): string
{
    return trim($remarks);
}

function decoratePurchaseOrderReturnRecord(array $record): array
{
    $parsed = parsePurchaseOrderReturnRemarks($record['remarks'] ?? '');
    $metadata = $parsed['metadata'];
    $record['remarks'] = $parsed['remarks'];
    $record['resolution'] = $metadata['resolution'] ?? supplierClaimLegacyResolution($record['resolution_type'] ?? null, $record['disposition'] ?? null);
    $record['delivered_quantity'] = (int) ($record['delivered_quantity'] ?? $metadata['delivered_quantity'] ?? ($record['received_quantity'] ?? 0));
    $record['missing_quantity'] = (int) ($record['missing_quantity'] ?? $metadata['missing_quantity'] ?? 0);
    $record['supplier_adjustment'] = (float) ($record['supplier_adjustment'] ?? $metadata['supplier_adjustment'] ?? 0);
    $record['replacement_expected_qty'] = (int) ($record['replacement_expected_qty'] ?? $metadata['replacement_expected_qty'] ?? (($record['resolution_type'] ?? '') === 'Replacement' ? ($record['affected_base_quantity'] ?? 0) : 0));
    $record['replacement_received_qty'] = (int) ($record['replacement_received_qty'] ?? $metadata['replacement_received_qty'] ?? 0);
    $record['replacement_outstanding_qty'] = max(0, $record['replacement_expected_qty'] - $record['replacement_received_qty']);
    $record['parent_return_id'] = $record['parent_return_id'] ?? $metadata['parent_return_id'] ?? null;
    $record['requested_resolution_type'] = $record['requested_resolution_type'] ?? $metadata['requested_resolution_type'] ?? ($record['resolution_type'] ?? null);
    $record['management_remarks'] = trim((string) ($record['management_remarks'] ?? $metadata['management_remarks'] ?? ''));
    $record['inspection_remarks'] = $record['remarks'];
    return $record;
}
?>
