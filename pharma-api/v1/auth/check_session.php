<?php
require_once '../../config/db_connection.php';

if (!isset($_SESSION['user_id'], $_SESSION['role'])) {
    http_response_code(401);
    echo json_encode([
        'status' => 'error',
        'message' => 'Unauthorized'
    ]);
    exit();
}

http_response_code(200);
echo json_encode([
    'status' => 'success',
    'user_id' => $_SESSION['user_id'],
    'username' => $_SESSION['username'] ?? '',
    'full_name' => $_SESSION['full_name'] ?? '',
    'role' => $_SESSION['role']
]);
?>
