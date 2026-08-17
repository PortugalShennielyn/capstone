<?php
require_once '../../config/db_connection.php';
require_once '../../config/auth_context.php';

requireValidSession($pdo);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Only POST requests are allowed.']);
    exit();
}

$payload = json_decode(file_get_contents('php://input'), true);
if (!is_array($payload)) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Invalid JSON payload.']);
    exit();
}

$receivedByName = trim((string) ($payload['receivedByName'] ?? ''));
$approvedByName = trim((string) ($payload['approvedByName'] ?? ''));
if (mb_strlen($receivedByName) > 150 || mb_strlen($approvedByName) > 150) {
    http_response_code(422);
    echo json_encode(['status' => 'error', 'message' => 'GRN signature names must not exceed 150 characters.']);
    exit();
}

$statement = $pdo->prepare(
    "INSERT INTO system_settings (setting_id, grn_received_by_name, grn_approved_by_name)
     VALUES (1, :received_by, :approved_by)
     ON DUPLICATE KEY UPDATE
        grn_received_by_name = VALUES(grn_received_by_name),
        grn_approved_by_name = VALUES(grn_approved_by_name),
        updated_at = NOW()"
);
$statement->execute([
    ':received_by' => $receivedByName !== '' ? $receivedByName : null,
    ':approved_by' => $approvedByName !== '' ? $approvedByName : null,
]);

echo json_encode([
    'status' => 'success',
    'grn' => [
        'receivedByName' => $receivedByName,
        'approvedByName' => $approvedByName,
    ],
]);
?>
