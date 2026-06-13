<?php
require_once '../../config/db_connection.php';

$_SESSION = [];
session_destroy();

setcookie(session_name(), '', time() - 42000, '/PharmacySystem_for_DocR/');

echo json_encode([
    'status' => 'success',
    'message' => 'Logged out successfully.'
]);
?>
