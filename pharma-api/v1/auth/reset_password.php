<?php
require_once '../../config/db_connection.php';
require_once '../../config/auth_context.php';
require_once '../users/users_helpers.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Only POST requests are allowed.']);
    exit();
}
$payload = json_decode(file_get_contents('php://input'), true);
$token = trim((string) ($payload['token'] ?? ''));
$password = (string) ($payload['new_password'] ?? '');
$confirm = (string) ($payload['confirm_password'] ?? '');
if (!preg_match('/^[a-f0-9]{64}$/', $token) || !isStrongUserPassword($password) || $password !== $confirm) {
    http_response_code(422);
    echo json_encode(['status' => 'error', 'message' => 'Enter a valid reset link and a matching password of at least 8 characters, with an uppercase, number and a symbol.']);
    exit();
}
try {
    $pdo->beginTransaction();
    $stmt = $pdo->prepare('SELECT password_reset_token_id, user_id FROM password_reset_tokens WHERE token_hash = :hash AND used_at IS NULL AND expires_at > NOW() LIMIT 1 FOR UPDATE');
    $stmt->execute([':hash' => hash('sha256', $token)]);
    $reset = $stmt->fetch();
    if (!$reset) {
        $pdo->rollBack();
        http_response_code(422);
        echo json_encode(['status' => 'error', 'message' => 'This reset link is invalid or has expired.']);
        exit();
    }
    $hash = password_hash($password, PASSWORD_DEFAULT);
    $update = $pdo->prepare('UPDATE users SET password = :password, password_hash = :password_hash, updated_at = NOW() WHERE user_id = :user_id');
    $update->execute([':password' => $hash, ':password_hash' => $hash, ':user_id' => $reset['user_id']]);
    $pdo->prepare('UPDATE password_reset_tokens SET used_at = NOW() WHERE password_reset_token_id = :id')->execute([':id' => $reset['password_reset_token_id']]);
    if (tableExists($pdo, 'auth_sessions')) {
        $pdo->prepare('UPDATE auth_sessions SET is_revoked = 1, is_active = 0, revoked_at = NOW(), revoked_reason = "password_reset", updated_at = NOW() WHERE user_id = :user_id')->execute([':user_id' => $reset['user_id']]);
    }
    $pdo->commit();
    echo json_encode(['status' => 'success', 'message' => 'Password reset successfully. You can now sign in.']);
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to reset the password.']);
}
