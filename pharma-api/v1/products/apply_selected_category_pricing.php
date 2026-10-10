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
    $productIds = is_array($payload['product_ids'] ?? null) ? $payload['product_ids'] : [];
    $action = strtolower(trim((string) ($payload['action'] ?? 'preview')));
    if (!in_array($action, ['preview', 'apply'], true)) {
        throw new InvalidArgumentException('Pricing action must be preview or apply.');
    }

    if ($action === 'preview') {
        $products = selectedCategoryPricingPreview($pdo, $productIds);
        echo json_encode([
            'status' => 'success',
            'products' => $products,
            'eligible_products' => count(array_filter($products, static fn($row) => $row['eligible_for_apply'])),
        ]);
        exit();
    }

    $isAdmin = currentSessionHasAnyRole(['super_admin', 'admin', 'Admin', 'ro-super-admin', 'ro-admin']);
    if (!$isAdmin) {
        throw new InvalidArgumentException('Only an Admin can confirm and apply selected category prices.');
    }

    $pdo->beginTransaction();
    $result = applyCategoryMarkupToSelectedProducts(
        $pdo,
        $productIds,
        !empty($payload['confirm_flagged']),
        is_array($payload['preview_tokens'] ?? null) ? $payload['preview_tokens'] : [],
        $isAdmin
    );
    $pdo->commit();
    echo json_encode([
        'status' => 'success',
        'message' => $result['applied_products'] . ' selected product price(s) updated.',
        'products' => $result['products'],
        'applied_products' => $result['applied_products'],
    ]);
} catch (InvalidArgumentException $error) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => $error->getMessage()]);
} catch (Throwable $error) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to apply selected category pricing.']);
}

?>
