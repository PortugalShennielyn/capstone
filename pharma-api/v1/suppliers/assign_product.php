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
    if (strcasecmp($purchaseUnit, $inventoryUnit) === 0) {
        $unitsPerPurchaseUnit = 1;
    } elseif (!is_numeric($unitsPerPurchaseUnitRaw) || (float) $unitsPerPurchaseUnitRaw <= 0
        || (float)$unitsPerPurchaseUnitRaw !== (float)(int)$unitsPerPurchaseUnitRaw) {
        throw new InvalidArgumentException("Contents per {$purchaseUnit} must be a positive whole number.");
    } else {
        $unitsPerPurchaseUnit = (int) $unitsPerPurchaseUnitRaw;
    }
    validateSupplierPurchasingHierarchyUnits($pdo, [
        'purchase_unit' => $purchaseUnit,
        'inventory_unit' => $inventoryUnit,
        'units_per_purchase_unit' => $unitsPerPurchaseUnit,
    ]);

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

    $statement = $pdo->prepare(
        'INSERT INTO supplier_products (supplier_id, product_id, purchase_unit, purchase_unit_contains, inventory_unit, units_per_purchase_unit)
         VALUES (:supplier_id, :product_id, :purchase_unit, :purchase_unit_contains, :inventory_unit, :units_per_purchase_unit)'
    );
    $statement->execute([
        ':supplier_id' => $supplierId,
        ':product_id' => $productId,
        ':purchase_unit' => $purchaseUnit !== '' ? $purchaseUnit : null,
        ':purchase_unit_contains' => $unitsPerPurchaseUnit,
        ':inventory_unit' => $inventoryUnit,
        ':units_per_purchase_unit' => $unitsPerPurchaseUnit
    ]);
    $idStatement = $pdo->prepare('SELECT supplier_product_id FROM supplier_products WHERE supplier_id=:supplier_id AND product_id=:product_id LIMIT 1');
    $idStatement->execute([':supplier_id'=>$supplierId,':product_id'=>$productId]);
    $supplierProductId = (string)$idStatement->fetchColumn();
    syncSupplierProductUnitConversions($pdo,$supplierProductId,[
        'purchase_unit'=>$purchaseUnit,
        'purchase_unit_contains'=>$unitsPerPurchaseUnit,
        'inventory_unit'=>$inventoryUnit,
        'units_per_purchase_unit'=>$unitsPerPurchaseUnit,
    ]);

    echo json_encode([
        'status' => 'success',
        'message' => 'Product assigned to supplier successfully.'
    ]);
} catch (InvalidArgumentException $e) {
    http_response_code(422);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to assign product to supplier.']);
}
?>
