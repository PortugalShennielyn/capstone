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

$payload  = $GLOBALS['passwordResetPayload'] ?? json_decode(file_get_contents('php://input'), true);
$payload  = is_array($payload) ? $payload : [];
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
if (!resetPasswordMeetsRequirements($newPass)) {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => 'Password must be 12–16 characters and include uppercase and lowercase letters, a number, and a special character.']);
    exit();
}
if ($newPass !== $confirm) {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => 'Passwords do not match.']);
    exit();
}

try {
    ensurePasswordResetTable($pdo);
    $pdo->beginTransaction();
    $reset = verifyPasswordReset($pdo, $email, $code);
    if (!$reset) {
        $pdo->commit();
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
         WHERE user_id = :user_id
           AND status = "Active"
           AND COALESCE(is_deleted, 0) = 0'
    );
    $stmt->execute([
        ':password'      => $hash,
        ':password_hash' => $hash,
        ':user_id'       => $reset['user_id'],
    ]);

    if ($stmt->rowCount() !== 1) {
        throw new RuntimeException('The password reset account is no longer active.');
    }

    consumePasswordReset($pdo, (string) $reset['reset_id']);
    if (passwordResetTableExists($pdo, 'auth_sessions')) {
        $pdo->prepare(
            'UPDATE auth_sessions
             SET is_revoked = 1, revoked_at = NOW(), revoked_reason = "password_reset",
                 is_active = 0, updated_at = NOW()
             WHERE user_id = :user_id AND is_revoked = 0'
        )->execute([':user_id' => $reset['user_id']]);
    }
    $pdo->commit();

    echo json_encode([
        'success' => true,
        'message' => 'Password reset successfully. Please log in with your new password.',
    ]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('[PASSWORD_RESET] Code-based password reset failed: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Server error.']);
}