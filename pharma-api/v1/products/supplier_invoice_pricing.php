<?php
require_once __DIR__ . '/product_pricing_schema.php';

/** Read-only invoice suggestions. The PO factor preserves the supplier hierarchy
 * used when ordering; current packaging edits must not revalue invoice history.
 * Invoice discounts/charges remain invoice-level, with no guessed allocation.
 */
function supplierInvoicePricingSuggestions(PDO $pdo, string $productId): array
{
    $query = $pdo->prepare("SELECT ii.invoice_item_id, ii.unit_cost AS purchase_unit_cost,
            i.invoice_id, i.invoice_number, i.invoice_date, i.discount, i.other_charges,
            oi.po_item_id, oi.purchase_unit_snapshot AS purchase_unit,
            oi.units_per_purchase_unit_snapshot AS units_per_purchase_unit,
            po.po_id, po.po_number, s.supplier_id, s.supplier_name
        FROM purchase_order_items oi
        JOIN purchase_order_invoice_items ii ON ii.po_item_id=oi.po_item_id
        JOIN purchase_order_invoices i ON i.invoice_id=ii.invoice_id AND i.po_id=oi.po_id
        JOIN purchase_orders po ON po.po_id=oi.po_id
        JOIN suppliers s ON s.supplier_id=po.supplier_id
        WHERE oi.product_id=? AND ii.invoice_qty>0 AND ii.unit_cost>0
          AND po.status IN ('Pending','Arrived','Delivered')
        ORDER BY i.invoice_date DESC,i.recorded_at DESC,i.invoice_id DESC,ii.invoice_item_id DESC
        LIMIT 1");
    $query->execute([$productId]);
    $basis = $query->fetch(PDO::FETCH_ASSOC);
    if (!$basis) return ['source'=>'Supplier invoice','requires_approval'=>true,'latest_invoice'=>null,'suggestions'=>[]];
    $productQuery = $pdo->prepare('SELECT product_id, product_name, brand_name, price, category_id, pricing_method, custom_markup_percentage FROM product WHERE product_id=?');
    $productQuery->execute([$productId]);
    $product = $productQuery->fetch(PDO::FETCH_ASSOC);
    $markup = $product['pricing_method']==='custom_markup' && $product['custom_markup_percentage']!==null
        ? (float)$product['custom_markup_percentage']
        : ($product['category_id'] ? categoryMarkupResolution($pdo, $product['category_id'])['markup_percentage'] : null);
    $base = productSellingBaseUnit($pdo, $productId);
    // Existing POS policy sells only the Product Master base unit.
    $options = productSellingOptions($pdo, $productId, true);
    if (!$options) $options = [['unit'=>$base['unit_name'],'base_quantity'=>1,'selling_price'=>$product['price']]];
    $factor = (float)$basis['units_per_purchase_unit'];
    $suggestions = [];
    foreach ($options as $option) {
        $cost = $factor > 0 ? (float)$basis['purchase_unit_cost'] / $factor * (float)$option['base_quantity'] : null;
        $suggestions[] = [
            'selling_option_id'=>$option['selling_option_id'] ?? null,
            'selling_unit'=>$option['unit'], 'latest_supplier_cost'=>(float)$basis['purchase_unit_cost'],
            'cost_per_selling_unit'=>$cost===null ? null : round($cost, 6),
            'current_selling_price'=>(float)$option['selling_price'], 'markup_percentage'=>$markup,
            'suggested_selling_price'=>$cost===null || $markup===null ? null : calculatedSellingPrice($cost, $markup),
            'requires_approval'=>true,
        ];
    }
    return ['source'=>'Supplier invoice','requires_approval'=>true,'latest_invoice'=>$basis,
        'cost_basis'=>'Invoice unit cost before header discount and other charges',
        'product_id'=>$productId,'product_name'=>$product['product_name'],'brand_name'=>$product['brand_name'],
        'suggestions'=>$suggestions];
}
