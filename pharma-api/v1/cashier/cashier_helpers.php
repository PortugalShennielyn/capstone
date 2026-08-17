<?php

require_once __DIR__ . '/../sales/sales_pos_helpers.php';

function cashierCurrentUserId(): string
{
    return trim((string) ($_SESSION['user_id'] ?? ''));
}

function cashierSessionRoles(): array
{
    $roles = array_merge(
        [$_SESSION['role'] ?? ''],
        is_array($_SESSION['roles'] ?? null) ? $_SESSION['roles'] : [],
        is_array($_SESSION['role_identifiers'] ?? null) ? $_SESSION['role_identifiers'] : []
    );

    return array_values(array_filter(array_map(static function ($role): string {
        $role = strtolower(trim((string) $role));
        return str_replace([' ', '-'], ['_', '_'], $role);
    }, $roles)));
}

function cashierIsAdminSession(): bool
{
    return (bool) array_intersect(cashierSessionRoles(), ['admin', 'manager', 'super_admin', 'ro_admin', 'ro_manager', 'ro_super_admin']);
}

function cashierMoney($value): float
{
    return round((float) ($value ?? 0), 2);
}

function ensureCashierPaymentDiscountSchema(PDO $pdo): void
{
    if (!salesColumnExists($pdo, 'sales_payments', 'sales_clerk_discount')) {
        $pdo->exec('ALTER TABLE sales_payments ADD COLUMN sales_clerk_discount DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER total_amount');
    }
    if (!salesColumnExists($pdo, 'sales_payments', 'cashier_discount_type')) {
        $pdo->exec("ALTER TABLE sales_payments ADD COLUMN cashier_discount_type VARCHAR(30) NOT NULL DEFAULT 'none' AFTER sales_clerk_discount");
    }
    if (!salesColumnExists($pdo, 'sales_payments', 'cashier_discount_amount')) {
        $pdo->exec('ALTER TABLE sales_payments ADD COLUMN cashier_discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER cashier_discount_type');
    }
    if (!salesColumnExists($pdo, 'sales_payments', 'final_amount')) {
        $pdo->exec('ALTER TABLE sales_payments ADD COLUMN final_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER cashier_discount_amount');
    }
}

function cashierDiscountAmount(string $discountType, float $customAmount, float $subtotal): float
{
    return salesTransactionDiscount($discountType, $customAmount, $subtotal);
}

function cashierPaymentTotals(
    float $subtotal,
    string $discountType,
    float $customAmount,
    float $salesClerkDiscount = 0
): array
{
    $discountType = in_array($discountType, ['none', 'senior', 'pwd', 'promo', 'custom'], true) ? $discountType : 'none';
    $totals = salesVatInclusivePaymentTotals(
        $subtotal,
        $salesClerkDiscount,
        $discountType,
        $customAmount
    );

    return [
        'discount_type' => $discountType,
        'discount_amount' => $totals['cashier_discount_amount'],
        'sales_clerk_discount' => $totals['sales_clerk_discount'],
        'total_discount' => $totals['discount_amount'],
        'vatable_sales' => $totals['vatable_sales'],
        'vat' => $totals['vat'],
        'final_amount' => $totals['total_amount'],
    ];
}

function cashierDisplay($value, string $fallback = ''): string
{
    $text = trim((string) ($value ?? ''));
    return $text !== '' ? $text : $fallback;
}

function cashierStatusGroup(string $status): string
{
    if (in_array($status, ['accepted_by_cashier', 'processing_payment', 'processing'], true)) {
        return 'processing';
    }

    if ($status === 'waiting_cashier') {
        return 'waiting';
    }

    if ($status === 'paid') {
        return 'completed';
    }

    return $status;
}

function cashierOrderRow(array $row): array
{
    $status = (string) ($row['status'] ?? '');
    $finalAmount = cashierMoney($row['final_amount'] ?? $row['total_amount'] ?? 0);
    $vat = cashierMoney($row['vat'] ?? 0);

    return [
        'order_id' => (int) ($row['order_id'] ?? 0),
        'order_no' => cashierDisplay($row['order_no'] ?? '', (string) ($row['order_id'] ?? '')),
        'customer_name' => cashierDisplay($row['customer_name'] ?? '', 'Walk-in Customer'),
        'sales_clerk_name' => cashierDisplay($row['sales_clerk_name'] ?? '', 'Unassigned'),
        'cashier_name' => cashierDisplay($row['cashier_name'] ?? ''),
        'sales_clerk_id' => cashierDisplay($row['sales_clerk_id'] ?? ''),
        'assigned_cashier_id' => cashierDisplay($row['assigned_cashier_id'] ?? ''),
        'item_count' => (int) ($row['item_count'] ?? 0),
        'total_quantity' => (int) ($row['total_quantity'] ?? 0),
        'subtotal' => cashierMoney($row['subtotal'] ?? 0),
        'discount' => cashierMoney($row['discount'] ?? 0),
        'sales_clerk_discount' => cashierMoney($row['sales_clerk_discount'] ?? $row['discount'] ?? 0),
        'cashier_discount_type' => cashierDisplay($row['cashier_discount_type'] ?? 'none', 'none'),
        'cashier_discount_amount' => cashierMoney($row['cashier_discount_amount'] ?? 0),
        'final_amount' => $finalAmount,
        'vatable_sales' => cashierMoney(max(0, $finalAmount - $vat)),
        'vat' => $vat,
        'total_amount' => cashierMoney($row['total_amount'] ?? 0),
        'cash_received' => cashierMoney($row['cash_received'] ?? 0),
        'amount_paid' => cashierMoney($row['amount_paid'] ?? 0),
        'change_amount' => cashierMoney($row['payment_change_amount'] ?? $row['change_amount'] ?? 0),
        'payment_method' => cashierDisplay($row['payment_method'] ?? ''),
        'receipt_no' => cashierDisplay($row['receipt_no'] ?? ''),
        'status_code' => $status,
        'status' => salesStatusLabel($status),
        'status_group' => cashierStatusGroup($status),
        'created_at' => $row['created_at'] ?? null,
        'sent_to_cashier_at' => $row['sent_to_cashier_at'] ?? null,
        'cashier_accepted_at' => $row['cashier_accepted_at'] ?? null,
        'completed_at' => $row['completed_at'] ?? null,
    ];
}

function cashierLoadOrderDetail(PDO $pdo, int $orderId): ?array
{
    $stmt = $pdo->prepare(
        "SELECT
            o.order_id,
            o.order_no,
            COALESCE(NULLIF(o.customer_name, ''), 'Walk-in Customer') AS customer_name,
            COALESCE(NULLIF(sc.full_name, ''), sc.username, 'Unassigned') AS sales_clerk_name,
            COALESCE(NULLIF(ca.full_name, ''), ca.username, '') AS cashier_name,
            o.sales_clerk_id,
            o.assigned_cashier_id,
            o.subtotal,
            o.discount,
            o.discount AS sales_clerk_discount,
            o.vat,
            o.total_amount,
            o.cash_received,
            o.change_amount,
            o.status,
            o.created_at,
            o.sent_to_cashier_at,
            o.cashier_accepted_at,
            o.completed_at,
            p.amount_paid,
            p.sales_clerk_discount AS payment_sales_clerk_discount,
            p.cashier_discount_type,
            p.cashier_discount_amount,
            p.final_amount,
            p.change_amount AS payment_change_amount,
            p.payment_method,
            r.receipt_no
         FROM sales_orders o
         LEFT JOIN users sc ON sc.user_id = o.sales_clerk_id
         LEFT JOIN users ca ON ca.user_id = o.assigned_cashier_id
         LEFT JOIN sales_payments p ON p.order_id = o.order_id AND p.payment_status = 'paid'
         LEFT JOIN sales_receipts r ON r.order_id = o.order_id
         WHERE o.order_id = :order_id
         LIMIT 1"
    );
    $stmt->execute([':order_id' => $orderId]);
    $order = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$order) {
        return null;
    }

    $itemsStmt = $pdo->prepare(
        "SELECT
            i.product_id,
            i.brand_name,
            i.product_name,
            i.specification,
            i.quantity,
            i.selected_quantity,
            i.selected_unit,
            i.unit_base_quantity,
            i.unit_price,
            i.line_total,
            p.status AS product_status,
            md.generic_name,
            COALESCE(NULLIF(md.strength, ''), TRIM(CONCAT(COALESCE(md.strength_value, ''), COALESCE(md.strength_unit, '')))) AS medicine_strength,
            TRIM(CONCAT(COALESCE(gd.net_weight, ''), CASE WHEN gd.unit IS NULL OR gd.unit = '' THEN '' ELSE CONCAT(' ', gd.unit) END)) AS grocery_net_weight
         FROM sales_order_items i
         LEFT JOIN product p ON p.product_id = i.product_id
         LEFT JOIN medicine_details md ON md.product_id = i.product_id
         LEFT JOIN grocery_details gd ON gd.product_id = i.product_id
         WHERE i.order_id = :order_id
         ORDER BY i.order_item_id ASC"
    );
    $itemsStmt->execute([':order_id' => $orderId]);
    $items = array_map(static function (array $item): array {
        return [
            'product_id' => (string) ($item['product_id'] ?? ''),
            'brand_name' => cashierDisplay($item['brand_name'] ?? ''),
            'product_name' => cashierDisplay($item['product_name'] ?? '', 'Item'),
            'specification' => cashierDisplay($item['specification'] ?? ''),
            'generic_name' => cashierDisplay($item['generic_name'] ?? ''),
            'strength' => cashierDisplay($item['medicine_strength'] ?? ''),
            'net_weight' => cashierDisplay($item['grocery_net_weight'] ?? ''),
            'quantity' => (int) (($item['selected_quantity'] ?? 0) ?: ($item['quantity'] ?? 0)),
            'selected_unit' => cashierDisplay($item['selected_unit'] ?? ''),
            'base_quantity' => (int) ($item['quantity'] ?? 0),
            'unit_base_quantity' => max(1, (int) ($item['unit_base_quantity'] ?? 1)),
            'unit_price' => cashierMoney($item['unit_price'] ?? 0),
            'line_total' => cashierMoney($item['line_total'] ?? 0),
            'product_status' => cashierDisplay($item['product_status'] ?? 'Active', 'Active'),
        ];
    }, $itemsStmt->fetchAll(PDO::FETCH_ASSOC));

    $detail = cashierOrderRow(array_merge($order, [
        'item_count' => count($items),
        'total_quantity' => array_sum(array_map(static fn ($item) => (int) $item['quantity'], $items)),
        'sales_clerk_discount' => $order['payment_sales_clerk_discount'] ?? $order['sales_clerk_discount'] ?? $order['discount'] ?? 0,
    ]));
    $detail['items'] = $items;

    return $detail;
}

function cashierGenerateReceiptNo(PDO $pdo): string
{
    do {
        $receiptNo = 'RCPT-' . date('Ymd-His') . '-' . strtoupper(bin2hex(random_bytes(2)));
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM sales_receipts WHERE receipt_no = :receipt_no');
        $stmt->execute([':receipt_no' => $receiptNo]);
    } while ((int) $stmt->fetchColumn() > 0);

    return $receiptNo;
}

function cashierPersistCashReceived(PDO $pdo, int $orderId, float $amountPaid, float $totalAmount): void
{
    $stmt = $pdo->prepare(
        'UPDATE sales_orders
         SET cash_received = :cash_received,
             change_amount = :change_amount
         WHERE order_id = :order_id'
    );
    $stmt->execute([
        ':cash_received' => cashierMoney($amountPaid),
        ':change_amount' => cashierMoney(max(0, $amountPaid - $totalAmount)),
        ':order_id' => $orderId,
    ]);
}

function cashierAssertOrderProductsActive(PDO $pdo, int $orderId): void
{
    $inactiveItemStmt = $pdo->prepare(
        "SELECT COALESCE(NULLIF(i.product_name, ''), p.product_name, 'Selected product') AS product_name
         FROM sales_order_items i
         INNER JOIN product p ON p.product_id = i.product_id
         WHERE i.order_id = :order_id
           AND p.status <> 'Active'
         LIMIT 1
         FOR UPDATE"
    );
    $inactiveItemStmt->execute([':order_id' => $orderId]);
    $inactiveProductName = $inactiveItemStmt->fetchColumn();
    if ($inactiveProductName !== false) {
        throw new RuntimeException($inactiveProductName . ' is now inactive. Remove it from the order before continuing.');
    }
}

function cashierDeductShelfStock(PDO $pdo, int $orderId): void
{
    $itemsStmt = $pdo->prepare(
        'SELECT product_id, product_name, quantity
         FROM sales_order_items
         WHERE order_id = :order_id
         ORDER BY order_item_id ASC'
    );
    $itemsStmt->execute([':order_id' => $orderId]);

    foreach ($itemsStmt->fetchAll(PDO::FETCH_ASSOC) as $item) {
        $remaining = (int) ($item['quantity'] ?? 0);
        $productId = (string) ($item['product_id'] ?? '');
        if ($productId === '' || $remaining <= 0) {
            continue;
        }

        $stockStmt = $pdo->prepare(
            "SELECT selling_stock_id, quantity_remaining
             FROM product_selling_stock
             WHERE product_id = :product_id
               AND quantity_remaining > 0
             ORDER BY expiration_date IS NULL, expiration_date ASC, created_at ASC, selling_stock_id ASC
             FOR UPDATE"
        );
        $stockStmt->execute([':product_id' => $productId]);
        $batches = $stockStmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($batches as $batch) {
            if ($remaining <= 0) {
                break;
            }

            $available = (int) ($batch['quantity_remaining'] ?? 0);
            $deduct = min($available, $remaining);
            if ($deduct <= 0) {
                continue;
            }

            $update = $pdo->prepare(
                'UPDATE product_selling_stock
                 SET quantity_remaining = quantity_remaining - :deduct
                 WHERE selling_stock_id = :selling_stock_id'
            );
            $update->execute([
                ':deduct' => $deduct,
                ':selling_stock_id' => $batch['selling_stock_id'],
            ]);

            $remaining -= $deduct;
        }

        if ($remaining > 0) {
            throw new RuntimeException('Insufficient shelf stock for ' . cashierDisplay($item['product_name'] ?? '', 'selected item') . '.');
        }
    }
}

?>
