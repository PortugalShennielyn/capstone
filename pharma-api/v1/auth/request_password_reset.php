<?php
require_once '../../config/db_connection.php';
require_once 'password_reset_helpers.php';

header('Content-Type: application/json');

function resetResponse(string $message, bool $success = true, int $status = 200): void
{
    http_response_code($status);
    echo json_encode(['status' => $success ? 'success' : 'error', 'message' => $message]);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') resetResponse('Only POST requests are allowed.', false, 405);
$payload = json_decode(file_get_contents('php://input'), true);
$email = strtolower(trim((string) ($payload['email'] ?? '')));
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) resetResponse('Enter a valid email address.', false, 422);

try {
    ensurePasswordResetTokensTable($pdo);
    $stmt = $pdo->prepare(
        'SELECT user_id, full_name, username, email
         FROM users
         WHERE LOWER(email) = :email AND status = "Active" AND COALESCE(is_deleted, 0) = 0
         LIMIT 1'
    );
    $stmt->execute([':email' => $email]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    $message = 'If the email is registered, a reset link has been sent.';
    if (!$user) resetResponse($message);

    $pdo->prepare('UPDATE password_reset_tokens SET used_at = COALESCE(used_at, NOW()) WHERE user_id = :user_id AND used_at IS NULL')->execute([':user_id' => $user['user_id']]);
    $token = bin2hex(random_bytes(32));
    $insert = $pdo->prepare(
        'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
         VALUES (:user_id, :token_hash, DATE_ADD(NOW(), INTERVAL 30 MINUTE))'
    );
    $insert->execute([':user_id' => $user['user_id'], ':token_hash' => passwordResetHash($token)]);
    $mailResult = sendPasswordResetEmail($email, trim((string) ($user['full_name'] ?: $user['username'] ?: 'User')), $token);
    if (!$mailResult['sent']) {
        $pdo->prepare('UPDATE password_reset_tokens SET used_at = NOW() WHERE token_hash = :token_hash')->execute([':token_hash' => passwordResetHash($token)]);
        error_log('[AUTH] Password reset email failed: ' . ($mailResult['error'] ?? 'unknown error'));
        resetResponse($mailResult['configured'] ? 'Password reset email could not be sent. Please try again later.' : 'Password reset email service is not configured yet.', false, 503);
    }
    resetResponse($message);
} catch (Throwable $error) {
    resetResponse('Unable to request a password reset.', false, 500);
}
?>
