<?php
require_once '../../config/db_connection.php';
require_once '../../config/auth_context.php';
require_once __DIR__ . '/settings_helpers.php';

requireValidSession($pdo);

if (!currentSessionHasRbacRole('admin') && !currentSessionHasRbacRole('super_admin')) {
    http_response_code(403);
    echo json_encode(['status' => 'error', 'message' => 'Only Admin users can change notification settings.']);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Only POST requests are allowed.']);
    exit();
}

$payload = json_decode(file_get_contents('php://input'), true);
if (!is_array($payload) || !array_key_exists('navbarBadges', $payload)) {
    http_response_code(422);
    echo json_encode(['status' => 'error', 'message' => 'Choose whether navbar badges are on or off.']);
    exit();
}

$enabled = filter_var($payload['navbarBadges'], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
if ($enabled === null) {
    http_response_code(422);
    echo json_encode(['status' => 'error', 'message' => 'Choose whether navbar badges are on or off.']);
    exit();
}

try {
    $saved = saveNavbarBadgesEnabled($pdo, $enabled);
    echo json_encode([
        'status' => 'success',
        'notifications' => ['navbarBadges' => $saved],
    ]);
} catch (Throwable $error) {
    error_log('Save notification settings failed: ' . $error->getMessage());
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to save notification settings.']);
}
