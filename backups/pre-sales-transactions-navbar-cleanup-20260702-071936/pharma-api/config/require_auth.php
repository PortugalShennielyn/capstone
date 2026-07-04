<?php

require_once __DIR__ . '/auth_context.php';

if (!isset($pdo) || !$pdo instanceof PDO) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Authentication guard is missing the database connection.',
    ]);
    exit();
}

requireValidSession($pdo, $allowedRoles ?? []);

?>
