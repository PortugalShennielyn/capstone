<?php
$allowedRoles = ['super_admin', 'admin', 'manager', 'supervisor', 'Admin', 'ro-super-admin', 'ro-admin', 'ro-manager', 'ro-supervisor'];
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once '../products/product_selling_options.php';
require_once '../products/product_pricing_schema.php';

try {
    $productId = trim((string) ($_GET['product_id'] ?? ''));
    if ($productId === '') throw new InvalidArgumentException('A product is required.');
    $costBasisColumns = ['product_id', 'unit_cost', 'received_qty', 'damaged_qty', 'returned_qty', 'received_date', 'created_at'];
    $hasCostBasis = !array_filter($costBasisColumns, static fn(string $column): bool => !tableHasColumn($pdo, 'inventory_batches', $column));
    $costBasis = $hasCostBasis ? latestAcceptedCostBasis($pdo, $productId) : null;
    echo json_encode([
        'status' => 'success',
        'base_unit' => productSellingBaseUnit($pdo, $productId),
        'shelf_base_quantity' => productShelfBaseQuantity($pdo, $productId),
        'shelf_usable_base_quantity' => productShelfBaseQuantity($pdo, $productId, true),
        'cost_per_base_unit' => $costBasis && (float) $costBasis['unit_cost'] > 0
            ? round((float) $costBasis['unit_cost'], 2)
            : null,
        'candidate_units' => productSellableUnitCandidates($pdo, $productId),
        'supports_unit_barcode' => productSellingOptionBarcodeColumn($pdo) !== null,
        'options' => productSellingOptions($pdo, $productId),
    ]);
} catch (InvalidArgumentException $error) {
    http_response_code(422);
    echo json_encode(['status' => 'error', 'message' => $error->getMessage()]);
} catch (Throwable $error) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to load Selling Setup.']);
}
