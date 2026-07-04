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
    $pdo->beginTransaction();

    if (isset($payload['day'])) {
        updateBusinessHour($pdo, (string) $payload['day'], $payload);
    } elseif (isset($payload['schedule']) && is_array($payload['schedule'])) {
        foreach (SETTINGS_WEEK_DAYS as $day) {
            if (!isset($payload['schedule'][$day]) || !is_array($payload['schedule'][$day])) {
                throw new InvalidArgumentException("Missing schedule for {$day}.");
            }
            updateBusinessHour($pdo, $day, $payload['schedule'][$day]);
        }
    } else {
        throw new InvalidArgumentException('Missing business hours data.');
    }

    $pdo->commit();

    echo json_encode([
        'status' => 'success',
        'businessSchedule' => fetchBusinessHours($pdo),
    ]);
} catch (InvalidArgumentException $error) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    http_response_code(422);
    echo json_encode([
        'status' => 'error',
        'message' => $error->getMessage(),
    ]);
} catch (Throwable $error) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Unable to save business hours.',
    ]);
}
?>
