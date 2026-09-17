<?php
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once '../products/product_category_schema.php';
require_once '../products/product_pricing_schema.php';
require_once 'supplier_schema.php';

try {
    $page = max(1, (int)($_GET['page'] ?? 1));
    $perPage = min(100, max(10, (int)($_GET['per_page'] ?? 50)));
    $offset = ($page - 1) * $perPage;
    $search = trim((string)($_GET['search'] ?? ''));
    $supplierFilter = trim((string)($_GET['supplier'] ?? ''));
    $categoryFilter = trim((string)($_GET['category'] ?? ''));
    $typeFilter = trim((string)($_GET['type'] ?? ''));
    $purchaseUnitFilter = trim((string)($_GET['purchase_unit'] ?? ''));

    $conditions = ['s.archived_at IS NULL'];
    $parameters = [];
    if ($search !== '') {
        $conditions[] = "(CONCAT_WS(' ', s.supplier_name, p.brand_name, p.product_name, p.barcode, pc.category_name, pt.type_name) LIKE :search_identity
            OR EXISTS (
                SELECT 1 FROM product_specification_values search_psv
                LEFT JOIN product_measurement_units search_pmu ON search_pmu.measurement_unit_id=search_psv.measurement_unit_id
                WHERE search_psv.product_id=p.product_id
                  AND CONCAT_WS(' ', search_psv.value_text, search_psv.value_number, search_pmu.unit_name, search_pmu.unit_symbol) LIKE :search_specification
            ))";
        $parameters[':search_identity'] = '%' . $search . '%';
        $parameters[':search_specification'] = '%' . $search . '%';
    }
    if ($supplierFilter !== '') { $conditions[] = 's.supplier_name = :supplier'; $parameters[':supplier'] = $supplierFilter; }
    if ($categoryFilter !== '') { $conditions[] = 'pc.category_name = :category'; $parameters[':category'] = $categoryFilter; }
    if ($typeFilter !== '') { $conditions[] = 'pt.type_name = :type'; $parameters[':type'] = $typeFilter; }
    if ($purchaseUnitFilter !== '') { $conditions[] = 'sp.purchase_unit = :purchase_unit'; $parameters[':purchase_unit'] = $purchaseUnitFilter; }
    $whereSql = implode(' AND ', $conditions);

    $countStatement = $pdo->prepare(
        "SELECT COUNT(*)
         FROM supplier_products sp
         INNER JOIN suppliers s ON s.supplier_id = sp.supplier_id
         INNER JOIN product p ON p.product_id = sp.product_id
         LEFT JOIN product_categories pc ON pc.category_id = p.category_id
         LEFT JOIN product_types pt ON pt.type_id = p.type_id
         WHERE {$whereSql}"
    );
    $countStatement->execute($parameters);
    $total = (int)$countStatement->fetchColumn();
    $totalPages = max(1, (int)ceil($total / $perPage));
    if ($page > $totalPages) { $page = $totalPages; $offset = ($page - 1) * $perPage; }

    $sql = "SELECT
            sp.supplier_product_id, sp.supplier_id, sp.supplier_cost_price, sp.supplier_cost_input,
            sp.supplier_cost_basis, sp.purchase_unit, sp.purchase_unit_contains, sp.inner_unit,
            sp.units_per_inner_unit, sp.inventory_unit,
            pmu.unit_name AS product_base_unit_name, pmu.unit_symbol AS product_base_unit_symbol,
            COALESCE(sp.units_per_purchase_unit, 1) AS units_per_purchase_unit,
            s.supplier_name, supplier_totals.supplier_count,
            COALESCE(po_stats.active_purchase_order_count, 0) AS active_purchase_order_count,
            COALESCE(po_stats.historical_purchase_order_count, 0) AS historical_purchase_order_count,
            po_stats.latest_purchase_order_number, po_stats.latest_purchase_order_status, po_stats.latest_purchase_date,
            p.product_id, p.brand_name, p.product_name, p.category_id, p.type_id,
            pc.category_name, pt.type_name,
            md.generic_name, md.dosage_form, msd.material, msd.sterile_status,
            COALESCE(md.package_type, gd.package_type, msd.package_type) AS package_type,
            COALESCE(md.package_type, gd.package_type, msd.package_type) AS packaging,
            COALESCE(gd.variant, msd.variant) AS variant_flavor,
            COALESCE(md.strength_value, md.strength) AS strength_value, md.strength_unit, md.strength,
            md.net_content_value, md.net_content_unit, md.net_content_value AS volume_value,
            md.net_content_unit AS volume_unit, COALESCE(gd.size, msd.size) AS size_value,
            COALESCE(gd.size, msd.size) AS display_size, gd.net_weight AS weight_volume_value,
            gd.net_weight AS net_weight, gd.unit AS weight_volume_unit, gd.unit AS unit,
            CASE WHEN LOWER(COALESCE(md.dosage_form, '')) IN ('tablet','capsule','caplet') THEN 'pcs'
                 ELSE COALESCE(md.dosage_form, '') END AS product_unit,
            CASE WHEN LOWER(COALESCE(md.dosage_form, '')) IN ('tablet','capsule','caplet') THEN 'pcs'
                 ELSE COALESCE(md.dosage_form, '') END AS measurement_unit_name,
            COALESCE(gd.pack_content, msd.pack_content) AS pack_content,
            COALESCE(gd.pack_content, msd.pack_content) AS pack_content_unit,
            p.price, p.barcode, NULL AS sku, 0 AS stock,
            COALESCE(md.strength_value, md.strength) AS strength_size_value,
            COALESCE(NULLIF(md.strength, ''), NULLIF(CONCAT_WS(' ', md.strength_value, md.strength_unit), '')) AS strength_size_display
         FROM supplier_products sp
         INNER JOIN suppliers s ON s.supplier_id = sp.supplier_id
         INNER JOIN product p ON p.product_id = sp.product_id
         LEFT JOIN product_measurement_units pmu ON pmu.measurement_unit_id = p.inventory_unit_id
         INNER JOIN (SELECT product_id, COUNT(DISTINCT supplier_id) AS supplier_count FROM supplier_products GROUP BY product_id)
            supplier_totals ON supplier_totals.product_id = sp.product_id
         LEFT JOIN product_categories pc ON pc.category_id = p.category_id
         LEFT JOIN product_types pt ON pt.type_id = p.type_id
         LEFT JOIN medicine_details md ON md.product_id = p.product_id
         LEFT JOIN grocery_details gd ON gd.product_id = p.product_id
         LEFT JOIN medical_supply_details msd ON msd.product_id = p.product_id
         LEFT JOIN (
            SELECT ranked.supplier_id, ranked.product_id,
                   SUM(CASE WHEN LOWER(TRIM(ranked.status)) NOT IN ('cancelled','canceled','rejected','delivered','delivered with return/damage','completed') THEN 1 ELSE 0 END) AS active_purchase_order_count,
                   COUNT(*) AS historical_purchase_order_count,
                   MAX(CASE WHEN ranked.row_number = 1 THEN ranked.po_number END) AS latest_purchase_order_number,
                   MAX(CASE WHEN ranked.row_number = 1 THEN ranked.status END) AS latest_purchase_order_status,
                   MAX(CASE WHEN ranked.row_number = 1 THEN ranked.created_at END) AS latest_purchase_date
            FROM (
                SELECT po.supplier_id, poi.product_id, po.po_number, po.status, po.created_at,
                       ROW_NUMBER() OVER (PARTITION BY po.supplier_id, poi.product_id ORDER BY po.created_at DESC, po.po_id DESC) AS row_number
                FROM purchase_order_items poi INNER JOIN purchase_orders po ON po.po_id = poi.po_id
            ) ranked
            GROUP BY ranked.supplier_id, ranked.product_id
         ) po_stats ON po_stats.supplier_id = sp.supplier_id AND po_stats.product_id = sp.product_id
         WHERE {$whereSql}
         ORDER BY s.supplier_name, p.product_name, sp.supplier_product_id
         LIMIT :limit OFFSET :offset";
    $statement = $pdo->prepare($sql);
    foreach ($parameters as $name => $value) $statement->bindValue($name, $value, PDO::PARAM_STR);
    $statement->bindValue(':limit', $perPage, PDO::PARAM_INT);
    $statement->bindValue(':offset', $offset, PDO::PARAM_INT);
    $statement->execute();
    $products = $statement->fetchAll(PDO::FETCH_ASSOC);

    $productIds = array_values(array_unique(array_column($products, 'product_id')));
    $specificationsByProduct = [];
    if ($productIds) {
        $specificationPlaceholders = implode(',', array_fill(0, count($productIds), '?'));
        $specificationStatement = $pdo->prepare(
            "SELECT psv.product_id, ps.specification_id, ps.specification_name,
                    COALESCE(NULLIF(pts.display_label, ''), ps.specification_name) AS display_name,
                    ps.field_style, psv.value_text, psv.value_number, psv.measurement_unit_id,
                    COALESCE(NULLIF(pmu.unit_symbol, ''), pmu.unit_name) AS unit_symbol
             FROM product_specification_values psv
             INNER JOIN product p ON p.product_id = psv.product_id
             INNER JOIN product_specifications ps ON ps.specification_id = psv.specification_id
             LEFT JOIN product_type_specifications pts ON pts.type_id = p.type_id AND pts.specification_id = psv.specification_id
             LEFT JOIN product_measurement_units pmu ON pmu.measurement_unit_id = psv.measurement_unit_id
             WHERE psv.product_id IN ({$specificationPlaceholders})
             ORDER BY psv.product_id, pts.sort_order, ps.specification_name"
        );
        $specificationStatement->execute($productIds);
        foreach ($specificationStatement->fetchAll(PDO::FETCH_ASSOC) as $specification) {
            $specificationsByProduct[(string)$specification['product_id']][] = $specification;
        }
    }

    $hierarchies = supplierProductPurchasingHierarchies($pdo, array_column($products, 'supplier_product_id'));
    $pricingSnapshots = productPricingSnapshots($pdo, array_column($products, 'product_id'));
    $canViewSupplierCost = currentSessionHasRbacRole('super_admin') || currentSessionHasRbacRole('ro_super_admin')
        || currentSessionHasRbacRole('admin') || currentSessionHasRbacRole('ro_admin')
        || currentSessionHasRbacRole('supervisor') || currentSessionHasRbacRole('ro_supervisor');
    foreach ($products as &$product) {
        $product['specifications'] = $specificationsByProduct[(string)$product['product_id']] ?? [];
        $normalizedHierarchy = $hierarchies[(string)$product['supplier_product_id']] ?? [];
        if (!empty($normalizedHierarchy['hierarchy_levels'])) {
            $product['hierarchy_levels'] = $normalizedHierarchy['hierarchy_levels'];
            $product['units_per_purchase_unit'] = $normalizedHierarchy['units_per_purchase_unit'];
        }
        $product['base_unit_name'] = $normalizedHierarchy['base_unit_name']
            ?? $product['product_base_unit_name']
            ?? $product['inventory_unit'];
        $product['inventory_unit'] = $product['base_unit_name'];
        $product = enrichSupplierPurchasingSetup($product);
        $product['pricing'] = $pricingSnapshots[$product['product_id']] ?? null;
        if (!$product['pricing']) throw new RuntimeException('Product pricing details are unavailable.');
        $product['category_markup_percentage'] = $product['pricing']['category_markup_percentage'];
        $product['pricing_behavior'] = $product['pricing']['pricing_behavior'];
        $product['selling_price'] = (float)$product['price'];
        if ($canViewSupplierCost) {
            $product['supplier_cost_per_base_unit'] = round((float)($product['supplier_cost_price'] ?? 0), 4);
            $product['calculated_selling_price'] = calculatedSellingPrice($product['supplier_cost_per_base_unit'], (float)$product['pricing']['applied_markup_percentage']);
            $product['price_difference'] = round($product['calculated_selling_price'] - (float)$product['price'], 2);
        } else {
            unset($product['supplier_cost_price'], $product['supplier_cost_input'], $product['supplier_cost_basis'], $product['supplier_cost_per_inventory_unit'], $product['estimated_purchase_unit_cost']);
        }
    }
    unset($product);

    $facetRows = $pdo->query(
        "SELECT 'supplier' facet, s.supplier_name value FROM supplier_products sp INNER JOIN suppliers s ON s.supplier_id=sp.supplier_id WHERE s.archived_at IS NULL GROUP BY s.supplier_name
         UNION ALL SELECT 'category', pc.category_name FROM supplier_products sp INNER JOIN suppliers s ON s.supplier_id=sp.supplier_id AND s.archived_at IS NULL INNER JOIN product p ON p.product_id=sp.product_id INNER JOIN product_categories pc ON pc.category_id=p.category_id GROUP BY pc.category_name
         UNION ALL SELECT 'type', pt.type_name FROM supplier_products sp INNER JOIN suppliers s ON s.supplier_id=sp.supplier_id AND s.archived_at IS NULL INNER JOIN product p ON p.product_id=sp.product_id INNER JOIN product_types pt ON pt.type_id=p.type_id GROUP BY pt.type_name
         UNION ALL SELECT 'purchase_unit', sp.purchase_unit FROM supplier_products sp INNER JOIN suppliers s ON s.supplier_id=sp.supplier_id AND s.archived_at IS NULL WHERE NULLIF(TRIM(sp.purchase_unit),'') IS NOT NULL GROUP BY sp.purchase_unit"
    )->fetchAll(PDO::FETCH_ASSOC);
    $filters = ['supplier'=>[], 'category'=>[], 'type'=>[], 'purchase_unit'=>[]];
    foreach ($facetRows as $facet) $filters[$facet['facet']][] = $facet['value'];
    foreach ($filters as &$values) { natcasesort($values); $values = array_values($values); }
    unset($values);

    echo json_encode(['status'=>'success', 'products'=>$products, 'filters'=>$filters, 'pagination'=>[
        'page'=>$page, 'per_page'=>$perPage, 'total'=>$total, 'total_pages'=>$totalPages
    ]]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['status'=>'error', 'message'=>'Unable to load supplier product list.', 'error'=>$e->getMessage()]);
}
?>
