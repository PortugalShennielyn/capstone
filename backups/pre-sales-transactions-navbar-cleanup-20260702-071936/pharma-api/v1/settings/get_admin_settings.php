<?php
require_once '../../config/db_connection.php';
require_once '../../config/auth_context.php';
require_once __DIR__ . '/settings_helpers.php';

requireValidSession($pdo);

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode([
        'status' => 'error',
        'message' => 'Only GET requests are allowed.'
    ]);
    exit();
}

echo json_encode([
    'status' => 'success',
    'profile' => fetchSystemSettings($pdo),
    'businessSchedule' => fetchBusinessHours($pdo),
    'businessExceptions' => fetchBusinessHourExceptions($pdo, $_GET['month'] ?? null),
    'nextBusinessException' => fetchNextBusinessHourException($pdo),
]);
?>
