<?php
require_once '../../config/db_connection.php';
require_once '../../config/password_reset_helpers.php';

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

$payload  = json_decode(file_get_contents('php://input'), true) ?: [];
$email    = trim((string) ($payload['email'] ?? ''));
$code     = trim((string) ($payload['code'] ?? ''));
$newPass  = (string) ($payload['new_password'] ?? '');
$confirm  = (string) ($payload['confirm_password'] ?? '');

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => 'Valid email required.']);
    exit();
}
if (!preg_match('/^\d{6}$/', $code)) {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => 'Invalid code format.']);
    exit();
}
if (strlen($newPass) < 8) {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => 'Password must be at least 8 characters.']);
    exit();
}
if ($newPass !== $confirm) {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => 'Passwords do not match.']);
    exit();
}

try {
    $reset = verifyPasswordReset($pdo, $email, $code);
    if (!$reset) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid or expired code.']);
        exit();
    }

    $hash = password_hash($newPass, PASSWORD_DEFAULT);

    $stmt = $pdo->prepare(
        'UPDATE users
         SET password = :password,
             password_hash = :password_hash,
             updated_at = NOW()
         WHERE user_id = :user_id'
    );
    $stmt->execute([
        ':password'      => $hash,
        ':password_hash' => $hash,
        ':user_id'       => $reset['user_id'],
    ]);

    consumePasswordReset($pdo, (string) $reset['id']);

    $pdo->prepare(
        'UPDATE auth_sessions
         SET is_revoked = 1, revoked_at = NOW(), revoked_reason = "password_reset",
             is_active = 0, updated_at = NOW()
         WHERE user_id = :user_id AND is_revoked = 0'
    )->execute([':user_id' => $reset['user_id']]);

    echo json_encode([
        'success' => true,
        'message' => 'Password reset successfully. Please log in with your new password.',
    ]);
} catch (PDOException $e) {
    error_log('[PASSWORD_RESET] DB error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Server error.']);
}