<?php
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once 'product_pricing_schema.php';
require_once 'supplier_invoice_pricing.php';
require_once 'product_customization_schema.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Only GET requests are allowed.']);
    exit();
}

$productId = cleanId($_GET['product_id'] ?? null);
if (!$productId) {
    http_response_code(422);
    echo json_encode(['status' => 'error', 'message' => 'A valid product ID is required.']);
    exit();
}

try {
    ensureProductCustomizationSchema($pdo);
    $statement = $pdo->prepare(
        "SELECT
            p.product_id,
            p.type_id,
            p.inventory_unit_id,
            pmu.unit_name AS inventory_unit_name,
            COALESCE(NULLIF(pmu.unit_symbol,''),pmu.unit_name) AS inventory_unit_symbol,
            p.barcode,
            p.brand_name,
            p.product_name,
            p.price,
            p.status,
            p.created_at,
            pc.category_name,
            pt.type_name,
            md.generic_name,
            classification_values.medicine_classification,
            classification_values.medicine_classification_badge,
            md.strength,
            md.strength_value,
            md.strength_unit,
            md.dosage_form,
            md.package_type AS medicine_package_type,
            md.net_content_value,
            md.net_content_unit,
            gd.variant,
            gd.size,
            gd.net_weight,
            gd.unit AS grocery_unit,
            gd.package_type AS grocery_package_type,
            gd.pack_content,
            msd.variant AS medical_variant,
            msd.size AS medical_size,
            msd.material,
            msd.sterile_status,
            msd.package_type AS medical_package_type,
            msd.pack_content AS medical_pack_content,
            COALESCE(stock.storage_quantity, 0) AS storage_quantity,
            COALESCE(stock.shelf_quantity, 0) AS shelf_quantity,
            COALESCE(stock.storage_quantity, 0) + COALESCE(stock.shelf_quantity, 0) AS on_hand_quantity,
            COALESCE(stock.damaged_quantity, 0) AS damaged_quantity,
            COALESCE(stock.returned_quantity, 0) AS returned_quantity,
            COALESCE(stock.active_batch_count, 0) AS active_batch_count,
            stock.nearest_expiry_date,
            COALESCE(replacements.replacement_pending_quantity, 0) AS replacement_pending_quantity
         FROM product p
         LEFT JOIN product_categories pc ON pc.category_id = p.category_id
         LEFT JOIN product_types pt ON pt.type_id = p.type_id
         LEFT JOIN product_measurement_units pmu ON pmu.measurement_unit_id=p.inventory_unit_id
         LEFT JOIN medicine_details md ON md.product_id = p.product_id
         LEFT JOIN (
            SELECT psv.product_id,
                   psv.value_text AS medicine_classification,
                   CASE
                       WHEN LOWER(TRIM(psv.value_text)) = 'prescription (rx)' THEN 'Rx'
                       ELSE NULL
                   END AS medicine_classification_badge
            FROM product_specification_values psv
            INNER JOIN product_specifications ps ON ps.specification_id=psv.specification_id
            WHERE LOWER(TRIM(ps.specification_name))='medicine classification'
         ) classification_values ON classification_values.product_id=p.product_id
         LEFT JOIN grocery_details gd ON gd.product_id = p.product_id
         LEFT JOIN medical_supply_details msd ON msd.product_id = p.product_id
         LEFT JOIN (
            SELECT
                ib.product_id,
                SUM(ib.storage_qty) AS storage_quantity,
                SUM(COALESCE(shelf.shelf_quantity, 0)) AS shelf_quantity,
                SUM(ib.damaged_qty) AS damaged_quantity,
                SUM(ib.returned_qty) AS returned_quantity,
                SUM(CASE
                    WHEN (ib.storage_qty > 0 OR COALESCE(shelf.shelf_quantity, 0) > 0)
                     AND ib.batch_status NOT IN ('returned', 'depleted')
                    THEN 1 ELSE 0
                END) AS active_batch_count,
                MIN(CASE
                    WHEN (ib.storage_qty > 0 OR COALESCE(shelf.shelf_quantity, 0) > 0)
                     AND ib.batch_status NOT IN ('returned', 'depleted')
                    THEN ib.expiry_date ELSE NULL
                END) AS nearest_expiry_date
            FROM inventory_batches ib
            LEFT JOIN (
                SELECT source_batch_id, SUM(quantity_remaining) AS shelf_quantity
                FROM product_selling_stock
                WHERE source_batch_id IS NOT NULL
                GROUP BY source_batch_id
            ) shelf ON shelf.source_batch_id = ib.batch_id
            WHERE ib.product_id = :stock_product_id
              AND ib.batch_status IN ('active', 'expired', 'damaged', 'returned')
            GROUP BY ib.product_id
         ) stock ON stock.product_id = p.product_id
         LEFT JOIN (
            SELECT
                poi.product_id,
                SUM(GREATEST(por.replacement_expected_qty - por.replacement_received_qty, 0)) AS replacement_pending_quantity
            FROM supplier_claim_legacy_projection por
            INNER JOIN purchase_order_items poi ON poi.po_item_id = por.po_item_id
            WHERE poi.product_id = :replacement_product_id
              AND por.resolution_type = 'Replacement'
            GROUP BY poi.product_id
         ) replacements ON replacements.product_id = p.product_id
         WHERE p.product_id = :product_id
         LIMIT 1"
    );
    $statement->execute([
        ':product_id' => $productId,
        ':stock_product_id' => $productId,
        ':replacement_product_id' => $productId,
    ]);
    $row = $statement->fetch(PDO::FETCH_ASSOC);

    if (!$row) {
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => 'Product not found.']);
        exit();
    }

    $supplierStatement = $pdo->prepare(
        "SELECT
            s.supplier_id,
            s.supplier_name,
            sp.supplier_cost_price,
            sp.purchase_unit,
            sp.units_per_purchase_unit
         FROM supplier_products sp
         INNER JOIN suppliers s ON s.supplier_id = sp.supplier_id
         WHERE sp.product_id = :product_id
         ORDER BY s.supplier_name ASC"
    );
    $supplierStatement->execute([':product_id' => $productId]);
    $suppliers = $supplierStatement->fetchAll(PDO::FETCH_ASSOC);
    $specificationStatement = $pdo->prepare(
        "SELECT ps.specification_id, ps.specification_name,
                COALESCE(NULLIF(pts.display_label, ''), ps.specification_name) AS display_name,
                ps.field_style, psv.value_text, psv.value_number,
                psv.measurement_unit_id, pmu.unit_name,
                COALESCE(NULLIF(pmu.unit_symbol, ''), pmu.unit_name) AS unit_symbol,
                pmu.measurement_group, pmu.is_active AS measurement_unit_is_active
         FROM product_specification_values psv
         INNER JOIN product_specifications ps ON ps.specification_id = psv.specification_id
         LEFT JOIN product_type_specifications pts ON pts.type_id = :type_id AND pts.specification_id = psv.specification_id
         LEFT JOIN product_measurement_units pmu ON pmu.measurement_unit_id = psv.measurement_unit_id
         WHERE psv.product_id = :product_id
         ORDER BY pts.sort_order, ps.specification_name"
    );
    $specificationStatement->execute([':product_id' => $productId, ':type_id' => $row['type_id']]);
    $specifications = $specificationStatement->fetchAll();

    foreach ($suppliers as &$supplier) {
        $supplier['supplier_cost_price'] = $supplier['supplier_cost_price'] !== null ? (float) $supplier['supplier_cost_price'] : null;
        $supplier['units_per_purchase_unit'] = (int) ($supplier['units_per_purchase_unit'] ?? 1);
        $supplier['estimated_purchase_unit_cost'] = round((float) ($supplier['supplier_cost_price'] ?? 0) * $supplier['units_per_purchase_unit'], 2);
    }
    unset($supplier);

    $product = [
        'product_id' => $row['product_id'],
        'barcode' => $row['barcode'] ?? '',
        'brand_name' => $row['brand_name'] ?? '',
        'product_name' => $row['product_name'] ?? '',
        'category_name' => $row['category_name'] ?? '',
        'type_name' => $row['type_name'] ?? '',
        'price' => (float) ($row['price'] ?? 0),
        'status' => strcasecmp(trim((string) ($row['status'] ?? 'Active')), 'Inactive') === 0 ? 'Inactive' : 'Active',
        'created_at' => $row['created_at'] ?? null,
        'generic_name' => $row['generic_name'] ?? null,
        'medicine_classification' => $row['medicine_classification'] ?? null,
        'medicine_classification_badge' => $row['medicine_classification_badge'] ?? null,
        'strength' => $row['strength'] ?? null,
        'strength_value' => $row['strength_value'] ?? null,
        'strength_unit' => $row['strength_unit'] ?? null,
        'dosage_form' => $row['dosage_form'] ?? null,
        'package_type' => $row['medicine_package_type'] ?? $row['grocery_package_type'] ?? $row['medical_package_type'] ?? null,
        'net_content_value' => $row['net_content_value'] ?? null,
        'net_content_unit' => $row['net_content_unit'] ?? null,
        'variant' => $row['variant'] ?? $row['medical_variant'] ?? null,
        'medical_variant' => $row['medical_variant'] ?? null,
        'size' => $row['size'] ?? $row['medical_size'] ?? null,
        'medical_size' => $row['medical_size'] ?? null,
        'material' => $row['material'] ?? null,
        'sterile_status' => $row['sterile_status'] ?? null,
        'net_weight' => $row['net_weight'] ?? null,
        'unit' => $row['grocery_unit'] ?? null,
        'pack_content' => $row['pack_content'] ?? $row['medical_pack_content'] ?? null,
    ];

    $inventorySummary = [
        'shelf_quantity' => (int) $row['shelf_quantity'],
        'storage_quantity' => (int) $row['storage_quantity'],
        'on_hand_quantity' => (int) $row['on_hand_quantity'],
        'damaged_quantity' => (int) $row['damaged_quantity'],
        'returned_quantity' => (int) $row['returned_quantity'],
        'replacement_pending_quantity' => (int) $row['replacement_pending_quantity'],
        'nearest_expiry_date' => $row['nearest_expiry_date'] ?? null,
        'active_batch_count' => (int) $row['active_batch_count'],
    ];
    $pricingSnapshots = productPricingSnapshots($pdo, [$productId]);
    $pricing = $pricingSnapshots[$productId] ?? null;
    if (!$pricing) {
        throw new RuntimeException('Product pricing details are unavailable.');
    }
    foreach ($suppliers as &$supplier) {
        $supplier['is_latest_accepted_supplier'] = !empty($pricing['latest_cost_basis']['supplier_id'])
            && $pricing['latest_cost_basis']['supplier_id'] === $supplier['supplier_id'];
        $supplier['inventory_unit'] = $pricing['inventory_unit'];
    }
    unset($supplier);

    echo json_encode([
        'status' => 'success',
        'data' => [
            'product' => $product,
            'suppliers' => $suppliers,
            'inventory_summary' => $inventorySummary,
            'specifications' => $specifications,
            'pricing' => $pricing,
            'supplier_invoice_pricing' => supplierInvoicePricingSuggestions($pdo, $productId),
        ],
    ]);
} catch (Throwable $error) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Unable to load product details.',
        'error' => $error->getMessage(),
    ]);
}

?>
