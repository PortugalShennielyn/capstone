<?php
$allowedRoles = ['super_admin', 'admin', 'manager', 'Admin', 'ro-super-admin', 'ro-admin', 'ro-manager'];
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once 'product_pricing_schema.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Only POST requests are allowed.']);
    exit();
}

$payload = json_decode(file_get_contents('php://input'), true);
try {
    if (!is_array($payload)) {
        throw new InvalidArgumentException('Invalid JSON payload.');
    }
    ensureProductPricingSchema($pdo);
    $categoryId = cleanId($payload['category_id'] ?? null);
    $categoryName = requiredProductField($payload, 'category_name');
    $operationalCategories = ['Grocery', 'Medicine', 'Medical Supplies'];
    if ($categoryId === '' || !in_array($categoryName, $operationalCategories, true)) {
        throw new InvalidArgumentException('Only existing Grocery, Medicine, and Medical Supplies category pricing can be updated.');
    }
    $markup = normalizeMarkupPercentage($payload['default_markup_percentage'] ?? 0);
    $behavior = normalizePricingBehavior($payload['pricing_behavior'] ?? 'review_required');
    $applyPrices = !empty($payload['apply_prices']) && $behavior === 'automatic';
    $duplicate = $pdo->prepare('SELECT category_id FROM product_categories WHERE LOWER(TRIM(category_name)) = LOWER(TRIM(:category_name)) AND category_id <> :category_id LIMIT 1');
    $duplicate->execute([':category_name' => $categoryName, ':category_id' => $categoryId]);
    if ($duplicate->fetchColumn()) {
        throw new InvalidArgumentException('A category with this name already exists.');
    }
    if ($categoryId !== '') {
        $impact = categoryPricingImpact($pdo, $categoryId, $markup);
        $pdo->beginTransaction();
        $statement = $pdo->prepare('UPDATE product_categories SET category_name = :category_name, default_markup_percentage = :markup, pricing_behavior = :behavior WHERE category_id = :category_id');
        $statement->execute([':category_name' => $categoryName, ':markup' => $markup, ':behavior' => $behavior, ':category_id' => $categoryId]);
        if ($statement->rowCount() === 0) {
            $exists = $pdo->prepare('SELECT category_id FROM product_categories WHERE category_id = :category_id');
            $exists->execute([':category_id' => $categoryId]);
            if (!$exists->fetchColumn()) {
                throw new InvalidArgumentException('Category not found.');
            }
        }
        $appliedCount = 0;
        if ($applyPrices) {
            $priceUpdate = $pdo->prepare('UPDATE product SET price = :price WHERE product_id = :product_id');
            foreach ($impact as $row) {
                if (!$row['eligible_for_apply'] || $row['new_selling_price'] === null) continue;
                $priceUpdate->execute([':price' => $row['new_selling_price'], ':product_id' => $row['product_id']]);
                syncProductDefaultSellingPrice($pdo, (string)$row['product_id'], (float)$row['new_selling_price']);
                if ($priceUpdate->rowCount() > 0) {
                    $appliedCount++;
                    recordActivityLog($pdo, 'Pricing', 'Category markup update', json_encode([
                        'previous_selling_price' => $row['current_selling_price'],
                        'new_selling_price' => $row['new_selling_price'],
                        'previous_markup_percentage' => $row['previous_markup'],
                        'new_markup_percentage' => $row['new_markup'],
                        'price_source' => 'Category markup change',
                    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $row['product_id']);
                }
            }
        }
        $pdo->commit();
    }
    echo json_encode(['status' => 'success', 'message' => 'Category pricing saved successfully.', 'affected_products' => count($impact), 'applied_products' => $appliedCount, 'category' => ['category_id' => $categoryId, 'category_name' => $categoryName, 'default_markup_percentage' => $markup, 'pricing_behavior' => $behavior]]);
} catch (InvalidArgumentException $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => $error->getMessage()]);
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to save category.']);
}
?>
