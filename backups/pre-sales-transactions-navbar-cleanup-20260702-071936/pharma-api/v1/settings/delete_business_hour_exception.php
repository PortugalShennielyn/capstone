<?php
require_once '../../config/db_connection.php';
require_once '../../config/auth_context.php';
require_once __DIR__ . '/settings_helpers.php';

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
    deleteBusinessHourException($pdo, $date);

    echo json_encode([
        'status' => 'success',
        'businessExceptions' => fetchBusinessHourExceptions($pdo, substr($date, 0, 7)),
        'nextBusinessException' => fetchNextBusinessHourException($pdo),
    ]);
} catch (InvalidArgumentException $error) {
    http_response_code(422);
    echo json_encode([
        'status' => 'error',
        'message' => $error->getMessage(),
    ]);
} catch (Throwable $error) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Unable to delete calendar exception.',
    ]);
}
?>
