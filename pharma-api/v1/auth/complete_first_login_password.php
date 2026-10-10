<?php
require_once '../../config/db_connection.php';
require_once '../../config/auth_context.php';
require_once '../../config/first_login_password_policy.php';
require_once '../users/users_helpers.php';

header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Content-Type: application/json; charset=utf-8');

function firstLoginPasswordResponse(int $status, string $message, ?string $code = null): void
{
    http_response_code($status);
    $response = ['status' => $status < 400 ? 'success' : 'error', 'message' => $message];
    if ($code !== null) $response['code'] = $code;
    echo json_encode($response);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    firstLoginPasswordResponse(405, 'Only POST requests are allowed.');
}

$userId = trim((string) ($_SESSION['restricted_password_change_user_id'] ?? ''));
$startedAt = (int) ($_SESSION['restricted_password_change_started_at'] ?? 0);
$sessionNonce = (string) ($_SESSION['restricted_password_change_nonce'] ?? '');
if ($userId === '' || $startedAt < time() - 1800 || $sessionNonce === '') {
    if ($userId !== '') {
        $_SESSION = [];
        session_regenerate_id(true);
    }
    firstLoginPasswordResponse(401, 'Your password-change session expired. Sign in again to continue.', 'password_change_session_expired');
}

$payload = json_decode(file_get_contents('php://input'), true);
if (!is_array($payload)) {
    firstLoginPasswordResponse(400, 'Invalid password update request.');
}
$token = (string) ($payload['password_change_token'] ?? '');
if ($token === '' || !hash_equals($sessionNonce, $token)) {
    $_SESSION = [];
    session_regenerate_id(true);
    firstLoginPasswordResponse(403, 'Your password-change session is invalid. Sign in again.', 'password_change_session_invalid');
}
if (loginLockoutSecondsRemaining($pdo, (string) ($_SESSION['restricted_password_change_username'] ?? '')) > 0) {
    firstLoginPasswordResponse(429, 'Too many failed attempts. Please sign in again later.');
}

$currentPassword = (string) ($payload['current_password'] ?? '');
$newPassword = (string) ($payload['new_password'] ?? '');
$confirmPassword = (string) ($payload['confirm_password'] ?? '');
if ($currentPassword === '' || $newPassword === '' || $confirmPassword === '') {
    firstLoginPasswordResponse(422, 'Enter the temporary password, new password, and confirmation.');
}
if ($newPassword !== $confirmPassword) {
    firstLoginPasswordResponse(422, 'Passwords do not match.');
}
$rules = firstLoginPasswordRules($newPassword);
if (!in_array(false, $rules, true)) {
    // all required rules are satisfied
} else {
    $messages = [
        'length' => 'Password must be 12–16 characters long.',
        'uppercase' => 'Add at least one uppercase letter.',
        'lowercase' => 'Add at least one lowercase letter.',
        'number' => 'Add at least one number.',
        'special' => 'Add at least one special character.',
    ];
    $missing = [];
    foreach ($rules as $rule => $valid) {
        if (!$valid) $missing[] = $messages[$rule];
    }
    firstLoginPasswordResponse(422, implode(' ', $missing));
}

$passwordCommitted = false;
$user = null;
try {
    $pdo->beginTransaction();
    $stmt = $pdo->prepare(
        'SELECT user_id, username, email, contact_number, password, password_hash, role, status, full_name,
                first_name, last_name, must_change_password
         FROM users
         WHERE user_id = :user_id AND status = "Active" AND COALESCE(is_deleted, 0) = 0
         LIMIT 1 FOR UPDATE'
    );
    $stmt->execute([':user_id' => $userId]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$user || (int) $user['must_change_password'] !== 1) {
        $pdo->rollBack();
        $_SESSION = [];
        session_regenerate_id(true);
        firstLoginPasswordResponse(401, 'This account is no longer awaiting a first-login password change. Sign in again.', 'password_change_session_invalid');
    }

    $currentHash = trim((string) ($user['password_hash'] ?? ''));
    if ($currentHash === '') $currentHash = trim((string) ($user['password'] ?? ''));
    $currentMatches = password_get_info($currentHash)['algo'] !== 0
        ? password_verify($currentPassword, $currentHash)
        : hash_equals($currentHash, $currentPassword);
    if (!$currentMatches) {
        $pdo->rollBack();
        recordLoginAttempt($pdo, (string) $user['username'], $userId, false, 'first_login_password_incorrect');
        auditAuthenticationEvent($pdo, 'FIRST_LOGIN_PASSWORD_CHANGE_FAILED', [
            'user_id' => $userId,
            'user_name' => $user['full_name'] ?: $user['username'],
            'role' => normalizeUserRole((string) $user['role']),
            'success' => false,
            'event_status' => 'Failed',
            'details' => 'Mandatory password change rejected because the temporary password was incorrect.',
            'idempotency_key' => auditRequestId() . ':FIRST_LOGIN_PASSWORD_CHANGE_FAILED',
        ]);
        firstLoginPasswordResponse(422, 'The current temporary password is incorrect.');
    }
    $newMatchesCurrent = password_get_info($currentHash)['algo'] !== 0
        ? password_verify($newPassword, $currentHash)
        : hash_equals($currentHash, $newPassword);
    if ($newMatchesCurrent) {
        $pdo->rollBack();
        firstLoginPasswordResponse(422, 'Your new password must be different from your temporary password.');
    }

    $newHash = password_hash($newPassword, PASSWORD_DEFAULT);
    $update = $pdo->prepare(
        'UPDATE users
         SET password = :password, password_hash = :password_hash,
             must_change_password = 0, updated_at = NOW()
         WHERE user_id = :user_id AND must_change_password = 1'
    );
    $update->execute([':password' => $newHash, ':password_hash' => $newHash, ':user_id' => $userId]);
    if ($update->rowCount() !== 1) {
        throw new RuntimeException('The temporary password flag was not updated.');
    }

    auditAuthenticationEvent($pdo, 'FIRST_LOGIN_PASSWORD_CHANGE_SUCCESS', [
        'user_id' => $userId,
        'user_name' => $user['full_name'] ?: $user['username'],
        'role' => normalizeUserRole((string) $user['role']),
        'details' => 'User completed the mandatory first-login password change.',
    ]);
    $pdo->commit();
    $passwordCommitted = true;
    resetLoginAttempts($pdo, (string) $user['username']);

    // Full authenticated state is issued only after the database confirms the change.
    $_SESSION = [];
    session_regenerate_id(true);
    $role = normalizeUserRole((string) $user['role']);
    $accountContext = loadPrimaryAccountContext($pdo, $userId, (string) $user['role']);
    $_SESSION['user_id'] = $user['user_id'];
    $_SESSION['username'] = $user['username'];
    $_SESSION['email'] = $user['email'];
    $_SESSION['contact_number'] = $user['contact_number'] ?? null;
    $_SESSION['role'] = $role;
    $_SESSION['user_status'] = $user['status'];
    $_SESSION['full_name'] = $user['full_name'];
    $_SESSION['first_name'] = $user['first_name'];
    $_SESSION['last_name'] = $user['last_name'];
    $_SESSION['roles'] = [$role];
    $_SESSION['role_identifiers'] = [legacyRoleIdentifier($role)];
    $_SESSION['account_id'] = $accountContext['account_id'];
    $_SESSION['account_type'] = $accountContext['account_type'];
    $_SESSION['tenant_id'] = $accountContext['tenant_id'];
    $_SESSION['tenant_name'] = $accountContext['tenant_name'];
    $_SESSION['tenant_slug'] = $accountContext['tenant_slug'];
    $_SESSION['primary_domain'] = $accountContext['primary_domain'];
    $tabToken = createAuthSession($pdo, $userId, $accountContext['account_id'], $accountContext['tenant_id']);

    $dashboardPath = userDashboardPath($role);
    if ($dashboardPath === null) {
        throw new RuntimeException('The authenticated role has no dashboard route.');
    }
    echo json_encode([
        'status' => 'success', 'message' => 'Password updated successfully. Redirecting to your dashboard...',
        'redirect' => $dashboardPath, 'tab_token' => $tabToken,
        'session' => currentSessionPayload(),
    ]);
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('Mandatory first-login password update failed: ' . $error->getMessage());
    if ($passwordCommitted) {
        // The password is already saved. Require a fresh login if normal
        // session creation failed; never tell the user the update was lost.
        $_SESSION = [];
        session_regenerate_id(true);
        http_response_code(200);
        echo json_encode([
            'status' => 'success',
            'password_updated' => true,
            'requires_login' => true,
            'message' => 'Your password was updated. Please sign in with your new password.',
        ]);
        exit();
    }
    auditAuthenticationEvent($pdo, 'FIRST_LOGIN_PASSWORD_CHANGE_FAILED', [
        'user_id' => isset($user['user_id']) ? (string) $user['user_id'] : $userId,
        'user_name' => isset($user['username']) ? ($user['full_name'] ?: $user['username']) : (string) ($_SESSION['restricted_password_change_username'] ?? 'Unknown'),
        'role' => isset($user['role']) ? normalizeUserRole((string) $user['role']) : null,
        'success' => false,
        'event_status' => 'Failed',
        'details' => 'Mandatory first-login password change could not be saved.',
        'idempotency_key' => auditRequestId() . ':FIRST_LOGIN_PASSWORD_CHANGE_FAILED',
    ]);
    firstLoginPasswordResponse(500, 'Unable to update your password. You are still restricted; please try again.');
}
