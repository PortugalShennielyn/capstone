<?php
require_once '../../config/db_connection.php';

header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Content-Type: application/json; charset=utf-8');

$userId = trim((string) ($_SESSION['restricted_password_change_user_id'] ?? ''));
$startedAt = (int) ($_SESSION['restricted_password_change_started_at'] ?? 0);
$nonce = (string) ($_SESSION['restricted_password_change_nonce'] ?? '');
if ($userId === '' || $startedAt < time() - 1800 || $nonce === '') {
    if ($userId !== '') {
        $_SESSION = [];
        session_regenerate_id(true);
    }
    echo json_encode(['required' => false]);
    exit();
}

$stmt = $pdo->prepare(
    'SELECT username, must_change_password
     FROM users
     WHERE user_id = :user_id AND status = "Active" AND COALESCE(is_deleted, 0) = 0
     LIMIT 1'
);
$stmt->execute([':user_id' => $userId]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);
if (!$user || (int) $user['must_change_password'] !== 1) {
    $_SESSION = [];
    session_regenerate_id(true);
    echo json_encode(['required' => false]);
    exit();
}

$_SESSION['restricted_password_change_username'] = (string) $user['username'];
echo json_encode([
    'required' => true,
    'username' => (string) $user['username'],
    'password_change_token' => $nonce,
]);
