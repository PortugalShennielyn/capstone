<?php
declare(strict_types=1);

require_once __DIR__ . '/../pharma-api/config/db_connection.php';
require_once __DIR__ . '/../pharma-api/v1/products/product_pricing_schema.php';
require_once __DIR__ . '/../pharma-api/v1/products/product_selling_options.php';
require_once __DIR__ . '/../pharma-api/v1/suppliers/purchasing_conversion.php';

function buldakAssert(bool $ok, string $message): void
{
    if (!$ok) throw new RuntimeException($message);
    echo "PASS: {$message}\n";
}

$product = $pdo->query("SELECT p.product_id,p.price,p.pricing_method,p.category_id,
        sp.supplier_id,sp.supplier_cost_input,sp.units_per_purchase_unit,
        pc.default_markup_percentage,pmu.unit_name AS base_unit
    FROM product p
    INNER JOIN product_categories pc ON pc.category_id=p.category_id
    INNER JOIN product_measurement_units pmu ON pmu.measurement_unit_id=p.inventory_unit_id
    INNER JOIN supplier_products sp ON sp.product_id=p.product_id
    WHERE p.product_name='Buldak' AND pc.category_name='Grocery' AND p.status='Active'
    LIMIT 1")->fetch(PDO::FETCH_ASSOC);
buldakAssert((bool)$product, 'Buldak is an active Grocery product with a supplier assignment');
buldakAssert((int)$product['units_per_purchase_unit'] === 5 && strcasecmp((string)$product['base_unit'], 'pcs') === 0,
    'Buldak purchasing conversion is one purchase unit to five pcs');
buldakAssert(inventoryQuantityForPurchaseQuantity(5, 5) === 25, 'Five purchased packs become 25 accepted pcs');
buldakAssert(sellingUnitBaseQuantity(1, 5) === 5 && sellingUnitBaseQuantity(1, 1) === 1,
    'Selling one Pack deducts five pcs and selling one pc deducts one pc');

$productId = (string)$product['product_id'];
$originalPrice = (float)$product['price'];
$quotedCost = $product['supplier_cost_input'];
$poId = newUuid($pdo);
$poItemId = newUuid($pdo);
$invoiceId = newUuid($pdo);
$batchId = newUuid($pdo);

$pdo->beginTransaction();
try {
    $pdo->prepare("INSERT INTO purchase_orders
        (po_id,po_number,supplier_id,payment_terms,expected_delivery_date,final_payment,status,approval_status,payment_status,total_amount)
        VALUES (:id,:number,:supplier,'Cash',CURRENT_DATE,0,'Delivered','Approved','Unpaid',1250)")
        ->execute([':id'=>$poId,':number'=>'TEST-BULDAK-'.substr(str_replace('-','',$poId),0,10),':supplier'=>$product['supplier_id']]);
    $pdo->prepare("INSERT INTO purchase_order_items
        (po_item_id,po_id,product_id,quantity,purchase_qty,purchase_unit_snapshot,
         units_per_purchase_unit_snapshot,inventory_qty_ordered,product_name_snapshot,unit_snapshot,unit_price_snapshot,line_total)
        VALUES (:id,:po,:product,25,5,'Pack',5,25,'Buldak','pcs',100,2500)")
        ->execute([':id'=>$poItemId,':po'=>$poId,':product'=>$productId]);
    $pdo->prepare("INSERT INTO purchase_order_invoices
        (invoice_id,po_id,invoice_number,invoice_date,discount,other_charges,supplier_invoice_total)
        VALUES (:id,:po,'TEST-BULDAK-250',CURRENT_DATE,0,0,1250)")
        ->execute([':id'=>$invoiceId,':po'=>$poId]);
    $pdo->prepare('INSERT INTO purchase_order_invoice_items
        (invoice_item_id,invoice_id,po_item_id,unit_cost,invoice_qty)
        VALUES (:id,:invoice,:item,250,5)')
        ->execute([':id'=>newUuid($pdo),':invoice'=>$invoiceId,':item'=>$poItemId]);
    $pdo->prepare("INSERT INTO inventory_batches
        (batch_id,po_id,po_item_id,product_id,supplier_id,received_date,received_qty,storage_qty,shelf_qty,
         damaged_qty,returned_qty,unit_cost,batch_status)
        VALUES (:id,:po,:item,:product,:supplier,'2099-01-01 00:00:00',25,25,0,0,0,50,'active')")
        ->execute([':id'=>$batchId,':po'=>$poId,':item'=>$poItemId,':product'=>$productId,':supplier'=>$product['supplier_id']]);

    $basis = latestAcceptedCostBasis($pdo, $productId);
    buldakAssert($basis && $basis['batch_id'] === $batchId && (float)$basis['unit_cost'] === 50.0,
        'Accepted invoice cost of ₱250 per Pack yields ₱50 per pc, independently of the supplier quote and PO snapshot');
    buldakAssert((float)$pdo->query('SELECT price FROM product WHERE product_id='.$pdo->quote($productId))->fetchColumn() === $originalPrice,
        'Recording accepted cost leaves the existing selling price unchanged');
    $preview = selectedCategoryPricingPreview($pdo, [$productId], false, true)[0];
    buldakAssert($preview['eligible_for_apply'] && (float)$preview['applied_markup_percentage'] === 15.0,
        'Buldak is eligible for the Grocery 15% markup preview');
    buldakAssert($preview['accepted_purchase_unit'] === 'Pack' && $preview['accepted_conversion'] === 5,
        'Preview includes the accepted Pack to pcs conversion');
    $units = [];
    foreach ($preview['sellable_units'] as $unit) $units[(int)$unit['base_quantity']] = $unit;
    buldakAssert(isset($units[1],$units[5]), 'Preview includes pcs and Pack sellable units');
    buldakAssert((float)$units[1]['unit_cost'] === 50.0 && (float)$units[1]['new_price'] === 57.5,
        'Suggested pcs price is ₱57.50 from accepted cost, not current selling price');
    buldakAssert((float)$units[5]['unit_cost'] === 250.0 && (float)$units[5]['new_price'] === 287.5,
        'Suggested Pack price is ₱287.50 and is not multiplied by five ordered Packs');

    $result = applyCategoryMarkupToSelectedProducts($pdo, [$productId], true,
        [$productId=>$preview['preview_token']], true, true);
    buldakAssert(($result['applied_products'] ?? 0) === 1, 'Admin-confirmed category markup updates Buldak once');
    $saved = $pdo->prepare('SELECT price,pricing_method FROM product WHERE product_id=:id');
    $saved->execute([':id'=>$productId]);
    $saved = $saved->fetch(PDO::FETCH_ASSOC);
    buldakAssert((float)$saved['price'] === 57.5 && $saved['pricing_method'] === 'category_markup',
        'Product Master switches to Category Markup only after confirmation');
    $optionPrices = $pdo->prepare('SELECT base_quantity,selling_price FROM product_selling_options WHERE product_id=:id AND is_active=1');
    $optionPrices->execute([':id'=>$productId]);
    $prices = [];
    foreach ($optionPrices->fetchAll(PDO::FETCH_ASSOC) as $option) $prices[(int)$option['base_quantity']] = (float)$option['selling_price'];
    buldakAssert(($prices[1] ?? null) === 57.5 && ($prices[5] ?? null) === 287.5,
        'POS and Shelf Inventory selling options use the confirmed pcs and Pack prices');
    $stock = $pdo->prepare('SELECT received_qty,storage_qty FROM inventory_batches WHERE batch_id=:id');
    $stock->execute([':id'=>$batchId]);
    $stock = $stock->fetch(PDO::FETCH_ASSOC);
    buldakAssert((int)$stock['received_qty'] === 25 && (int)$stock['storage_qty'] === 25,
        'Applying markup does not duplicate or change accepted inventory');
    buldakAssert(!selectedCategoryPricingPreview($pdo, [$productId], false, true)[0]['eligible_for_apply'],
        'An unchanged product is not eligible for duplicate markup');
    $supplierQuote = $pdo->prepare('SELECT supplier_cost_input FROM supplier_products WHERE product_id=:product AND supplier_id=:supplier');
    $supplierQuote->execute([':product'=>$productId,':supplier'=>$product['supplier_id']]);
    buldakAssert($supplierQuote->fetchColumn() === $quotedCost, 'Supplier quoted cost remains separate from the accepted invoice cost');
} finally {
    $pdo->rollBack();
}

echo "Buldak purchasing-to-pricing workflow checks completed.\n";
