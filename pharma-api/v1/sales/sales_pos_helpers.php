<?php

function salesReadJsonBody(): array
{
    $raw = file_get_contents('php://input');
    $data = json_decode($raw ?: '{}', true);
    return is_array($data) ? $data : [];
}

function salesCurrentUserId(): string
{
    return trim((string) ($_SESSION['user_id'] ?? ''));
}

function salesCurrentUserName(): string
{
    return trim((string) ($_SESSION['full_name'] ?? $_SESSION['username'] ?? 'Sales Clerk'));
}

function salesStatusLabel(string $status): string
{
    $labels = [
        'draft' => 'Draft',
        'waiting_cashier' => 'Waiting for Cashier',
        'accepted_by_cashier' => 'Accepted by Cashier',
        'processing_payment' => 'Processing Payment',
        'completed' => 'Completed',
        'cancelled' => 'Cancelled',
        'rejected' => 'Rejected',
    ];

    return $labels[$status] ?? ucwords(str_replace('_', ' ', $status));
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

function salesBuildSpecification(array $row): string
{
    $parts = [];

    $genericName = salesSpecificationText($row['generic_name'] ?? '');
    $strengthValue = salesSpecificationValue($row['strength_value'] ?? '');
    $strengthUnit = salesSpecificationText($row['strength_unit'] ?? '');
    $strength = trim($strengthValue . $strengthUnit);

    $netContentValue = salesSpecificationValue($row['net_content_value'] ?? '');
    $netContentUnit = salesSpecificationText($row['net_content_unit'] ?? '');
    $netContent = trim($netContentValue . ' ' . $netContentUnit);
    $packaging = salesSpecificationText(
        $row['packaging']
        ?? $row['medicine_package_type']
        ?? $row['grocery_package_type']
        ?? $row['medical_package_type']
        ?? ''
    );

    foreach ([
        $genericName,
        $strength,
        $row['dosage_form'] ?? '',
        $netContent,
        $packaging,
    ] as $value) {
        $value = salesSpecificationText($value);
        $exists = array_filter($parts, static fn ($part) => strcasecmp($part, $value) === 0);
        if ($value !== '' && !$exists) {
            $parts[] = $value;
        }
    }

    return implode(' / ', $parts);
}

function salesProductStock(PDO $pdo, string $productId): int
{
    $stmt = $pdo->prepare(
        'SELECT COALESCE(SUM(quantity_remaining), 0)
         FROM product_selling_stock
         WHERE product_id = :product_id'
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
                md.generic_name,
                md.strength_value,
                md.strength_unit,
                md.dosage_form,
                md.net_content_value,
                md.net_content_unit,
                md.package_type AS medicine_package_type,
                gd.variant,
                gd.size,
                gd.package_type AS grocery_package_type,
                msd.variant AS medical_variant,
                msd.size AS medical_size,
                msd.package_type AS medical_package_type,
                COALESCE(stock.available_stock, 0) AS available_stock
            FROM product p
            LEFT JOIN medicine_details md ON md.product_id = p.product_id
            LEFT JOIN grocery_details gd ON gd.product_id = p.product_id
            LEFT JOIN medical_supply_details msd ON msd.product_id = p.product_id
            LEFT JOIN (
                SELECT product_id, SUM(quantity_remaining) AS available_stock
                FROM product_selling_stock
                GROUP BY product_id
            ) stock ON stock.product_id = p.product_id
            WHERE p.product_id IN ({$placeholders})";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($productIds);

    $products = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $row['specification'] = salesBuildSpecification($row);
        $row['available_stock'] = (int) ($row['available_stock'] ?? 0);
        $row['price'] = round((float) ($row['price'] ?? 0), 2);
        $products[(string) $row['product_id']] = $row;
    }

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
        if ($productId === '' || $quantity <= 0) {
            continue;
        }

        if (!isset($normalized[$productId])) {
            $normalized[$productId] = [
                'product_id' => $productId,
                'quantity' => 0,
            ];
        }
        $normalized[$productId]['quantity'] += $quantity;
    }

    return array_values($normalized);
}

function salesWriteOrderItems(PDO $pdo, int $orderId, array $items, array $products): float
{
    $delete = $pdo->prepare('DELETE FROM sales_order_items WHERE order_id = :order_id');
    $delete->execute([':order_id' => $orderId]);

    $insert = $pdo->prepare(
        'INSERT INTO sales_order_items
            (order_id, product_id, product_name, brand_name, specification, quantity, unit_price, line_total)
         VALUES
            (:order_id, :product_id, :product_name, :brand_name, :specification, :quantity, :unit_price, :line_total)'
    );

    $total = 0.0;
    foreach ($items as $item) {
        $product = $products[$item['product_id']];
        $quantity = (int) $item['quantity'];
        $unitPrice = round((float) $product['price'], 2);
        $lineTotal = round($quantity * $unitPrice, 2);
        $total += $lineTotal;

        $insert->execute([
            ':order_id' => $orderId,
            ':product_id' => $product['product_id'],
            ':product_name' => $product['product_name'],
            ':brand_name' => $product['brand_name'],
            ':specification' => $product['specification'],
            ':quantity' => $quantity,
            ':unit_price' => $unitPrice,
            ':line_total' => $lineTotal,
        ]);
    }

    return round($total, 2);
}

function salesOrderTotalFromPayload(array $payload, float $subtotal): float
{
    $payloadTotal = round((float) ($payload['total_amount'] ?? $subtotal), 2);
    if ($payloadTotal < 0) {
        return 0.0;
    }

    $maxExpected = round($subtotal * 1.12, 2);
    if ($payloadTotal > $maxExpected) {
        return $maxExpected;
    }

    return $payloadTotal;
}

function salesValidateCartStock(array $items, array $products): array
{
    foreach ($items as $item) {
        $product = $products[$item['product_id']] ?? null;
        if (!$product) {
            return [false, 'A selected product is no longer available.'];
        }

        if ((int) $item['quantity'] > (int) $product['available_stock']) {
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
