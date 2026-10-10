<?php
require_once '../../config/db_connection.php';
require_once '../../config/auth_context.php';
require_once 'password_reset_helpers.php';

header('Content-Type: application/json');

function resetPasswordResponse(string $message, bool $success = true, int $status = 200): void
{
    http_response_code($status);
    echo json_encode(['status' => $success ? 'success' : 'error', 'message' => $message]);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') resetPasswordResponse('Only POST requests are allowed.', false, 405);
$payload = json_decode(file_get_contents('php://input'), true);
if (is_array($payload) && !isset($payload['token']) && isset($payload['email'], $payload['code'])) {
    $GLOBALS['passwordResetPayload'] = $payload;
    require __DIR__ . '/reset_password_code.php';
    exit;
}
$token = trim((string) ($payload['token'] ?? ''));
$password = (string) ($payload['password'] ?? '');
$confirmPassword = (string) ($payload['confirm_password'] ?? '');
if (!preg_match('/^[a-f0-9]{64}$/i', $token)) resetPasswordResponse('This reset link is invalid or expired.', false, 422);
if (!resetPasswordMeetsRequirements($password)) {
    resetPasswordResponse('Password must be 12–16 characters and include uppercase and lowercase letters, a number, and a special character.', false, 422);
}
if ($password !== $confirmPassword) resetPasswordResponse('Password and confirmation do not match.', false, 422);

try {
    ensurePasswordResetTokensTable($pdo);
    $pdo->beginTransaction();
    $stmt = $pdo->prepare(
        'SELECT reset_id, user_id
         FROM password_reset_tokens
         WHERE token_hash = :token_hash AND used_at IS NULL AND expires_at > NOW()
         LIMIT 1 FOR UPDATE'
    );
    $stmt->execute([':token_hash' => passwordResetHash($token)]);
    $reset = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$reset) throw new InvalidArgumentException('This reset link is invalid, expired, or already used.');

    $hash = password_hash($password, PASSWORD_DEFAULT);
    $update = $pdo->prepare('UPDATE users SET password = :password, password_hash = :password_hash, updated_at = NOW() WHERE user_id = :user_id AND status = "Active"');
    $update->execute([':password' => $hash, ':password_hash' => $hash, ':user_id' => $reset['user_id']]);
    if ($update->rowCount() !== 1) throw new InvalidArgumentException('The account could not be updated.');
    $pdo->prepare('UPDATE password_reset_tokens SET used_at = NOW() WHERE reset_id = :reset_id')->execute([':reset_id' => $reset['reset_id']]);
    if (tableExists($pdo, 'auth_sessions')) {
        $pdo->prepare('UPDATE auth_sessions SET is_revoked = 1, revoked_at = NOW(), revoked_reason = "password_reset", is_active = 0, updated_at = NOW() WHERE user_id = :user_id AND is_revoked = 0')->execute([':user_id' => $reset['user_id']]);
    }
    $pdo->commit();
    resetPasswordResponse('Password reset successfully. You can now sign in.');
} catch (InvalidArgumentException $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    resetPasswordResponse($error->getMessage(), false, 422);
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    resetPasswordResponse('Unable to reset password.', false, 500);
}
?>
