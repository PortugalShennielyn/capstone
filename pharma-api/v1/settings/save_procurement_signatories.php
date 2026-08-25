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

$documentSettings = [
    'prPreparedName' => trim((string) ($payload['prPreparedName'] ?? '')),
    'prPreparedRole' => trim((string) ($payload['prPreparedRole'] ?? '')) ?: 'Manager',
    'prReviewedName' => trim((string) ($payload['prReviewedName'] ?? '')),
    'prReviewedRole' => trim((string) ($payload['prReviewedRole'] ?? '')) ?: 'Supervisor',
    'poPreparedName' => trim((string) ($payload['poPreparedName'] ?? '')),
    'poPreparedRole' => trim((string) ($payload['poPreparedRole'] ?? '')) ?: 'Manager',
    'poApprovedName' => trim((string) ($payload['poApprovedName'] ?? '')),
    'poApprovedRole' => trim((string) ($payload['poApprovedRole'] ?? '')) ?: 'Supervisor',
];

foreach ($documentSettings as $key => $value) {
    $limit = str_ends_with($key, 'Name') ? 150 : 100;
    if (mb_strlen($value) > $limit) {
        http_response_code(422);
        echo json_encode(['status' => 'error', 'message' => 'A PR or PO document label is too long.']);
        exit();
    }
}

$statement = $pdo->prepare(
    "INSERT INTO system_settings
        (setting_id, pr_prepared_name, pr_prepared_role, pr_reviewed_name, pr_reviewed_role, po_prepared_name, po_prepared_role, po_approved_name, po_approved_role)
     VALUES
        (1, :pr_prepared_name, :pr_prepared, :pr_reviewed_name, :pr_reviewed, :po_prepared_name, :po_prepared, :po_approved_name, :po_approved)
     ON DUPLICATE KEY UPDATE
        pr_prepared_name = VALUES(pr_prepared_name),
        pr_prepared_role = VALUES(pr_prepared_role),
        pr_reviewed_name = VALUES(pr_reviewed_name),
        pr_reviewed_role = VALUES(pr_reviewed_role),
        po_prepared_name = VALUES(po_prepared_name),
        po_prepared_role = VALUES(po_prepared_role),
        po_approved_name = VALUES(po_approved_name),
        po_approved_role = VALUES(po_approved_role),
        updated_at = NOW()"
);
$statement->execute([
    ':pr_prepared_name' => $documentSettings['prPreparedName'] !== '' ? $documentSettings['prPreparedName'] : null,
    ':pr_prepared' => $documentSettings['prPreparedRole'],
    ':pr_reviewed_name' => $documentSettings['prReviewedName'] !== '' ? $documentSettings['prReviewedName'] : null,
    ':pr_reviewed' => $documentSettings['prReviewedRole'],
    ':po_prepared_name' => $documentSettings['poPreparedName'] !== '' ? $documentSettings['poPreparedName'] : null,
    ':po_prepared' => $documentSettings['poPreparedRole'],
    ':po_approved_name' => $documentSettings['poApprovedName'] !== '' ? $documentSettings['poApprovedName'] : null,
    ':po_approved' => $documentSettings['poApprovedRole'],
]);

echo json_encode([
    'status' => 'success',
    'procurementDocumentSettings' => $documentSettings,
]);
?>
