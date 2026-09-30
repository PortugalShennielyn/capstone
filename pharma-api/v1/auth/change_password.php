<?php
require_once '../../config/db_connection.php';
require_once '../../config/auth_context.php';

header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: ' . ($_SERVER['HTTP_ORIGIN'] ?? '*'));
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Headers: Content-Type, X-Tab-Token');
header('Access-Control-Allow-Methods: POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Only POST allowed.']);
    exit();
}

requireValidSession($pdo, []);

$payload = json_decode(file_get_contents('php://input'), true) ?: [];
$currentPass = (string) ($payload['current_password'] ?? '');
$newPass     = (string) ($payload['new_password'] ?? '');
$confirmPass = (string) ($payload['confirm_password'] ?? '');

if ($currentPass === '' || $newPass === '' || $confirmPass === '') {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => 'All fields are required.']);
    exit();
}
if (strlen($newPass) < 8) {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => 'New password must be at least 8 characters.']);
    exit();
}
if ($newPass !== $confirmPass) {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => 'New passwords do not match.']);
    exit();
}
if ($currentPass === $newPass) {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => 'New password must be different from current.']);
    exit();
}

$userId = (string) $_SESSION['user_id'];

try {
    $stmt = $pdo->prepare(
        'SELECT password, password_hash
         FROM users
         WHERE user_id = :user_id AND COALESCE(is_deleted, 0) = 0
         LIMIT 1'
    );
    $stmt->execute([':user_id' => $userId]);
    $user = $stmt->fetch();

    if (!$user) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'User not found.']);
        exit();
    }

    $storedHash = trim((string) ($user['password_hash'] ?? ''));
    $storedPlain = trim((string) ($user['password'] ?? ''));
    $stored = $storedHash !== '' ? $storedHash : $storedPlain;

    if ($stored === '') {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'No stored password found.']);
        exit();
    }

    $valid = false;
    if (password_get_info($stored)['algo'] !== 0) {
        $valid = password_verify($currentPass, $stored);
    } else {
        $valid = hash_equals($stored, $currentPass);
    }

    if (!$valid) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Current password is incorrect.']);
        exit();
    }

    $newHash = password_hash($newPass, PASSWORD_DEFAULT);

    $update = $pdo->prepare(
        'UPDATE users
         SET password = :password,
             password_hash = :password_hash,
             updated_at = NOW()
         WHERE user_id = :user_id'
    );
    $update->execute([
        ':password'      => $newHash,
        ':password_hash' => $newHash,
        ':user_id'       => $userId,
    ]);

    echo json_encode([
        'success' => true,
        'message' => 'Password changed successfully.',
    ]);
} catch (PDOException $e) {
    error_log('[CHANGE_PASSWORD] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Server error. Try again later.']);
}