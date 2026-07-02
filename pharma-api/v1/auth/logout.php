<?php
require_once '../../config/db_connection.php';
require_once '../../config/auth_context.php';

revokeCurrentAuthSession($pdo);
$_SESSION = [];
session_destroy();
clearCurrentPhpSessionCookie();

echo json_encode([
    'status' => 'success',
    'message' => 'Logged out successfully.'
]);
?>
