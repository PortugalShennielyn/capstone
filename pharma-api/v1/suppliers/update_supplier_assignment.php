<?php
$allowedRoles = ['super_admin', 'admin', 'Admin', 'ro-super-admin', 'ro-admin'];
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once '../products/product_category_schema.php';
require_once 'supplier_schema.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Only POST requests are allowed.']);
    exit();
}

$payload = json_decode(file_get_contents('php://input'), true);
$supplierProductId = cleanId($payload['supplier_product_id'] ?? null);
$purchaseUnit = trim((string) ($payload['purchase_unit'] ?? ''));
$contains = $payload['purchase_unit_contains'] ?? ($payload['units_per_purchase_unit'] ?? null);
$innerUnit = '';
$unitsPerInner = null;

if ($supplierProductId === '' || $purchaseUnit === ''
    || !is_numeric($contains) || (int) $contains < 1 || (float)$contains !== (float)(int)$contains
    || ($innerUnit !== '' && (!is_numeric($unitsPerInner) || (int) $unitsPerInner < 1 || (float)$unitsPerInner !== (float)(int)$unitsPerInner))) {
    http_response_code(422);
    echo json_encode(['status' => 'error', 'message' => 'A valid final purchase-unit conversion is required.']);
    exit();
}

try {
    ensureSupplierProductInventoryUnitColumn($pdo);
    ensureSupplierPurchasingConversionSchema($pdo);
    $savedStatement = $pdo->prepare('SELECT product_id,purchase_unit, inner_unit, inventory_unit FROM supplier_products WHERE supplier_product_id = :supplier_product_id LIMIT 1');
    $savedStatement->execute([':supplier_product_id' => $supplierProductId]);
    $savedHierarchy = $savedStatement->fetch(PDO::FETCH_ASSOC);
    if (!$savedHierarchy) throw new InvalidArgumentException('Supplier product assignment was not found.');
    $inventoryUnit = productInventoryUnitForSupplier($pdo,(string)$savedHierarchy['product_id'])['unit_name'];
    validateSupplierPurchasingHierarchyUnits($pdo, [
        'purchase_unit' => $purchaseUnit,
        'inner_unit' => $innerUnit,
        'inventory_unit' => $inventoryUnit,
        'purchase_unit_contains' => $contains,
    ], $savedHierarchy);
    $conversionSetup = [
        'purchase_unit' => $purchaseUnit,
        'purchase_unit_contains' => (int) $contains,
        'inner_unit' => $innerUnit,
        'units_per_inner_unit' => $unitsPerInner,
        'inventory_unit' => $inventoryUnit,
        'units_per_purchase_unit' => (int) $contains,
    ];
    $conversion = supplierPurchasingConversion($conversionSetup);
    foreach (array_slice($conversion['hierarchy_levels'], 1, -1) as $level) {
        validateSupplierPurchasingUnit($pdo, (string)$level['unit'], 'Packaging Unit', null, 'inner');
    }
    $pdo->beginTransaction();
    $statement = $pdo->prepare(
        'UPDATE supplier_products
         SET purchase_unit = :purchase_unit,
             purchase_unit_contains = :purchase_unit_contains,
             inner_unit = :inner_unit,
             units_per_inner_unit = :units_per_inner_unit,
             inventory_unit = :inventory_unit,
             units_per_purchase_unit = :units_per_purchase_unit
         WHERE supplier_product_id = :supplier_product_id'
    );
    $statement->execute([
        ':purchase_unit' => $purchaseUnit,
        ':purchase_unit_contains' => (int) $conversion['contains'],
        ':inner_unit' => !empty($conversion['inner_unit']) ? $conversion['inner_unit'] : null,
        ':units_per_inner_unit' => $conversion['units_per_inner_unit'],
        ':inventory_unit' => $inventoryUnit,
        ':units_per_purchase_unit' => $conversion['base_qty_per_purchase_unit'],
        ':supplier_product_id' => $supplierProductId
    ]);
    syncSupplierProductUnitConversions($pdo,$supplierProductId,[
        'purchase_unit'=>$purchaseUnit,
        'purchase_unit_contains'=>(int)$contains,
        'inner_unit'=>$innerUnit,
        'units_per_inner_unit'=>$conversion['units_per_inner_unit'],
        'inventory_unit'=>$inventoryUnit,
        'units_per_purchase_unit'=>$conversion['base_qty_per_purchase_unit'],
        'hierarchy_levels'=>$conversion['hierarchy_levels'],
    ]);
    if ($statement->rowCount() === 0) {
        $check = $pdo->prepare('SELECT COUNT(*) FROM supplier_products WHERE supplier_product_id = :supplier_product_id');
        $check->execute([':supplier_product_id' => $supplierProductId]);
        if (!(int) $check->fetchColumn()) {
            http_response_code(404);
            echo json_encode(['status' => 'error', 'message' => 'Supplier product assignment was not found.']);
            $pdo->rollBack();
            exit();
        }
    }
    $pdo->commit();
    echo json_encode(['status' => 'success', 'message' => 'Supplier purchasing setup updated successfully.', 'conversion' => $conversion]);
} catch (InvalidArgumentException $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    http_response_code(422);
    echo json_encode(['status' => 'error', 'message' => $error->getMessage()]);
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to update supplier purchasing setup.']);
}
