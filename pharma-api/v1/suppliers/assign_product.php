<?php
$allowedRoles = ['super_admin', 'admin', 'Admin', 'ro-super-admin', 'ro-admin'];
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once '../products/product_category_schema.php';
require_once '../products/product_status_schema.php';
require_once 'supplier_schema.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Only POST requests are allowed.']);
    exit();
}

$payload = json_decode(file_get_contents('php://input'), true);
$supplierId = cleanId($payload['supplier_id'] ?? null);
$productId = cleanId($payload['product_id'] ?? null);
$purchaseUnit = trim((string) ($payload['purchase_unit'] ?? ''));
$supplierCostInput = $payload['supplier_cost_input'] ?? null;
$unitsPerPurchaseUnitRaw = $payload['units_per_purchase_unit'] ?? null;

if ($purchaseUnit === '') {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Purchase Unit is required.']);
    exit();
}
if ($supplierId === '' || $productId === '') {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'A valid supplier and product are required.']);
    exit();
}

try {
    ensureProductStatusColumn($pdo);
    ensureSupplierArchiveColumn($pdo);
    ensureSupplierProductInventoryUnitColumn($pdo);
    ensureSupplierPurchasingConversionSchema($pdo);
    $inventoryUnit = productInventoryUnitForSupplier($pdo,$productId)['unit_name'];
    $conversion = supplierPurchasingSetupFromPayload($pdo, $payload, $inventoryUnit);
    $purchaseUnit = $conversion['purchase_unit'];
    $unitsPerPurchaseUnit = $conversion['base_qty_per_purchase_unit'];
    if ($supplierCostInput !== null && $supplierCostInput !== '') {
        if (!is_numeric($supplierCostInput) || !is_finite((float) $supplierCostInput) || (float) $supplierCostInput < 0) {
            throw new InvalidArgumentException('Supplier Price must be a valid amount greater than or equal to zero.');
        }
        $supplierCostInput = (float) $supplierCostInput;
    } else {
        $supplierCostInput = null;
    }

    $supplierCheck = $pdo->prepare('SELECT COUNT(*) FROM suppliers WHERE supplier_id = :supplier_id AND archived_at IS NULL');
    $supplierCheck->execute([':supplier_id' => $supplierId]);

    $productCheck = $pdo->prepare("SELECT COUNT(*) FROM product WHERE product_id = :product_id AND status = 'Active'");
    $productCheck->execute([':product_id' => $productId]);

    if ((int) $supplierCheck->fetchColumn() === 0 || (int) $productCheck->fetchColumn() === 0) {
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => 'The supplier or product is inactive or was not found.']);
        exit();
    }

    $duplicateCheck = $pdo->prepare(
        'SELECT supplier_product_id
         FROM supplier_products
         WHERE supplier_id = :supplier_id
           AND product_id = :product_id
         LIMIT 1'
    );
    $duplicateCheck->execute([
        ':supplier_id' => $supplierId,
        ':product_id' => $productId
    ]);
    if ($duplicateCheck->fetchColumn()) {
        http_response_code(409);
        echo json_encode([
            'status' => 'error',
            'message' => 'This product is already assigned to the selected supplier. Edit the existing assignment instead.'
        ]);
        exit();
    }

    $pdo->beginTransaction();
    $statement = $pdo->prepare(
        'INSERT INTO supplier_products (supplier_id, product_id, supplier_cost_price, supplier_cost_input, supplier_cost_basis, purchase_unit, purchase_unit_contains, inner_unit, units_per_inner_unit, inventory_unit, units_per_purchase_unit)
         VALUES (:supplier_id, :product_id, :supplier_cost_price, :supplier_cost_input, \'purchase\', :purchase_unit, :purchase_unit_contains, :inner_unit, :units_per_inner_unit, :inventory_unit, :units_per_purchase_unit)'
    );
    $statement->execute([
        ':supplier_id' => $supplierId,
        ':product_id' => $productId,
        ':supplier_cost_price' => $supplierCostInput === null ? null : $supplierCostInput / max(1, (int) $unitsPerPurchaseUnit),
        ':supplier_cost_input' => $supplierCostInput,
        ':purchase_unit' => $purchaseUnit !== '' ? $purchaseUnit : null,
        ':purchase_unit_contains' => $conversion['contains'],
        ':inner_unit' => $conversion['inner_unit'] ?: null,
        ':units_per_inner_unit' => $conversion['units_per_inner_unit'],
        ':inventory_unit' => $inventoryUnit,
        ':units_per_purchase_unit' => $unitsPerPurchaseUnit
    ]);
    $idStatement = $pdo->prepare('SELECT supplier_product_id FROM supplier_products WHERE supplier_id=:supplier_id AND product_id=:product_id LIMIT 1');
    $idStatement->execute([':supplier_id'=>$supplierId,':product_id'=>$productId]);
    $supplierProductId = (string)$idStatement->fetchColumn();
    syncSupplierProductUnitConversions($pdo,$supplierProductId,$conversion);
    $pdo->commit();

    echo json_encode([
        'status' => 'success',
        'message' => 'Product assigned to supplier successfully.',
        'supplier_product_id' => $supplierProductId,
        'conversion' => $conversion
    ]);
} catch (InvalidArgumentException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    http_response_code(422);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to assign product to supplier.']);
}
?>
