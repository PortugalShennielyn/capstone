<?php
$allowedRoles = ['super_admin', 'admin', 'Admin', 'ro-super-admin', 'ro-admin'];
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once '../products/product_category_schema.php';
require_once '../activity_log_helpers.php';
require_once 'supplier_schema.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Only POST requests are allowed.']);
    exit();
}

$payload = json_decode(file_get_contents('php://input'), true);
$supplierProductId = cleanId($payload['supplier_product_id'] ?? null);
$purchaseUnit = trim((string) ($payload['purchase_unit'] ?? ''));
$supplierCostInput = $payload['supplier_cost_input'] ?? null;
if ($supplierProductId === '' || $purchaseUnit === '') {
    http_response_code(422);
    echo json_encode(['status'=>'error','message'=>'Supplier product and Purchase Unit are required.']);
    exit;
}

try {
    ensureSupplierProductInventoryUnitColumn($pdo);
    ensureSupplierPurchasingConversionSchema($pdo);
    $savedStatement = $pdo->prepare('SELECT sp.product_id,sp.purchase_unit,sp.inner_unit,sp.inventory_unit,p.price,p.status FROM supplier_products sp INNER JOIN product p ON p.product_id=sp.product_id WHERE sp.supplier_product_id = :supplier_product_id LIMIT 1');
    $savedStatement->execute([':supplier_product_id' => $supplierProductId]);
    $savedHierarchy = $savedStatement->fetch(PDO::FETCH_ASSOC);
    if (!$savedHierarchy) throw new InvalidArgumentException('Supplier product assignment was not found.');
    $inventoryUnit = productInventoryUnitForSupplier($pdo,(string)$savedHierarchy['product_id'])['unit_name'];
    if (!array_key_exists('hierarchy_levels', $payload)) {
        $existing = supplierProductPurchasingHierarchy($pdo, $supplierProductId);
        if (count($existing['hierarchy_levels'] ?? []) > 1) throw new InvalidArgumentException('Send the complete saved packaging breakdown when editing this assignment.');
    }
    $conversion = supplierPurchasingSetupFromPayload($pdo, $payload, $inventoryUnit);
    $purchaseUnit = $conversion['purchase_unit'];
    if ($supplierCostInput !== null && $supplierCostInput !== '') {
        if (!is_numeric($supplierCostInput) || !is_finite((float) $supplierCostInput) || (float) $supplierCostInput < 0) {
            throw new InvalidArgumentException('Supplier Price must be a valid amount greater than or equal to zero.');
        }
        $supplierCostInput = (float) $supplierCostInput;
    } else {
        $supplierCostInput = null;
    }
    $productPrice = null;
    if (array_key_exists('product_price', $payload)) {
        $productPriceText = trim((string) $payload['product_price']);
        if ($productPriceText === '' || !preg_match('/^\d+(?:\.\d{1,2})?$/', $productPriceText) || !is_finite((float) $productPriceText)) {
            throw new InvalidArgumentException('Product Master Base Price must be numeric with no more than 2 decimal places.');
        }
        $productPrice = (float) $productPriceText;
        if (strtolower((string) $savedHierarchy['status']) === 'active' && $productPrice <= 0) {
            throw new InvalidArgumentException('An active product price must be greater than zero.');
        }
    }
    ensureActivityLogSchema($pdo);
    $pdo->beginTransaction();
    $statement = $pdo->prepare(
        'UPDATE supplier_products
         SET purchase_unit = :purchase_unit,
             supplier_cost_price = :supplier_cost_price,
             supplier_cost_input = :supplier_cost_input,
             supplier_cost_basis = \'purchase\',
             purchase_unit_contains = :purchase_unit_contains,
             inner_unit = :inner_unit,
             units_per_inner_unit = :units_per_inner_unit,
             inventory_unit = :inventory_unit,
             units_per_purchase_unit = :units_per_purchase_unit
         WHERE supplier_product_id = :supplier_product_id'
    );
    $statement->execute([
        ':purchase_unit' => $purchaseUnit,
        ':supplier_cost_price' => $supplierCostInput === null ? null : $supplierCostInput / max(1, (int) $conversion['base_qty_per_purchase_unit']),
        ':supplier_cost_input' => $supplierCostInput,
        ':purchase_unit_contains' => (int) $conversion['contains'],
        ':inner_unit' => !empty($conversion['inner_unit']) ? $conversion['inner_unit'] : null,
        ':units_per_inner_unit' => $conversion['units_per_inner_unit'],
        ':inventory_unit' => $inventoryUnit,
        ':units_per_purchase_unit' => $conversion['base_qty_per_purchase_unit'],
        ':supplier_product_id' => $supplierProductId
    ]);
    syncSupplierProductUnitConversions($pdo,$supplierProductId,$conversion);
    if ($productPrice !== null && abs((float) $savedHierarchy['price'] - $productPrice) >= 0.005) {
        $priceUpdate = $pdo->prepare('UPDATE product SET price=:price WHERE product_id=:product_id');
        $priceUpdate->execute([':price' => $productPrice, ':product_id' => $savedHierarchy['product_id']]);
        recordActivityLog($pdo, 'Pricing', 'Product pricing updated', json_encode([
            'source' => 'Supplier module',
            'previous_selling_price' => round((float) $savedHierarchy['price'], 2),
            'new_selling_price' => round($productPrice, 2),
            'pricing_method_preserved' => true,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), (string) $savedHierarchy['product_id']);
    }
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
    echo json_encode(['status' => 'success', 'message' => 'Supplier setup and product price updated successfully.', 'conversion' => $conversion]);
} catch (InvalidArgumentException $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    http_response_code(422);
    echo json_encode(['status' => 'error', 'message' => $error->getMessage()]);
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to update supplier purchasing setup.']);
}
