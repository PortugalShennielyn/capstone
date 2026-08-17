<?php

require_once __DIR__ . '/product_category_schema.php';
require_once __DIR__ . '/../activity_log_helpers.php';
require_once __DIR__ . '/product_selling_options.php';

const PRODUCT_PRICING_METHODS = ['category_markup', 'custom_markup', 'manual'];
const CATEGORY_PRICING_BEHAVIORS = ['automatic', 'review_required'];
const DEFAULT_CATEGORY_MARKUPS = [
    'medicine' => ['name' => 'Medicine', 'markup' => 5.00],
    'grocery' => ['name' => 'Grocery', 'markup' => 15.00],
    'medical supplies' => ['name' => 'Medical Supplies', 'markup' => 15.00],
];
const DEFAULT_FALLBACK_CATEGORY_MARKUP = 15.00;
const DEFAULT_CATEGORY_MARKUP_MIGRATION = 'category-markups-v1';

function ensureProductPricingSchema(PDO $pdo): void
{
    ensureProductCategorySchema($pdo);

    if (!tableHasColumn($pdo, 'product_categories', 'default_markup_percentage')) {
        $pdo->exec("ALTER TABLE product_categories ADD COLUMN default_markup_percentage DECIMAL(7,2) NOT NULL DEFAULT 0.00 AFTER category_name");
    }
    if (!tableHasColumn($pdo, 'product_categories', 'pricing_behavior')) {
        $pdo->exec("ALTER TABLE product_categories ADD COLUMN pricing_behavior VARCHAR(30) NOT NULL DEFAULT 'review_required' AFTER default_markup_percentage");
    }
    if (!tableHasColumn($pdo, 'product', 'pricing_method')) {
        $pdo->exec("ALTER TABLE product ADD COLUMN pricing_method VARCHAR(30) NOT NULL DEFAULT 'manual' AFTER price");
    }
    if (!tableHasColumn($pdo, 'product', 'custom_markup_percentage')) {
        $pdo->exec("ALTER TABLE product ADD COLUMN custom_markup_percentage DECIMAL(7,2) NULL AFTER pricing_method");
    }

    ensureConfiguredCategoryMarkups($pdo);
}

function ensureConfiguredCategoryMarkups(PDO $pdo): void
{
    ensureActivityLogSchema($pdo);
    $marker = $pdo->prepare("SELECT 1 FROM activity_logs WHERE module = 'Pricing' AND action = 'Configured category defaults' AND reference_id = :reference_id LIMIT 1");
    $marker->execute([':reference_id' => DEFAULT_CATEGORY_MARKUP_MIGRATION]);
    if ($marker->fetchColumn()) {
        return;
    }

    $find = $pdo->prepare('SELECT category_id FROM product_categories WHERE LOWER(TRIM(category_name)) = :category_name LIMIT 1');
    $insert = $pdo->prepare('INSERT INTO product_categories (category_id, category_name, default_markup_percentage, pricing_behavior) VALUES (:category_id, :category_name, :markup, \'review_required\')');
    $update = $pdo->prepare('UPDATE product_categories SET default_markup_percentage = :markup WHERE category_id = :category_id');
    foreach (DEFAULT_CATEGORY_MARKUPS as $key => $configuration) {
        $find->execute([':category_name' => $key]);
        $categoryId = cleanId($find->fetchColumn());
        if ($categoryId === '') {
            $insert->execute([
                ':category_id' => newUuid($pdo),
                ':category_name' => $configuration['name'],
                ':markup' => $configuration['markup'],
            ]);
        } else {
            $update->execute([':markup' => $configuration['markup'], ':category_id' => $categoryId]);
        }
    }

    recordActivityLog(
        $pdo,
        'Pricing',
        'Configured category defaults',
        json_encode(array_values(DEFAULT_CATEGORY_MARKUPS), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        DEFAULT_CATEGORY_MARKUP_MIGRATION
    );
}

function categoryMarkupResolution(PDO $pdo, string $categoryId): array
{
    $statement = $pdo->prepare('SELECT category_id, category_name, default_markup_percentage FROM product_categories WHERE category_id = :category_id LIMIT 1');
    $statement->execute([':category_id' => $categoryId]);
    $category = $statement->fetch(PDO::FETCH_ASSOC);
    if (!$category) {
        throw new InvalidArgumentException('Product category not found.');
    }

    $normalizedName = strtolower(trim((string) $category['category_name']));
    $storedMarkup = round((float) $category['default_markup_percentage'], 2);
    $hasDedicatedMarkup = isset(DEFAULT_CATEGORY_MARKUPS[$normalizedName]) || $storedMarkup > 0;
    if ($hasDedicatedMarkup) {
        return [
            'category_id' => $category['category_id'],
            'category_name' => $category['category_name'],
            'stored_markup_percentage' => $storedMarkup,
            'markup_percentage' => $storedMarkup,
            'source_category_name' => $category['category_name'],
            'source_label' => $category['category_name'],
            'is_fallback' => false,
        ];
    }

    return [
        'category_id' => $category['category_id'],
        'category_name' => $category['category_name'],
        'stored_markup_percentage' => $storedMarkup,
        'markup_percentage' => DEFAULT_FALLBACK_CATEGORY_MARKUP,
        'source_category_name' => 'Default',
        'source_label' => 'Default fallback',
        'is_fallback' => true,
    ];
}

function normalizePricingBehavior($value): string
{
    $behavior = strtolower(trim((string) $value));
    if (!in_array($behavior, CATEGORY_PRICING_BEHAVIORS, true)) {
        throw new InvalidArgumentException('Pricing behavior must be Automatic or Review required.');
    }
    return $behavior;
}

function normalizePricingMethod($value): string
{
    $method = strtolower(trim((string) $value));
    if (!in_array($method, PRODUCT_PRICING_METHODS, true)) {
        throw new InvalidArgumentException('Pricing method must be Category markup, Custom markup, or Manual price.');
    }
    return $method;
}

function normalizeMarkupPercentage($value, bool $nullable = false): ?float
{
    if ($nullable && ($value === null || trim((string) $value) === '')) {
        return null;
    }
    if (!is_numeric($value) || !is_finite((float) $value) || (float) $value < 0) {
        throw new InvalidArgumentException('Markup percentage must be a valid number greater than or equal to zero.');
    }
    return round((float) $value, 2);
}

function calculatedSellingPrice(float $unitCost, float $markupPercentage): float
{
    return round($unitCost * (1 + ($markupPercentage / 100)), 2);
}

function productInventoryUnitSql(string $productIdExpression, string $medicineAlias = 'md', string $groceryAlias = 'gd', string $medicalSupplyAlias = 'msd'): string
{
    return "COALESCE(
        NULLIF((SELECT pmu.unit_name FROM product sku INNER JOIN product_measurement_units pmu ON pmu.measurement_unit_id=sku.inventory_unit_id WHERE sku.product_id={$productIdExpression} LIMIT 1), ''),
        NULLIF((SELECT psv.value_text FROM product_specification_values psv INNER JOIN product_specifications ps ON ps.specification_id = psv.specification_id WHERE psv.product_id = {$productIdExpression} AND LOWER(TRIM(ps.specification_name)) = 'inventory unit' LIMIT 1), ''),
        NULLIF((SELECT psv.value_text FROM product_specification_values psv INNER JOIN product_specifications ps ON ps.specification_id = psv.specification_id WHERE psv.product_id = {$productIdExpression} AND LOWER(TRIM(ps.specification_name)) = 'package type' LIMIT 1), ''),
        NULLIF({$medicineAlias}.package_type, ''), NULLIF({$groceryAlias}.package_type, ''), NULLIF({$medicalSupplyAlias}.package_type, ''), 'unit'
    )";
}

function latestAcceptedCostBasis(PDO $pdo, string $productId): ?array
{
    $inventoryUnitSql = productInventoryUnitSql('ib.product_id');
    $statement = $pdo->prepare(
        "SELECT ib.batch_id, ib.po_id, ib.po_item_id, ib.supplier_id, ib.unit_cost,
                ib.received_date, ib.created_at, s.supplier_name, po.po_number,
                sp.purchase_unit, COALESCE(sp.units_per_purchase_unit, 1) AS units_per_purchase_unit,
                {$inventoryUnitSql} AS inventory_unit
         FROM inventory_batches ib
         LEFT JOIN suppliers s ON s.supplier_id = ib.supplier_id
         LEFT JOIN purchase_orders po ON po.po_id = ib.po_id
         LEFT JOIN supplier_products sp ON sp.product_id = ib.product_id AND sp.supplier_id = ib.supplier_id
         LEFT JOIN medicine_details md ON md.product_id = ib.product_id
         LEFT JOIN grocery_details gd ON gd.product_id = ib.product_id
         LEFT JOIN medical_supply_details msd ON msd.product_id = ib.product_id
         WHERE ib.product_id = :product_id
           AND (ib.received_qty - ib.damaged_qty - ib.returned_qty) > 0
           AND ib.unit_cost IS NOT NULL
         ORDER BY ib.received_date DESC, ib.created_at DESC, ib.batch_id DESC
         LIMIT 1"
    );
    $statement->execute([':product_id' => $productId]);
    $row = $statement->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        return null;
    }
    $row['unit_cost'] = round((float) $row['unit_cost'], 2);
    $row['units_per_purchase_unit'] = max(1, (int) $row['units_per_purchase_unit']);
    $row['purchase_unit_cost'] = round($row['unit_cost'] * $row['units_per_purchase_unit'], 2);
    return $row;
}

function productPricingSnapshot(PDO $pdo, string $productId, ?array $costBasis = null): array
{
    $inventoryUnitSql = productInventoryUnitSql('p.product_id');
    $statement = $pdo->prepare(
        "SELECT p.product_id, p.price, p.pricing_method, p.custom_markup_percentage,
                p.category_id, pc.category_name, pc.default_markup_percentage, pc.pricing_behavior,
                {$inventoryUnitSql} AS inventory_unit
         FROM product p
         INNER JOIN product_categories pc ON pc.category_id = p.category_id
         LEFT JOIN medicine_details md ON md.product_id = p.product_id
         LEFT JOIN grocery_details gd ON gd.product_id = p.product_id
         LEFT JOIN medical_supply_details msd ON msd.product_id = p.product_id
         WHERE p.product_id = :product_id
         LIMIT 1"
    );
    $statement->execute([':product_id' => $productId]);
    $product = $statement->fetch(PDO::FETCH_ASSOC);
    if (!$product) {
        throw new InvalidArgumentException('Product not found.');
    }

    $method = in_array($product['pricing_method'], PRODUCT_PRICING_METHODS, true) ? $product['pricing_method'] : 'manual';
    $markupResolution = categoryMarkupResolution($pdo, $product['category_id']);
    $categoryMarkup = $markupResolution['markup_percentage'];
    $customMarkup = $product['custom_markup_percentage'] === null ? null : round((float) $product['custom_markup_percentage'], 2);
    $appliedMarkup = $method === 'custom_markup' && $customMarkup !== null ? $customMarkup : $categoryMarkup;
    $basis = $costBasis ?? latestAcceptedCostBasis($pdo, $productId);
    $calculated = $basis ? calculatedSellingPrice((float) $basis['unit_cost'], $appliedMarkup) : null;
    $activePrice = round((float) $product['price'], 2);
    $difference = $calculated === null ? null : round($calculated - $activePrice, 2);
    $behavior = in_array($product['pricing_behavior'], CATEGORY_PRICING_BEHAVIORS, true) ? $product['pricing_behavior'] : 'review_required';

    if ($method === 'manual') {
        $status = 'Manual price';
    } elseif ($calculated === null) {
        $status = 'No accepted cost';
    } elseif (abs($difference) < 0.005) {
        $status = 'Up to date';
    } elseif ($behavior === 'review_required') {
        $status = 'Pending update';
    } else {
        $status = 'Pending automatic update';
    }

    $lastUpdate = $pdo->prepare("SELECT created_at, description FROM activity_logs WHERE module = 'Pricing' AND reference_id = :product_id ORDER BY created_at DESC LIMIT 1");
    $lastUpdate->execute([':product_id' => $productId]);
    $lastPriceUpdate = $lastUpdate->fetch(PDO::FETCH_ASSOC) ?: null;

    return [
        'active_selling_price' => $activePrice,
        'pricing_method' => $method,
        'custom_markup_percentage' => $customMarkup,
        'category_id' => $product['category_id'],
        'category_name' => $product['category_name'],
        'category_markup_percentage' => $categoryMarkup,
        'stored_category_markup_percentage' => $markupResolution['stored_markup_percentage'],
        'category_markup_source' => $markupResolution['source_label'],
        'category_markup_source_category' => $markupResolution['source_category_name'],
        'category_markup_is_fallback' => $markupResolution['is_fallback'],
        'applied_markup_percentage' => $appliedMarkup,
        'pricing_behavior' => $behavior,
        'inventory_unit' => $basis['inventory_unit'] ?? $product['inventory_unit'],
        'latest_cost_basis' => $basis,
        'calculated_selling_price' => $calculated,
        'price_difference' => $difference,
        'price_status' => $status,
        'price_source' => $basis ? 'Latest accepted delivery' : 'No accepted delivery',
        'last_price_update' => $lastPriceUpdate['created_at'] ?? null,
    ];
}

function productPricingSnapshots(PDO $pdo, array $productIds): array
{
    $productIds = array_values(array_unique(array_filter(array_map('cleanId', $productIds))));
    if (!$productIds) return [];

    $placeholders = implode(',', array_fill(0, count($productIds), '?'));
    $inventoryUnitSql = productInventoryUnitSql('p.product_id');
    $statement = $pdo->prepare(
        "SELECT p.product_id, p.price, p.pricing_method, p.custom_markup_percentage, p.status,
                p.category_id, pc.category_name, pc.default_markup_percentage, pc.pricing_behavior,
                {$inventoryUnitSql} AS default_inventory_unit,
                cost.batch_id, cost.po_id, cost.po_item_id, cost.supplier_id, cost.unit_cost,
                cost.received_date, cost.created_at AS cost_created_at,
                s.supplier_name, po.po_number, sp.purchase_unit,
                COALESCE(sp.units_per_purchase_unit, 1) AS units_per_purchase_unit,
                last_pricing_update.created_at AS last_price_update
         FROM product p
         INNER JOIN product_categories pc ON pc.category_id = p.category_id
         LEFT JOIN medicine_details md ON md.product_id = p.product_id
         LEFT JOIN grocery_details gd ON gd.product_id = p.product_id
         LEFT JOIN medical_supply_details msd ON msd.product_id = p.product_id
         LEFT JOIN (
            SELECT ranked.product_id, ranked.batch_id, ranked.po_id, ranked.po_item_id,
                   ranked.supplier_id, ranked.unit_cost, ranked.received_date, ranked.created_at
            FROM (
                SELECT ib.product_id, ib.batch_id, ib.po_id, ib.po_item_id, ib.supplier_id,
                       ib.unit_cost, ib.received_date, ib.created_at,
                       ROW_NUMBER() OVER (
                           PARTITION BY ib.product_id
                           ORDER BY ib.received_date DESC, ib.created_at DESC, ib.batch_id DESC
                       ) AS row_number
                FROM inventory_batches ib
                WHERE (ib.received_qty - ib.damaged_qty - ib.returned_qty) > 0
                  AND ib.unit_cost IS NOT NULL
            ) ranked
            WHERE ranked.row_number = 1
         ) cost ON cost.product_id = p.product_id
         LEFT JOIN suppliers s ON s.supplier_id = cost.supplier_id
         LEFT JOIN purchase_orders po ON po.po_id = cost.po_id
         LEFT JOIN supplier_products sp ON sp.product_id = cost.product_id AND sp.supplier_id = cost.supplier_id
         LEFT JOIN (
            SELECT reference_id, MAX(created_at) AS created_at
            FROM activity_logs
            WHERE module = 'Pricing'
            GROUP BY reference_id
         ) last_pricing_update ON last_pricing_update.reference_id = p.product_id
         WHERE p.product_id IN ({$placeholders})"
    );
    $statement->execute($productIds);
    $snapshots = [];
    foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $product) {
        $method = in_array($product['pricing_method'], PRODUCT_PRICING_METHODS, true) ? $product['pricing_method'] : 'manual';
        $storedMarkup = round((float) $product['default_markup_percentage'], 2);
        $normalizedCategory = strtolower(trim((string) $product['category_name']));
        $usesOwnMarkup = isset(DEFAULT_CATEGORY_MARKUPS[$normalizedCategory]) || $storedMarkup > 0;
        $categoryMarkup = $usesOwnMarkup ? $storedMarkup : DEFAULT_FALLBACK_CATEGORY_MARKUP;
        $markupSource = $usesOwnMarkup ? $product['category_name'] : 'Default fallback';
        $markupSourceCategory = $usesOwnMarkup ? $product['category_name'] : 'Default';
        $customMarkup = $product['custom_markup_percentage'] === null ? null : round((float) $product['custom_markup_percentage'], 2);
        $appliedMarkup = $method === 'custom_markup' && $customMarkup !== null ? $customMarkup : $categoryMarkup;
        $basis = null;
        if (!empty($product['batch_id'])) {
            $unitsPerPurchaseUnit = max(1, (int) $product['units_per_purchase_unit']);
            $unitCost = round((float) $product['unit_cost'], 2);
            $basis = [
                'batch_id' => $product['batch_id'], 'po_id' => $product['po_id'], 'po_item_id' => $product['po_item_id'],
                'supplier_id' => $product['supplier_id'], 'unit_cost' => $unitCost,
                'received_date' => $product['received_date'], 'created_at' => $product['cost_created_at'],
                'supplier_name' => $product['supplier_name'], 'po_number' => $product['po_number'],
                'purchase_unit' => $product['purchase_unit'], 'units_per_purchase_unit' => $unitsPerPurchaseUnit,
                'purchase_unit_cost' => round($unitCost * $unitsPerPurchaseUnit, 2),
                'inventory_unit' => $product['default_inventory_unit'],
            ];
        }
        $calculated = $basis ? calculatedSellingPrice((float) $basis['unit_cost'], $appliedMarkup) : null;
        $activePrice = round((float) $product['price'], 2);
        $difference = $calculated === null ? null : round($calculated - $activePrice, 2);
        $behavior = in_array($product['pricing_behavior'], CATEGORY_PRICING_BEHAVIORS, true) ? $product['pricing_behavior'] : 'review_required';
        if ($method === 'manual') $status = 'Manual price';
        elseif ($calculated === null) $status = 'No accepted cost';
        elseif (abs($difference) < 0.005) $status = 'Up to date';
        elseif ($behavior === 'review_required') $status = 'Pending update';
        else $status = 'Pending automatic update';

        $isActive = strcasecmp((string) $product['status'], 'Active') === 0;
        $categoryPricingEligible = $isActive && $calculated !== null
            && !($method === 'category_markup' && abs($difference) < 0.005);
        $categoryPricingStatus = !$isActive ? 'Inactive product'
            : ($calculated === null ? 'No accepted cost'
                : ($method === 'category_markup'
                    ? (abs($difference) < 0.005 ? 'Already up to date' : 'Ready to update')
                    : 'Ready to convert'));

        $snapshots[$product['product_id']] = [
            'active_selling_price' => $activePrice, 'pricing_method' => $method,
            'custom_markup_percentage' => $customMarkup, 'category_id' => $product['category_id'],
            'category_name' => $product['category_name'], 'category_markup_percentage' => $categoryMarkup,
            'stored_category_markup_percentage' => $storedMarkup, 'category_markup_source' => $markupSource,
            'category_markup_source_category' => $markupSourceCategory, 'category_markup_is_fallback' => !$usesOwnMarkup,
            'applied_markup_percentage' => $appliedMarkup, 'pricing_behavior' => $behavior,
            'inventory_unit' => $basis['inventory_unit'] ?? $product['default_inventory_unit'],
            'latest_cost_basis' => $basis, 'calculated_selling_price' => $calculated,
            'price_difference' => $difference, 'price_status' => $status,
            'price_source' => $basis ? 'Latest accepted delivery' : 'No accepted delivery',
            'last_price_update' => $product['last_price_update'],
            'category_pricing_eligible' => $categoryPricingEligible,
            'category_pricing_status' => $categoryPricingStatus,
        ];
    }
    return $snapshots;
}

function applyAcceptedDeliveryPricing(PDO $pdo, string $productId, array $costBasis): array
{
    $snapshot = productPricingSnapshot($pdo, $productId, $costBasis);
    if ($snapshot['pricing_method'] === 'manual' || $snapshot['pricing_behavior'] !== 'automatic' || $snapshot['calculated_selling_price'] === null) {
        return $snapshot;
    }

    $oldPrice = $snapshot['active_selling_price'];
    $newPrice = $snapshot['calculated_selling_price'];
    if (abs($newPrice - $oldPrice) < 0.005) {
        return $snapshot;
    }

    $update = $pdo->prepare('UPDATE product SET price = :price WHERE product_id = :product_id');
    $update->execute([':price' => $newPrice, ':product_id' => $productId]);
    syncProductDefaultSellingPrice($pdo, $productId, (float)$newPrice);
    recordActivityLog($pdo, 'Pricing', 'Automatic delivery update', json_encode([
        'previous_cost_basis' => latestAcceptedCostBasisExcludingBatch($pdo, $productId, $costBasis['batch_id'] ?? ''),
        'new_cost_basis' => $costBasis['unit_cost'],
        'previous_selling_price' => $oldPrice,
        'new_selling_price' => $newPrice,
        'applied_markup_percentage' => $snapshot['applied_markup_percentage'],
        'price_source' => 'Latest accepted delivery',
        'po_id' => $costBasis['po_id'] ?? null,
        'supplier_id' => $costBasis['supplier_id'] ?? null,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $productId);

    return productPricingSnapshot($pdo, $productId, $costBasis);
}

function latestAcceptedCostBasisExcludingBatch(PDO $pdo, string $productId, string $batchId): ?float
{
    $statement = $pdo->prepare(
        "SELECT unit_cost FROM inventory_batches
         WHERE product_id = :product_id AND batch_id <> :batch_id
           AND (received_qty - damaged_qty - returned_qty) > 0
         ORDER BY received_date DESC, created_at DESC, batch_id DESC LIMIT 1"
    );
    $statement->execute([':product_id' => $productId, ':batch_id' => $batchId]);
    $value = $statement->fetchColumn();
    return $value === false ? null : round((float) $value, 2);
}

function categoryPricingImpact(PDO $pdo, string $categoryId, float $newMarkup): array
{
    $statement = $pdo->prepare("SELECT product_id, brand_name, product_name, price, pricing_method, custom_markup_percentage FROM product WHERE category_id = :category_id AND status = 'Active' ORDER BY brand_name, product_name");
    $statement->execute([':category_id' => $categoryId]);
    $products = $statement->fetchAll(PDO::FETCH_ASSOC);
    $snapshots = productPricingSnapshots($pdo, array_column($products, 'product_id'));
    $rows = [];
    foreach ($products as $product) {
        $snapshot = $snapshots[$product['product_id']];
        $basis = $snapshot['latest_cost_basis'];
        $newAppliedMarkup = $snapshot['pricing_method'] === 'custom_markup' ? $snapshot['applied_markup_percentage'] : $newMarkup;
        $newPrice = $basis ? calculatedSellingPrice((float) $basis['unit_cost'], $newAppliedMarkup) : null;
        $rows[] = [
            'product_id' => $product['product_id'],
            'product' => trim($product['brand_name'] . ' ' . $product['product_name']),
            'pricing_method' => $snapshot['pricing_method'],
            'eligible_for_apply' => $snapshot['pricing_method'] === 'category_markup' && $basis !== null,
            'current_cost_basis' => $basis['unit_cost'] ?? null,
            'previous_markup' => $snapshot['applied_markup_percentage'],
            'new_markup' => $newAppliedMarkup,
            'current_selling_price' => $snapshot['active_selling_price'],
            'new_selling_price' => $newPrice,
            'difference' => $newPrice === null ? null : round($newPrice - $snapshot['active_selling_price'], 2),
        ];
    }
    return $rows;
}

function selectedCategoryPricingPreview(PDO $pdo, array $productIds): array
{
    $productIds = array_values(array_unique(array_filter(array_map('cleanId', $productIds))));
    if (!$productIds) {
        throw new InvalidArgumentException('Select at least one product.');
    }

    $placeholders = implode(',', array_fill(0, count($productIds), '?'));
    $statement = $pdo->prepare("SELECT product_id, brand_name, product_name, status FROM product WHERE product_id IN ({$placeholders}) ORDER BY brand_name, product_name");
    $statement->execute($productIds);
    $products = $statement->fetchAll(PDO::FETCH_ASSOC);
    if (count($products) !== count($productIds)) {
        throw new InvalidArgumentException('One or more selected products no longer exist.');
    }

    $snapshots = productPricingSnapshots($pdo, array_column($products, 'product_id'));
    $rows = [];
    foreach ($products as $product) {
        $snapshot = $snapshots[$product['product_id']];
        $calculated = $snapshot['latest_cost_basis']
            ? calculatedSellingPrice((float) $snapshot['latest_cost_basis']['unit_cost'], (float) $snapshot['category_markup_percentage'])
            : null;
        $rows[] = [
            'product_id' => $product['product_id'],
            'product' => trim($product['brand_name'] . ' ' . $product['product_name']),
            'category' => $snapshot['category_name'],
            'existing_pricing_method' => $snapshot['pricing_method'],
            'current_cost_basis' => $snapshot['latest_cost_basis']['unit_cost'] ?? null,
            'inventory_unit' => $snapshot['inventory_unit'],
            'applied_markup_percentage' => $snapshot['category_markup_percentage'],
            'markup_source' => $snapshot['category_markup_source'],
            'current_selling_price' => $snapshot['active_selling_price'],
            'calculated_selling_price' => $calculated,
            'difference' => $calculated === null ? null : round($calculated - $snapshot['active_selling_price'], 2),
            'eligible_for_apply' => $snapshot['category_pricing_eligible'],
            'eligibility_status' => $snapshot['category_pricing_status'],
        ];
    }
    return $rows;
}

function applyCategoryMarkupToSelectedProducts(PDO $pdo, array $productIds): array
{
    $rows = selectedCategoryPricingPreview($pdo, $productIds);
    $update = $pdo->prepare("UPDATE product SET pricing_method = 'category_markup', custom_markup_percentage = NULL, price = :price WHERE product_id = :product_id");
    $applied = 0;
    foreach ($rows as $row) {
        if (!$row['eligible_for_apply']) {
            continue;
        }
        $update->execute([':price' => $row['calculated_selling_price'], ':product_id' => $row['product_id']]);
        $applied++;
        recordActivityLog($pdo, 'Pricing', 'Selected category markup applied', json_encode([
            'previous_pricing_method' => $row['existing_pricing_method'],
            'previous_selling_price' => $row['current_selling_price'],
            'new_selling_price' => $row['calculated_selling_price'],
            'cost_basis_per_inventory_unit' => $row['current_cost_basis'],
            'applied_markup_percentage' => $row['applied_markup_percentage'],
            'markup_source' => $row['markup_source'],
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $row['product_id']);
    }
    return ['products' => $rows, 'applied_products' => $applied];
}

?>
