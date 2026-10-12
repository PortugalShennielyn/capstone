<?php
require_once __DIR__ . '/../activity_log_helpers.php';
require_once __DIR__ . '/sales_financials.php';
require_once __DIR__ . '/../products/product_selling_options.php';
require_once __DIR__ . '/../inventory/expiry_status_helpers.php';

function salesReadJsonBody(): array
{
    $raw = file_get_contents('php://input');
    $data = json_decode($raw ?: '{}', true);
    return is_array($data) ? $data : [];
}

if (!function_exists('salesColumnExists')) {
    function salesColumnExists(PDO $pdo, string $table, string $column): bool
    {
        $stmt = $pdo->prepare(
            'SELECT COUNT(*)
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = :table
               AND COLUMN_NAME = :column'
        );
        $stmt->execute([
            ':table' => $table,
            ':column' => $column,
        ]);
        return (int) $stmt->fetchColumn() > 0;
    }
}

function ensureSalesOrderCashSchema(PDO $pdo): void
{
    if (!salesColumnExists($pdo, 'sales_orders', 'cash_received')) {
        $pdo->exec('ALTER TABLE sales_orders ADD COLUMN cash_received DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER total_amount');
    }
    if (!salesColumnExists($pdo, 'sales_orders', 'change_amount')) {
        $pdo->exec('ALTER TABLE sales_orders ADD COLUMN change_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER cash_received');
    }
}

function salesCurrentUserId(): string
{
    return trim((string) ($_SESSION['user_id'] ?? ''));
}

function salesCurrentUserName(): string
{
    return trim((string) ($_SESSION['full_name'] ?? $_SESSION['username'] ?? 'Sales Clerk'));
}

function salesCurrentUserIsSalesClerk(): bool
{
    $roles = array_merge(
        [$_SESSION['role'] ?? ''],
        is_array($_SESSION['roles'] ?? null) ? $_SESSION['roles'] : [],
        is_array($_SESSION['role_identifiers'] ?? null) ? $_SESSION['role_identifiers'] : []
    );

    foreach ($roles as $role) {
        $normalized = strtolower(trim((string) $role));
        $normalized = str_replace([' ', '-'], ['', '_'], $normalized);
        if (in_array($normalized, ['salesclerk', 'sales_clerk', 'rosalesclerk', 'ro_sales_clerk'], true)) {
            return true;
        }
    }

    return false;
}

function salesStatusLabel(string $status): string
{
    $labels = [
        'draft' => 'Draft',
        'waiting_cashier' => 'Waiting for Cashier',
        'accepted_by_cashier' => 'Accepted by Cashier',
        'processing_payment' => 'Processing Payment',
        'completed' => 'Completed',
        'paid' => 'Completed',
        'cancelled' => 'Cancelled',
        'rejected' => 'Rejected',
    ];

    return $labels[$status] ?? ucwords(str_replace('_', ' ', $status));
}

function salesClerkStatusGroup(string $status): string
{
    if (in_array($status, ['accepted_by_cashier', 'processing_payment', 'processing'], true)) {
        return 'processing';
    }

    if ($status === 'paid') {
        return 'completed';
    }

    return $status;
}

function salesClerkStatusLabel(string $status): string
{
    return salesClerkStatusGroup($status) === 'processing' ? 'Processing' : salesStatusLabel($status);
}

function salesSpecificationValue($value): string
{
    $text = trim((string) ($value ?? ''));
    if (in_array(strtolower($text), ['null', 'undefined', 'n/a'], true)) {
        return '';
    }

    if ($text !== '' && is_numeric($text) && str_contains($text, '.')) {
        $text = rtrim(rtrim($text, '0'), '.');
    }

    return $text;
}

function salesSpecificationText($value): string
{
    $text = trim((string) ($value ?? ''));
    return in_array(strtolower($text), ['null', 'undefined', 'n/a'], true) ? '' : $text;
}

function salesSpecificationUnit($value): string
{
    $unit = salesSpecificationText($value);
    $normalized = strtolower($unit);
    return [
        'ml' => 'mL',
        'l' => 'L',
        'mg' => 'mg',
        'mcg' => 'mcg',
        'g' => 'g',
        'kg' => 'kg',
        'iu' => 'IU',
        'pcs' => 'pcs',
        '%' => '%',
    ][$normalized] ?? $unit;
}

function salesSpecificationMeasurement($value, $unit): string
{
    $amount = salesSpecificationValue($value);
    $normalizedUnit = salesSpecificationUnit($unit);
    if ($amount === '') {
        return '';
    }
    if ($normalizedUnit === '') {
        return $amount;
    }
    return $normalizedUnit === '%' ? $amount . '%' : $amount . ' ' . $normalizedUnit;
}

function salesSpecificationContent($value, $unit): string
{
    $measurement = salesSpecificationMeasurement($value, $unit);
    return $measurement !== '' ? $measurement : salesSpecificationUnit($unit);
}

function salesBuildSpecification(array $row): string
{
    $parts = [];
    $category = strtolower(salesSpecificationText($row['category_name'] ?? ''));
    if ($category === 'medicine') {
        $values = [
            $row['generic_name'] ?? '',
            salesSpecificationMeasurement($row['strength_value'] ?? '', $row['strength_unit'] ?? '')
                ?: salesSpecificationText($row['strength'] ?? ''),
            $row['dosage_form'] ?? '',
            salesSpecificationContent(
                $row['net_content_value'] ?? $row['volume_value'] ?? '',
                $row['net_content_unit'] ?? $row['volume_unit'] ?? ''
            ),
        ];
    } elseif (in_array($category, ['medical supply', 'medical supplies'], true)) {
        $values = [
            $row['medical_variant'] ?? $row['variant'] ?? '',
            $row['medical_size'] ?? $row['size'] ?? '',
            $row['material'] ?? '',
            $row['sterile_status'] ?? '',
        ];
    } else {
        $values = [
            $row['variant'] ?? $row['variant_flavor'] ?? '',
            $row['size'] ?? $row['size_value'] ?? '',
            salesSpecificationMeasurement(
                $row['net_weight'] ?? $row['weight_volume_value'] ?? '',
                $row['grocery_unit'] ?? $row['weight_volume_unit'] ?? $row['unit'] ?? ''
            ),
        ];
    }

    foreach ($values as $value) {
        $value = salesSpecificationText($value);
        $exists = array_filter($parts, static fn ($part) => strcasecmp($part, $value) === 0);
        if ($value !== '' && !$exists) {
            $parts[] = $value;
        }
    }

    return implode(' • ', $parts);
}

function salesResolvedProductName(array $row): string
{
    $brand = trim((string) ($row['brand_name'] ?? ''));
    $product = trim((string) ($row['product_name'] ?? ''));
    $generic = trim((string) ($row['generic_name'] ?? ''));
    $category = strtolower(trim((string) ($row['category_name'] ?? '')));

    if ($category === 'medicine' && $generic !== '') {
        return $generic;
    }

    if ($product !== '' && strcasecmp($product, $brand) !== 0) {
        return $product;
    }

    return $generic !== '' ? $generic : ($product !== '' ? $product : $brand);
}

function salesProductStock(PDO $pdo, string $productId): int
{
    $stmt = $pdo->prepare(
        'SELECT COALESCE(SUM(pss.quantity_remaining - pss.expiry_quarantined_qty), 0)
         FROM product_selling_stock pss
         LEFT JOIN inventory_batches ib ON ib.batch_id = pss.source_batch_id
         WHERE pss.product_id = :product_id
           AND pss.quantity_remaining > pss.expiry_quarantined_qty
           AND (COALESCE(ib.expiry_date, pss.expiration_date) IS NULL OR COALESCE(ib.expiry_date, pss.expiration_date) > CURDATE())
           AND COALESCE(ib.expiry_action_status, \'\') NOT IN (\'For Disposal\', \'Disposed\')'
    );
    $stmt->execute([':product_id' => $productId]);
    return (int) $stmt->fetchColumn();
}

function salesGenerateOrderNo(PDO $pdo): string
{
    $prefix = 'SO-' . date('md') . '-';
    $stmt = $pdo->prepare(
        'SELECT order_no
         FROM sales_orders
         WHERE order_no LIKE :prefix
         ORDER BY order_no DESC
         LIMIT 1'
    );
    $stmt->execute([':prefix' => $prefix . '%']);
    $last = (string) ($stmt->fetchColumn() ?: '');
    $next = 1;

    if (preg_match('/(\d+)$/', $last, $matches)) {
        $next = ((int) $matches[1]) + 1;
    }

    return $prefix . str_pad((string) $next, 4, '0', STR_PAD_LEFT);
}

function salesLoadProductsByIds(PDO $pdo, array $productIds): array
{
    $productIds = array_values(array_unique(array_filter(array_map('strval', $productIds))));
    if (!$productIds) {
        return [];
    }

    $placeholders = implode(',', array_fill(0, count($productIds), '?'));
    $sql = "SELECT
                p.product_id,
                p.brand_name,
                p.product_name,
                p.price,
                p.status,
                pc.category_name,
                md.generic_name,
                md.strength,
                md.strength_value,
                md.strength_unit,
                md.dosage_form,
                md.net_content_value,
                md.net_content_unit,
                md.package_type AS medicine_package_type,
                gd.variant,
                gd.size,
                gd.net_weight,
                gd.unit AS grocery_unit,
                gd.package_type AS grocery_package_type,
                msd.variant AS medical_variant,
                msd.size AS medical_size,
                msd.material,
                msd.sterile_status,
                msd.package_type AS medical_package_type,
                msd.pack_content AS medical_pack_content,
                COALESCE(stock.available_stock, 0) AS available_stock,
                stock.first_expiry_date,
                stock.first_days_until_expiry,
                stock.first_batch_number
            FROM product p
            LEFT JOIN product_categories pc ON pc.category_id = p.category_id
            LEFT JOIN medicine_details md ON md.product_id = p.product_id
            LEFT JOIN grocery_details gd ON gd.product_id = p.product_id
            LEFT JOIN medical_supply_details msd ON msd.product_id = p.product_id
            LEFT JOIN (
                SELECT pss.product_id,
                       SUM(CASE WHEN pss.quantity_remaining > pss.expiry_quarantined_qty
                                     AND (COALESCE(ib.expiry_date, pss.expiration_date) IS NULL OR COALESCE(ib.expiry_date, pss.expiration_date) > CURDATE())
                                     AND COALESCE(ib.expiry_action_status, '') NOT IN ('For Disposal', 'Disposed')
                                THEN pss.quantity_remaining - pss.expiry_quarantined_qty ELSE 0 END) AS available_stock,
                       SUM(CASE WHEN pss.quantity_remaining > pss.expiry_quarantined_qty
                                     AND (COALESCE(ib.expiry_date, pss.expiration_date) IS NULL OR COALESCE(ib.expiry_date, pss.expiration_date) > CURDATE())
                                     AND COALESCE(ib.expiry_action_status, '') NOT IN ('For Disposal', 'Disposed')
                                THEN pss.quantity_remaining - pss.expiry_quarantined_qty ELSE 0 END) AS shelf_stock,
                       SUBSTRING_INDEX(GROUP_CONCAT(CASE WHEN pss.quantity_remaining > pss.expiry_quarantined_qty
                                                               AND (COALESCE(ib.expiry_date, pss.expiration_date) IS NULL OR COALESCE(ib.expiry_date, pss.expiration_date) > CURDATE())
                                                               AND COALESCE(ib.expiry_action_status, '') NOT IN ('For Disposal', 'Disposed')
                                                          THEN COALESCE(ib.expiry_date, pss.expiration_date) END
                                                          ORDER BY COALESCE(ib.expiry_date, pss.expiration_date) IS NULL,
                                                                   COALESCE(ib.expiry_date, pss.expiration_date), pss.created_at, pss.selling_stock_id), ',', 1) AS first_expiry_date,
                       SUBSTRING_INDEX(GROUP_CONCAT(CASE WHEN pss.quantity_remaining > pss.expiry_quarantined_qty
                                                               AND (COALESCE(ib.expiry_date, pss.expiration_date) IS NULL OR COALESCE(ib.expiry_date, pss.expiration_date) > CURDATE())
                                                               AND COALESCE(ib.expiry_action_status, '') NOT IN ('For Disposal', 'Disposed')
                                                          THEN DATEDIFF(COALESCE(ib.expiry_date, pss.expiration_date), CURDATE()) END
                                                          ORDER BY COALESCE(ib.expiry_date, pss.expiration_date) IS NULL,
                                                                   COALESCE(ib.expiry_date, pss.expiration_date), pss.created_at, pss.selling_stock_id), ',', 1) AS first_days_until_expiry,
                       SUBSTRING_INDEX(GROUP_CONCAT(CASE WHEN pss.quantity_remaining > pss.expiry_quarantined_qty
                                                               AND (COALESCE(ib.expiry_date, pss.expiration_date) IS NULL OR COALESCE(ib.expiry_date, pss.expiration_date) > CURDATE())
                                                               AND COALESCE(ib.expiry_action_status, '') NOT IN ('For Disposal', 'Disposed')
                                                          THEN pss.batch_number END
                                                          ORDER BY COALESCE(ib.expiry_date, pss.expiration_date) IS NULL,
                                                                   COALESCE(ib.expiry_date, pss.expiration_date), pss.created_at, pss.selling_stock_id), ',', 1) AS first_batch_number
                FROM product_selling_stock pss
                LEFT JOIN inventory_batches ib ON ib.batch_id = pss.source_batch_id
                GROUP BY pss.product_id
            ) stock ON stock.product_id = p.product_id
            WHERE p.product_id IN ({$placeholders})";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($productIds);

    $products = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $row['specification'] = salesBuildSpecification($row);
        $row['product_name'] = salesResolvedProductName($row);
        $row['available_stock'] = (int) ($row['available_stock'] ?? 0);
        $row['first_expiry_status'] = inventoryExpiryStatus($row['first_expiry_date'] ?? null, $row['first_days_until_expiry'] ?? null);
        $row['price'] = round((float) ($row['price'] ?? 0), 2);
        $products[(string) $row['product_id']] = $row;
    }

    foreach ($products as &$product) {
        $product['selling_units'] = productSellingOptions($pdo, (string) $product['product_id'], true);
        $defaultOption = productDefaultSellingOption($pdo, (string) $product['product_id']);
        if ($defaultOption) $product['price'] = $defaultOption['selling_price'];
    }
    unset($product);

    return $products;
}

function salesNormalizeCartItems(array $items): array
{
    $normalized = [];
    foreach ($items as $item) {
        if (!is_array($item)) {
            continue;
        }

        $productId = trim((string) ($item['product_id'] ?? ''));
        $quantity = (int) ($item['quantity'] ?? 0);
        $unit = trim((string) ($item['unit'] ?? ''));
        if ($productId === '' || $quantity <= 0) {
            continue;
        }

        $key = $productId . "\0" . mb_strtolower($unit);
        if (!isset($normalized[$key])) {
            $normalized[$key] = [
                'product_id' => $productId,
                'quantity' => 0,
                'unit' => $unit,
            ];
        }
        $normalized[$key]['quantity'] += $quantity;
    }

    return array_values($normalized);
}

function salesWriteOrderItems(PDO $pdo, int $orderId, array $items, array $products): float
{
    $delete = $pdo->prepare('DELETE FROM sales_order_items WHERE order_id = :order_id');
    $delete->execute([':order_id' => $orderId]);

    $insert = $pdo->prepare(
        'INSERT INTO sales_order_items
            (order_id, product_id, product_name, brand_name, specification, selected_quantity, selected_unit, unit_base_quantity, quantity, unit_price, line_total)
         VALUES
            (:order_id, :product_id, :product_name, :brand_name, :specification, :selected_quantity, :selected_unit, :unit_base_quantity, :quantity, :unit_price, :line_total)'
    );

    $total = 0.0;
    foreach ($items as $item) {
        $product = $products[$item['product_id']];
        $selectedQuantity = (int) $item['quantity'];
        $requestedUnit = trim((string) ($item['unit'] ?? ''));
        $sellingUnit = null;
        foreach ($product['selling_units'] as $candidate) if ($requestedUnit === '' || strcasecmp($candidate['unit'], $requestedUnit) === 0) { $sellingUnit=$candidate; break; }
        if (!$sellingUnit) throw new InvalidArgumentException('The selected selling unit is not valid for ' . $product['product_name'] . '.');
        $factor = (int) $sellingUnit['base_quantity'];
        $quantity = sellingUnitBaseQuantity($selectedQuantity, $factor);
        $unitPrice = round((float) $sellingUnit['selling_price'], 2);
        $lineTotal = round($selectedQuantity * $unitPrice, 2);
        $total += $lineTotal;

        $insert->execute([
            ':order_id' => $orderId,
            ':product_id' => $product['product_id'],
            ':product_name' => $product['product_name'],
            ':brand_name' => $product['brand_name'],
            ':specification' => $product['specification'],
            ':selected_quantity' => $selectedQuantity,
            ':selected_unit' => $sellingUnit['unit'],
            ':unit_base_quantity' => $factor,
            ':quantity' => $quantity,
            ':unit_price' => $unitPrice,
            ':line_total' => $lineTotal,
        ]);
    }

    return round($total, 2);
}

function salesOrderTotalFromPayload(array $payload, float $subtotal): float
{
    return salesOrderTotalsFromPayload($payload, $subtotal)['total_amount'];
}

function salesOrderTotalsFromPayload(array $payload, float $subtotal): array
{
    $totals = salesVatInclusiveBreakdown(
        $subtotal,
        (float) ($payload['discount'] ?? 0)
    );

    return [
        'subtotal' => $totals['subtotal'],
        'discount' => $totals['discount_amount'],
        'vatable_sales' => $totals['vatable_sales'],
        'vat' => $totals['vat'],
        'total_amount' => $totals['total_amount'],
    ];
}

function salesCashTotalsFromPayload(array $payload, float $totalAmount): array
{
    $cashReceived = round(max(0, (float) ($payload['cash_received'] ?? 0)), 2);
    return [
        'cash_received' => $cashReceived,
        'change_amount' => round(max(0, $cashReceived - max(0, $totalAmount)), 2),
    ];
}

function salesRecordStatusChange(PDO $pdo, int $orderId, ?string $oldStatus, string $newStatus, ?string $changedBy, string $remarks): bool
{
    if ($oldStatus !== null && $oldStatus === $newStatus) {
        return false;
    }

    $history = $pdo->prepare(
        "INSERT INTO sales_order_status_history
            (order_id, old_status, new_status, changed_by, remarks)
         VALUES
            (:order_id, :old_status, :new_status, :changed_by, :remarks)"
    );
    $history->execute([
        ':order_id' => $orderId,
        ':old_status' => $oldStatus,
        ':new_status' => $newStatus,
        ':changed_by' => $changedBy,
        ':remarks' => $remarks,
    ]);

    $orderStmt = $pdo->prepare('SELECT order_no, total_amount FROM sales_orders WHERE order_id = :order_id LIMIT 1');
    $orderStmt->execute([':order_id' => $orderId]);
    $order = $orderStmt->fetch(PDO::FETCH_ASSOC) ?: [];
    $orderNo = trim((string) ($order['order_no'] ?? ''));
    $orderLabel = $orderNo !== '' ? $orderNo : (string) $orderId;
    $module = in_array($newStatus, ['accepted_by_cashier', 'processing_payment', 'completed'], true) ? 'Cashier' : 'Sales';
    $actionLabels = [
        'draft' => 'Created',
        'waiting_cashier' => 'Sent to Cashier',
        'accepted_by_cashier' => 'Accepted',
        'processing_payment' => 'Processing Payment',
        'completed' => 'Completed',
        'cancelled' => 'Cancelled',
        'rejected' => 'Rejected',
    ];
    $descriptions = [
        'draft' => 'Sales Clerk created Order #' . $orderLabel,
        'waiting_cashier' => 'Sales Clerk sent Order #' . $orderLabel . ' to Cashier',
        'accepted_by_cashier' => 'Cashier accepted Order #' . $orderLabel,
        'processing_payment' => 'Cashier is processing payment for Order #' . $orderLabel,
        'completed' => 'Cashier completed Sale #' . $orderLabel,
        'cancelled' => 'Sales Clerk cancelled Order #' . $orderLabel,
        'rejected' => 'Cashier rejected Order #' . $orderLabel,
    ];
    recordActivityLog(
        $pdo,
        $module,
        $actionLabels[$newStatus] ?? salesStatusLabel($newStatus),
        $descriptions[$newStatus] ?? ('Sales order #' . $orderLabel . ' is ' . salesStatusLabel($newStatus)),
        (string) $orderId,
        $changedBy,
        null,
        false
    );

    $auditActions = [
        'draft' => ['TRANSACTION_CREATED', 'created order'],
        'waiting_cashier' => ['TRANSACTION_SENT_TO_CASHIER', 'sent order to cashier'],
        'accepted_by_cashier' => ['TRANSACTION_ACCEPTED', 'accepted order'],
        'processing_payment' => ['TRANSACTION_PAYMENT_PROCESSING', 'started payment for order'],
        'cancelled' => ['TRANSACTION_CANCELLED', 'cancelled order'],
        'rejected' => ['TRANSACTION_REJECTED', 'rejected order'],
    ];
    if ($newStatus !== 'completed') {
        [$auditAction, $descriptionAction] = $auditActions[$newStatus]
            ?? ['TRANSACTION_STATUS_CHANGED', 'changed order status to ' . salesStatusLabel($newStatus)];
        $actor = salesCurrentUserName() ?: 'System';
        $details = [
            'order_id' => $orderId,
            'order_no' => $orderNo !== '' ? $orderNo : null,
            'transaction_id' => $orderNo !== '' ? $orderNo : (string) $orderId,
            'amount' => isset($order['total_amount']) ? (float) $order['total_amount'] : null,
            'previous_status' => $oldStatus,
            'status' => $newStatus,
            'status_label' => salesStatusLabel($newStatus),
            'remarks' => $remarks,
        ];
        if ($newStatus === 'cancelled') {
            $details['cancellation_reason'] = $remarks;
            $details['operation'] = 'cancelled before payment';
        }
        recordSalesAudit(
            $pdo,
            $auditAction,
            $actor . ' ' . $descriptionAction . ' #' . $orderLabel . '.',
            $orderId,
            $details
        );
    }

    return true;
}

function salesValidateCartStock(array $items, array $products): array
{
    $requestedByProduct = [];
    foreach ($items as $item) {
        $product = $products[$item['product_id']] ?? null;
        if (!$product) {
            return [false, 'A selected product is no longer available.'];
        }

        if (strcasecmp(trim((string) ($product['status'] ?? 'Active')), 'Active') !== 0) {
            return [
                false,
                sprintf(
                    '%s is now inactive. Remove it from the order before continuing.',
                    $product['product_name'] ?? 'Selected product'
                ),
            ];
        }

        $requestedUnit = trim((string) ($item['unit'] ?? ''));
        $factor = null;
        foreach (($product['selling_units'] ?? []) as $unit) if ($requestedUnit === '' || strcasecmp($unit['unit'], $requestedUnit) === 0) { $factor=(int)$unit['base_quantity']; break; }
        if ($factor === null) return [false, 'The selected selling unit is no longer valid for ' . ($product['product_name'] ?? 'the selected product') . '.'];
        $baseRequested = sellingUnitBaseQuantity((int) $item['quantity'], $factor);
        $productId = (string) $item['product_id'];
        $requestedByProduct[$productId] = ($requestedByProduct[$productId] ?? 0) + $baseRequested;
        if ($requestedByProduct[$productId] > (int) $product['available_stock']) {
            return [
                false,
                sprintf(
                    'Insufficient shelf stock for %s. Available: %d.',
                    $product['product_name'] ?? 'selected product',
                    (int) $product['available_stock']
                ),
            ];
        }
    }

    return [true, ''];
}

?>
