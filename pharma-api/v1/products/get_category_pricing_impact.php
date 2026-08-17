<?php
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once 'product_pricing_schema.php';

try {
    $categoryId = cleanId($_GET['category_id'] ?? null);
    $markup = normalizeMarkupPercentage($_GET['markup_percentage'] ?? null);
    if ($categoryId === '') throw new InvalidArgumentException('A valid category is required.');
    $category = $pdo->prepare('SELECT category_name, default_markup_percentage, pricing_behavior FROM product_categories WHERE category_id = :category_id LIMIT 1');
    $category->execute([':category_id' => $categoryId]);
    $categoryRow = $category->fetch(PDO::FETCH_ASSOC);
    if (!$categoryRow) throw new InvalidArgumentException('Category not found.');
    $rows = categoryPricingImpact($pdo, $categoryId, $markup);
    echo json_encode([
        'status' => 'success',
        'category' => $categoryRow,
        'active_product_count' => count($rows),
        'applicable_product_count' => count(array_filter($rows, static fn($row) => $row['eligible_for_apply'])),
        'products' => $rows,
    ]);
} catch (InvalidArgumentException $error) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => $error->getMessage()]);
} catch (Throwable $error) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to preview category pricing impact.', 'error' => $error->getMessage()]);
}
?>
