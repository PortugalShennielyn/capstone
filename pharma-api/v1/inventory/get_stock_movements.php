<?php
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once '../products/product_category_schema.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Only GET requests are allowed.']);
    exit();
}

function movementCleanText($value): string
{
    $text = trim((string) ($value ?? ''));
    $text = preg_replace('/\[(?:RETURN|RECEIVING)_META_V\d+\]/i', '', $text) ?? $text;
    return trim(preg_replace('/\s+/', ' ', strip_tags($text)) ?? $text);
}

function movementParseStoredRemarks($value): array
{
    $stored = trim((string) ($value ?? ''));
    $metadata = [];
    $plain = $stored;

    if (preg_match('/^\[((?:RETURN|RECEIVING)_META_V\d+)\](\{[^\r\n]*\})(?:\r?\n)?(.*)$/si', $stored, $matches)) {
        $decoded = json_decode($matches[2], true);
        if (is_array($decoded)) {
            $metadata = $decoded;
        }
        $plain = $matches[3] ?? '';
    } elseif ($stored !== '') {
        $decoded = json_decode($stored, true);
        if (is_array($decoded)) {
            $metadata = $decoded;
            $plain = '';
        }
    }

    return [
        'remarks' => movementCleanText($plain),
        'metadata' => $metadata,
    ];
}

function movementUserName(array $row): string
{
    $name = trim((string) ($row['user_name'] ?? ''));
    $username = trim((string) ($row['username'] ?? ''));
    return $name !== '' ? $name : ($username !== '' ? $username : 'System');
}

function movementResolutionLabel(string $resolution, string $fallback = ''): string
{
    $labels = [
        'return_for_credit' => 'Returned to supplier for credit',
        'return_for_replacement' => 'Returned to supplier for replacement',
        'keep_with_discount' => 'Accepted damaged stock with supplier adjustment',
        'keep_damaged' => 'Moved to damaged stock',
        'reject_without_replacement' => 'Rejected during delivery',
        'replacement_damage_event' => 'Replacement arrived damaged',
    ];
    return $labels[$resolution] ?? movementCleanText($fallback);
}

function movementRecord(array $values): array
{
    return array_merge([
        'movement_id' => '',
        'movement_date' => null,
        'movement_code' => '',
        'movement_label' => '',
        'direction' => 'neutral',
        'quantity' => 0,
        'storage_change' => 0,
        'shelf_change' => 0,
        'on_hand_change' => 0,
        'reference' => '',
        'batch_id' => null,
        'batch_number' => null,
        'from_location' => null,
        'to_location' => null,
        'user_name' => 'System',
        'reason' => '',
        'remarks' => '',
        'details' => [],
        'related_payment' => [],
    ], $values);
}

try {
    ensureProductCategorySchema($pdo);
    $productId = cleanId($_GET['product_id'] ?? null);
    if ($productId === '') {
        throw new InvalidArgumentException('Product is required.');
    }

    $productStatement = $pdo->prepare(
        "SELECT p.product_id, p.product_name, p.brand_name, p.barcode,
                pc.category_name, pt.type_name,
                md.generic_name, md.strength, md.strength_value, md.strength_unit,
                md.net_content_value, md.net_content_unit, md.dosage_form,
                COALESCE(md.package_type, gd.package_type) AS package_type,
                gd.variant, gd.size, gd.net_weight, gd.unit
         FROM product p
         LEFT JOIN product_categories pc ON pc.category_id = p.category_id
         LEFT JOIN product_types pt ON pt.type_id = p.type_id
         LEFT JOIN medicine_details md ON md.product_id = p.product_id
         LEFT JOIN grocery_details gd ON gd.product_id = p.product_id
         WHERE p.product_id = :product_id
         LIMIT 1"
    );
    $productStatement->execute([':product_id' => $productId]);
    $product = $productStatement->fetch(PDO::FETCH_ASSOC);
    if (!$product) {
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => 'Product was not found.']);
        exit();
    }

    $balanceStatement = $pdo->prepare(
        "SELECT
            COALESCE((SELECT SUM(storage_qty) FROM inventory_batches WHERE product_id = :storage_product_id), 0) AS storage_quantity,
            COALESCE((SELECT SUM(quantity_remaining) FROM product_selling_stock WHERE product_id = :shelf_product_id), 0) AS shelf_quantity,
            COALESCE((SELECT SUM(damaged_qty) FROM inventory_batches WHERE product_id = :damaged_product_id), 0) AS damaged_quantity"
    );
    $balanceStatement->execute([
        ':storage_product_id' => $productId,
        ':shelf_product_id' => $productId,
        ':damaged_product_id' => $productId,
    ]);
    $balances = $balanceStatement->fetch(PDO::FETCH_ASSOC) ?: [];
    $product['storage_quantity'] = (int) ($balances['storage_quantity'] ?? 0);
    $product['shelf_quantity'] = (int) ($balances['shelf_quantity'] ?? 0);
    $product['damaged_quantity'] = (int) ($balances['damaged_quantity'] ?? 0);
    $product['on_hand_quantity'] = $product['storage_quantity'] + $product['shelf_quantity'];

    $movements = [];

    $receivedStatement = $pdo->prepare(
        "SELECT ib.batch_id, ib.legacy_inventory_id, ib.po_id, ib.po_item_id,
                ib.received_date, ib.expiry_date, ib.received_qty, ib.damaged_qty, ib.returned_qty,
                ib.storage_qty + COALESCE((
                    SELECT SUM(pss.quantity_remaining)
                    FROM product_selling_stock pss
                    WHERE pss.source_batch_id = ib.batch_id
                ), 0) AS batch_remaining_quantity,
                COALESCE(pi.batch_number, ib.batch_id) AS batch_number,
                COALESCE(pi.quantity_stocked, GREATEST(ib.received_qty - ib.damaged_qty - ib.returned_qty, 0)) AS accepted_quantity,
                pi.quantity_remaining AS legacy_remaining,
                po.po_number, s.supplier_name, receiving.remarks AS receiving_remarks,
                poi.inventory_qty_ordered, poi.quantity AS ordered_quantity,
                al.user_id, u.full_name AS user_name, u.username
         FROM inventory_batches ib
         LEFT JOIN product_inventory pi ON pi.inventory_id = ib.legacy_inventory_id
         LEFT JOIN purchase_order_items poi ON poi.po_item_id = ib.po_item_id
         LEFT JOIN purchase_orders po ON po.po_id = COALESCE(ib.po_id, poi.po_id)
         LEFT JOIN suppliers s ON s.supplier_id = ib.supplier_id
         LEFT JOIN purchase_order_receiving receiving ON receiving.po_id = po.po_id
         LEFT JOIN activity_logs al ON al.activity_id = (
             SELECT al2.activity_id FROM activity_logs al2
             WHERE al2.module = 'Inventory' AND al2.action = 'Received'
               AND al2.reference_id = ib.legacy_inventory_id
             ORDER BY al2.created_at DESC LIMIT 1
         )
         LEFT JOIN users u ON u.user_id = al.user_id
         WHERE ib.product_id = :product_id
           AND COALESCE(pi.quantity_stocked, GREATEST(ib.received_qty - ib.damaged_qty - ib.returned_qty, 0)) > 0
         ORDER BY ib.received_date DESC, ib.created_at DESC"
    );
    $receivedStatement->execute([':product_id' => $productId]);
    foreach ($receivedStatement->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $parsed = movementParseStoredRemarks($row['receiving_remarks'] ?? '');
        $quantity = (int) ($row['accepted_quantity'] ?? 0);
        $isReplacement = empty($row['po_id']) && !empty($row['po_item_id']);
        $movementCode = $isReplacement ? 'replacement_received' : 'po_received';
        $movementLabel = $isReplacement ? 'Replacement' : 'Received';
        $reference = trim((string) ($row['po_number'] ?? '')) ?: trim((string) ($row['batch_number'] ?? ''));
        $details = [
            'po_number' => $row['po_number'] ?? null,
            'batch_number' => $row['batch_number'] ?? null,
            'supplier' => $row['supplier_name'] ?? null,
            'expiry_date' => $row['expiry_date'] ?? null,
            'received_date' => $row['received_date'] ?? null,
            'ordered_quantity' => (int) ($row['inventory_qty_ordered'] ?: $row['ordered_quantity'] ?: 0),
            'received_quantity' => (int) ($row['received_qty'] ?? 0),
            'accepted_quantity' => $quantity,
            'damaged_quantity' => (int) ($row['damaged_qty'] ?? 0),
            'returned_quantity' => (int) ($row['returned_qty'] ?? 0),
            'batch_remaining_quantity' => (int) ($row['batch_remaining_quantity'] ?? 0),
        ];
        $relatedPayment = [];
        foreach (['payment_status', 'amount_paid', 'remaining_balance', 'supplier_credit', 'supplier_discount', 'final_amount_payable'] as $key) {
            if (array_key_exists($key, $parsed['metadata'])) {
                $relatedPayment[$key] = $parsed['metadata'][$key];
            }
        }
        $movements[] = movementRecord([
            'movement_id' => 'batch:' . $row['batch_id'],
            'movement_date' => $row['received_date'],
            'movement_code' => $movementCode,
            'movement_label' => $movementLabel,
            'direction' => 'in',
            'quantity' => $quantity,
            'storage_change' => $quantity,
            'on_hand_change' => $quantity,
            'reference' => $reference,
            'batch_id' => $row['batch_id'],
            'batch_number' => $row['batch_number'],
            'from_location' => $row['supplier_name'] ?: 'Supplier',
            'to_location' => 'Storage',
            'user_name' => movementUserName($row),
            'reason' => $isReplacement ? 'Replacement received' : 'PO received',
            'remarks' => $parsed['remarks'],
            'details' => $details,
            'related_payment' => $relatedPayment,
        ]);
    }

    $transferStatement = $pdo->prepare(
        "SELECT pss.selling_stock_id, pss.source_batch_id, pss.batch_number,
                GREATEST(pss.quantity_stocked, COALESCE(ib.shelf_qty, 0), pss.quantity_remaining) AS quantity_stocked,
                pss.quantity_remaining, pss.expiration_date, pss.created_at,
                ib.received_date, al.user_id, u.full_name AS user_name, u.username
         FROM product_selling_stock pss
         LEFT JOIN inventory_batches ib ON ib.batch_id = pss.source_batch_id
         LEFT JOIN activity_logs al ON al.activity_id = (
             SELECT al2.activity_id FROM activity_logs al2
             WHERE al2.module = 'Inventory' AND al2.action = 'Moved to Shelf'
               AND al2.reference_id IN (pss.selling_stock_id, pss.product_id)
             ORDER BY ABS(TIMESTAMPDIFF(SECOND, al2.created_at, pss.created_at)) ASC, al2.created_at DESC
             LIMIT 1
         )
         LEFT JOIN users u ON u.user_id = al.user_id
         WHERE pss.product_id = :product_id AND pss.quantity_stocked > 0
         ORDER BY pss.created_at DESC"
    );
    $transferStatement->execute([':product_id' => $productId]);
    foreach ($transferStatement->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $quantity = (int) ($row['quantity_stocked'] ?? 0);
        $movements[] = movementRecord([
            'movement_id' => 'transfer:' . $row['selling_stock_id'],
            'movement_date' => $row['created_at'],
            'movement_code' => 'storage_to_shelf',
            'movement_label' => 'Storage → Shelf',
            'direction' => 'transfer',
            'quantity' => $quantity,
            'storage_change' => -$quantity,
            'shelf_change' => $quantity,
            'on_hand_change' => 0,
            'reference' => $row['batch_number'] ?: $row['selling_stock_id'],
            'batch_id' => $row['source_batch_id'],
            'batch_number' => $row['batch_number'],
            'from_location' => 'Storage',
            'to_location' => 'Shelf',
            'user_name' => movementUserName($row),
            'reason' => 'Replenished shelf',
            'details' => [
                'batch_number' => $row['batch_number'] ?? null,
                'expiry_date' => $row['expiration_date'] ?? null,
                'received_date' => $row['received_date'] ?? null,
                'quantity_moved' => $quantity,
                'remaining_shelf_quantity' => (int) ($row['quantity_remaining'] ?? 0),
            ],
        ]);
    }

    $saleStatement = $pdo->prepare(
        "SELECT soi.order_item_id, soi.order_id, soi.quantity, o.order_no,
                COALESCE(r.receipt_no, o.order_no) AS receipt_no,
                COALESCE(o.completed_at, pay.paid_at, o.updated_at) AS movement_date,
                u.full_name AS user_name, u.username
         FROM sales_order_items soi
         INNER JOIN sales_orders o ON o.order_id = soi.order_id AND o.status = 'completed'
         LEFT JOIN sales_payments pay ON pay.order_id = o.order_id AND pay.payment_status = 'paid'
         LEFT JOIN sales_receipts r ON r.order_id = o.order_id
         LEFT JOIN users u ON u.user_id = COALESCE(o.assigned_cashier_id, pay.cashier_id)
         WHERE soi.product_id = :product_id
         ORDER BY movement_date DESC, soi.order_item_id DESC"
    );
    $saleStatement->execute([':product_id' => $productId]);
    foreach ($saleStatement->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $quantity = (int) ($row['quantity'] ?? 0);
        $movements[] = movementRecord([
            'movement_id' => 'sale:' . $row['order_item_id'],
            'movement_date' => $row['movement_date'],
            'movement_code' => 'sale',
            'movement_label' => 'Sold',
            'direction' => 'out',
            'quantity' => $quantity,
            'shelf_change' => -$quantity,
            'on_hand_change' => -$quantity,
            'reference' => $row['receipt_no'] ?: $row['order_no'],
            'from_location' => 'Shelf',
            'to_location' => 'Customer',
            'user_name' => movementUserName($row),
            'reason' => 'Product sold',
            'details' => [
                'sale_reference' => $row['order_no'] ?? null,
                'receipt_number' => $row['receipt_no'] ?? null,
                'quantity_sold' => $quantity,
                'cashier' => movementUserName($row),
                'transaction_time' => $row['movement_date'] ?? null,
            ],
        ]);
    }

    $returnStatement = $pdo->prepare(
        "SELECT por.return_id, por.return_quantity, por.damage_reason, por.remarks,
                por.return_status, por.created_at, po.po_number, s.supplier_name,
                al.user_id, u.full_name AS user_name, u.username
         FROM purchase_order_returns por
         INNER JOIN purchase_order_items poi ON poi.po_item_id = por.po_item_id
         INNER JOIN purchase_orders po ON po.po_id = por.po_id
         LEFT JOIN suppliers s ON s.supplier_id = po.supplier_id
         LEFT JOIN activity_logs al ON al.activity_id = (
             SELECT al2.activity_id FROM activity_logs al2
             WHERE al2.reference_id = por.return_id
             ORDER BY al2.created_at DESC LIMIT 1
         )
         LEFT JOIN users u ON u.user_id = al.user_id
         WHERE poi.product_id = :product_id
         ORDER BY por.created_at DESC"
    );
    $returnStatement->execute([':product_id' => $productId]);
    foreach ($returnStatement->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $parsed = movementParseStoredRemarks($row['remarks'] ?? '');
        $metadata = $parsed['metadata'];
        $resolution = (string) ($metadata['resolution'] ?? '');
        $quantity = (int) ($row['return_quantity'] ?? 0);
        $isSupplierReturn = in_array($resolution, ['return_for_credit', 'return_for_replacement'], true);
        $isRejected = $resolution === 'reject_without_replacement';
        $movementCode = $isSupplierReturn ? 'return_to_supplier' : 'damaged';
        $movementLabel = $isSupplierReturn ? 'Returned' : ($isRejected ? 'Rejected' : 'Damaged');
        $toLocation = $isSupplierReturn ? 'Supplier' : 'Damaged';
        $reason = movementResolutionLabel($resolution, $row['damage_reason'] ?? 'Damaged stock');
        $movements[] = movementRecord([
            'movement_id' => 'return:' . $row['return_id'],
            'movement_date' => $row['created_at'],
            'movement_code' => $movementCode,
            'movement_label' => $movementLabel,
            'direction' => 'neutral',
            'quantity' => $quantity,
            // Delivery exceptions were never added to sellable on-hand stock.
            // Their movement is shown for audit context without double-deducting inventory.
            'storage_change' => 0,
            'shelf_change' => 0,
            'on_hand_change' => 0,
            'reference' => $row['po_number'] ?: $row['return_id'],
            'from_location' => 'Receiving',
            'to_location' => $toLocation,
            'user_name' => movementUserName($row),
            'reason' => $reason,
            'remarks' => $parsed['remarks'],
            'details' => [
                'po_number' => $row['po_number'] ?? null,
                'supplier' => $row['supplier_name'] ?? null,
                'return_status' => $row['return_status'] ?? null,
                'return_resolution' => $reason,
                'delivered_quantity' => (int) ($metadata['delivered_quantity'] ?? 0),
                'damaged_quantity' => (int) ($metadata['damaged_quantity'] ?? $quantity),
                'missing_quantity' => (int) ($metadata['missing_quantity'] ?? 0),
                'replacement_expected_quantity' => (int) ($metadata['replacement_expected_qty'] ?? 0),
                'replacement_received_quantity' => (int) ($metadata['replacement_received_qty'] ?? 0),
            ],
        ]);
    }

    usort($movements, static function (array $left, array $right): int {
        $dateCompare = strcmp((string) ($right['movement_date'] ?? ''), (string) ($left['movement_date'] ?? ''));
        return $dateCompare !== 0 ? $dateCompare : strcmp((string) $right['movement_id'], (string) $left['movement_id']);
    });

    $supportedTypes = [];
    foreach ($movements as $movement) {
        $supportedTypes[$movement['movement_code']] = $movement['movement_label'];
    }

    echo json_encode([
        'status' => 'success',
        'product' => $product,
        'movements' => $movements,
        'supported_types' => array_map(
            static fn(string $code, string $label): array => ['code' => $code, 'label' => $label],
            array_keys($supportedTypes),
            array_values($supportedTypes)
        ),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (InvalidArgumentException $e) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Unable to load stock movement history. Please try again.',
        'error' => $e->getMessage(),
    ]);
}
?>
