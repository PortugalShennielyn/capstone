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
    $pdo->beginTransaction();
    $date = normalizeExceptionDate($payload['date'] ?? '');
    $previous = fetchBusinessHourException($pdo, $date);
    $user = $_SESSION['user']['username'] ?? $_SESSION['username'] ?? 'System';
    updateBusinessHourException($pdo, $payload, (string) $user);
    $next = fetchBusinessHourException($pdo, $date);
    $exceptionValues = static fn(?array $row): ?array => $row === null ? null : array_intersect_key($row, array_flip(['open', 'openTime', 'closeTime', 'reason', 'customReason']));
    if ($exceptionValues($previous) !== $exceptionValues($next) && $next !== null) {
        recordManagementAudit($pdo, 'SETTINGS_CHANGED', auditCurrentUserName() . ' changed the business-hours exception for ' . $date . '.', 'Business Hours Exception', $date, [
            'setting_name' => 'Business Hours Exception · ' . $date,
            'previous_value' => $exceptionValues($previous),
            'new_value' => $exceptionValues($next),
        ]);
    }
    $pdo->commit();

    echo json_encode([
        'status' => 'success',
        'exception' => fetchBusinessHourException($pdo, (string) ($payload['date'] ?? '')),
        'businessExceptions' => fetchBusinessHourExceptions($pdo, substr((string) ($payload['date'] ?? ''), 0, 7)),
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
        'message' => 'Unable to save calendar exception.',
    ]);
}
?>
