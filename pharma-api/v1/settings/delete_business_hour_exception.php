<?php
require_once '../../config/db_connection.php';
require_once '../../config/auth_context.php';
require_once __DIR__ . '/settings_helpers.php';
require_once __DIR__ . '/../activity_log_helpers.php';

requireValidSession($pdo);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode([
        'status' => 'error',
        'message' => 'Only POST requests are allowed.'
    ]);
    exit();
}

$payload = json_decode(file_get_contents('php://input'), true);
if (!is_array($payload)) {
    http_response_code(400);
    echo json_encode([
        'status' => 'error',
        'message' => 'Invalid JSON payload.'
    ]);
    exit();
}

try {
    $date = (string) ($payload['date'] ?? '');
    $pdo->beginTransaction();
    $previous = fetchBusinessHourException($pdo, $date);
    deleteBusinessHourException($pdo, $date);
    if ($previous !== null) {
        recordManagementAudit($pdo, 'SETTINGS_CHANGED', auditCurrentUserName() . ' removed the business-hours exception for ' . $date . '.', 'Business Hours Exception', $date, [
            'setting_name' => 'Business Hours Exception · ' . $date,
            'previous_value' => $previous,
            'new_value' => null,
        ]);
    }
    $pdo->commit();

    echo json_encode([
        'status' => 'success',
        'businessExceptions' => fetchBusinessHourExceptions($pdo, substr($date, 0, 7)),
        'nextBusinessException' => fetchNextBusinessHourException($pdo),
    ]);
} catch (InvalidArgumentException $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    http_response_code(422);
    echo json_encode([
        'status' => 'error',
        'message' => $error->getMessage(),
    ]);
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Unable to delete calendar exception.',
    ]);
}
?>
