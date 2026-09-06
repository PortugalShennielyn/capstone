const fs = require('fs');
let p='pharma-api/v1/suppliers/assign_product.php',s=fs.readFileSync(p,'utf8');
let a=s.indexOf('    if (strcasecmp($purchaseUnit'),b=s.indexOf('    $supplierCheck',a);
s=s.slice(0,a)+`    $conversion = supplierPurchasingSetupFromPayload($pdo, $payload, $inventoryUnit);
    $purchaseUnit = $conversion['purchase_unit'];
    $unitsPerPurchaseUnit = $conversion['base_qty_per_purchase_unit'];

`+s.slice(b);
s=s.replace("    $statement = $pdo->prepare(\n        'INSERT INTO supplier_products", "    $pdo->beginTransaction();\n    $statement = $pdo->prepare(\n        'INSERT INTO supplier_products");
// Source uses CRLF; handle both newline conventions.
if(!s.includes('$pdo->beginTransaction();')) s=s.replace("    $statement = $pdo->prepare(\r\n        'INSERT INTO supplier_products", "    $pdo->beginTransaction();\r\n    $statement = $pdo->prepare(\r\n        'INSERT INTO supplier_products");
s=s.replace('purchase_unit_contains, inventory_unit, units_per_purchase_unit)', 'purchase_unit_contains, inner_unit, units_per_inner_unit, inventory_unit, units_per_purchase_unit)')
.replace(':purchase_unit_contains, :inventory_unit, :units_per_purchase_unit)', ':purchase_unit_contains, :inner_unit, :units_per_inner_unit, :inventory_unit, :units_per_purchase_unit)')
.replace("':purchase_unit_contains' => $unitsPerPurchaseUnit,", "':purchase_unit_contains' => $conversion['contains'],\n        ':inner_unit' => $conversion['inner_unit'] ?: null,\n        ':units_per_inner_unit' => $conversion['units_per_inner_unit'],");
a=s.indexOf('    syncSupplierProductUnitConversions');b=s.indexOf('    echo json_encode',a);
s=s.slice(0,a)+`    syncSupplierProductUnitConversions($pdo,$supplierProductId,$conversion);
    $pdo->commit();

`+s.slice(b);
s=s.replace("'message' => 'Product assigned to supplier successfully.'", "'message' => 'Product assigned to supplier successfully.',\n        'supplier_product_id' => $supplierProductId,\n        'conversion' => $conversion");
s=s.replace('} catch (InvalidArgumentException $e) {','} catch (InvalidArgumentException $e) {\n    if ($pdo->inTransaction()) $pdo->rollBack();').replace('} catch (PDOException $e) {','} catch (Throwable $e) {\n    if ($pdo->inTransaction()) $pdo->rollBack();');
fs.writeFileSync(p,s);
p='pharma-api/v1/suppliers/update_supplier_assignment.php';s=fs.readFileSync(p,'utf8');
a=s.indexOf('$contains =');b=s.indexOf('try {',a);
s=s.slice(0,a)+`if ($supplierProductId === '' || $purchaseUnit === '') {
    http_response_code(422);
    echo json_encode(['status'=>'error','message'=>'Supplier product and Purchase Unit are required.']);
    exit;
}

`+s.slice(b);
a=s.indexOf('    validateSupplierPurchasingHierarchyUnits');b=s.indexOf('    $statement = $pdo->prepare(',a);
s=s.slice(0,a)+`    if (!array_key_exists('hierarchy_levels', $payload)) {
        $existing = supplierProductPurchasingHierarchy($pdo, $supplierProductId);
        if (count($existing['hierarchy_levels'] ?? []) > 1) throw new InvalidArgumentException('Send the complete saved packaging breakdown when editing this assignment.');
    }
    $conversion = supplierPurchasingSetupFromPayload($pdo, $payload, $inventoryUnit);
    $purchaseUnit = $conversion['purchase_unit'];
    $pdo->beginTransaction();
`+s.slice(b);
a=s.indexOf('    syncSupplierProductUnitConversions');b=s.indexOf('    if ($statement->rowCount()',a);
s=s.slice(0,a)+`    syncSupplierProductUnitConversions($pdo,$supplierProductId,$conversion);
`+s.slice(b);
fs.writeFileSync(p,s);
