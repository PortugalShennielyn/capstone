<?php
require_once '../../config/db_connection.php';
require_once '../../config/auth_context.php';
require_once __DIR__ . '/settings_helpers.php';

requireValidSession($pdo);

if (!currentSessionHasRbacRole('admin') && !currentSessionHasRbacRole('super_admin')) {
    http_response_code(403);
    echo json_encode(['status' => 'error', 'message' => 'Only Admin users can change the Purchase Request quantity limit.']);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Only POST requests are allowed.']);
    exit();
}

$payload = json_decode(file_get_contents('php://input'), true);
$value = $payload['prQuantityLimit'] ?? null;
if (!is_numeric($value) || (string) (int) $value !== (string) $value || (int) $value < 1 || (int) $value > 1000000) {
    http_response_code(422);
    echo json_encode(['status' => 'error', 'message' => 'Enter a whole number from 1 to 1,000,000.']);
    exit();
}

ensurePurchaseRequestQuantityLimitColumn($pdo);
$limit = (int) $value;
$statement = $pdo->prepare(
    'INSERT INTO system_settings (setting_id, pr_quantity_limit)
     VALUES (1, :pr_quantity_limit)
     ON DUPLICATE KEY UPDATE pr_quantity_limit = VALUES(pr_quantity_limit), updated_at = NOW()'
);
$statement->execute([':pr_quantity_limit' => $limit]);

echo json_encode(['status' => 'success', 'prQuantityLimit' => $limit]);
?>
