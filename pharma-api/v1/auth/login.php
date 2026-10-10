<?php
require_once '../../config/db_connection.php';
require_once '../../config/auth_context.php';
require_once '../users/users_helpers.php';

function sendInvalidLoginResponse(PDO $pdo, string $username = '', ?string $userId = null, string $reason = 'invalid_credentials'): void
{
    if ($username !== '') {
        recordLoginAttempt($pdo, $username, $userId, false, $reason);
        auditAuthenticationEvent($pdo, 'LOGIN_FAILED', [
            'success' => false,
            'actor_authenticated' => false,
            'user_name' => 'Unauthenticated',
            'details' => 'Login failed because the supplied credentials were not accepted.',
        ]);
    }

    http_response_code(401);
    echo json_encode([
        'status' => 'error',
        'message' => 'Invalid username or password'
    ]);
    exit();
}

function sendLockoutResponse(PDO $pdo, string $username): void
{
    auditAuthenticationEvent($pdo, 'LOGIN_FAILED', [
        'success' => false,
        'event_status' => 'Denied',
        'actor_authenticated' => false,
        'user_name' => 'Unauthenticated',
        'details' => 'Login blocked by the authentication rate limit.',
    ]);
    http_response_code(429);
    echo json_encode([
        'status' => 'error',
        'message' => 'Too many failed login attempts. Please try again in 5 minutes.'
    ]);
    exit();
}

function sendInactiveAccountResponse(PDO $pdo, string $username, string $userId): void
{
    recordLoginAttempt($pdo, $username, $userId, false, 'inactive_account');
    auditAuthenticationEvent($pdo, 'LOGIN_FAILED', [
        'success' => false,
        'event_status' => 'Denied',
        'actor_authenticated' => false,
        'user_name' => 'Unauthenticated',
        'details' => 'Login denied because the account is inactive.',
    ]);
    http_response_code(403);
    echo json_encode([
        'status' => 'error',
        'message' => 'This account is inactive. Contact an administrator.'
    ]);
    exit();
}

function storedPasswordValue(array $user): string
{
    $passwordHash = trim((string) ($user['password_hash'] ?? ''));
    $legacyPassword = trim((string) ($user['password'] ?? ''));
    return $passwordHash !== '' ? $passwordHash : $legacyPassword;
}

function passwordMatchesStored(string $password, string $storedPassword): bool
{
    if ($storedPassword === '') {
        return false;
    }

    if (password_get_info($storedPassword)['algo'] !== 0) {
        return password_verify($password, $storedPassword);
    }

    return hash_equals($storedPassword, $password);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode([
        'status' => 'error',
        'message' => 'Only POST requests are allowed.'
    ]);
    exit();
}

$payload = json_decode(file_get_contents('php://input'), true);

if (!is_array($payload)) {
    sendInvalidLoginResponse($pdo);
}

$username = isset($payload['username']) ? trim((string) $payload['username']) : '';
$password = isset($payload['password']) ? (string) $payload['password'] : '';

if ($username === '' || $password === '') {
    sendInvalidLoginResponse($pdo, $username, null, 'missing_credentials');
}

try {
    ensureUserManagementSchema($pdo);

    if (loginLockoutSecondsRemaining($pdo, $username) > 0) {
        sendLockoutResponse($pdo, $username);
    }

    $statement = $pdo->prepare(
        "SELECT user_id, username, email, contact_number, password, password_hash, must_change_password, role, status, full_name, first_name, last_name
         FROM users
         WHERE username = :username
           AND COALESCE(is_deleted, 0) = 0
         LIMIT 1"
    );

    $statement->execute([
        ':username' => $username
    ]);

    $user = $statement->fetch();
    $storedPassword = $user ? storedPasswordValue($user) : '';

    if (!$user || !passwordMatchesStored($password, $storedPassword)) {
        sendInvalidLoginResponse($pdo, $username, $user['user_id'] ?? null);
    }

    if (strcasecmp((string) ($user['status'] ?? ''), 'Active') !== 0) {
        sendInactiveAccountResponse($pdo, $username, (string) $user['user_id']);
    }

    if (password_get_info($storedPassword)['algo'] === 0) {
        $upgradedHash = password_hash($password, PASSWORD_DEFAULT);
        $upgradeStmt = $pdo->prepare(
            'UPDATE users
             SET password = :password,
                 password_hash = :password_hash,
                 updated_at = NOW()
             WHERE user_id = :user_id'
        );
        $upgradeStmt->execute([
            ':password' => $upgradedHash,
            ':password_hash' => $upgradedHash,
            ':user_id' => $user['user_id'],
        ]);
    }

    $role = normalizeUserRole((string) ($user['role'] ?? ''));
    $dashboardPath = userDashboardPath($role);

    if ($dashboardPath === null) {
        sendInvalidLoginResponse($pdo, $username, $user['user_id'], 'role_not_allowed');
    }

    if ((int) ($user['must_change_password'] ?? 0) === 1) {
        // Retain only a server-side, password-change-only session. No normal
        // tab token or auth_sessions row is issued at this stage.
        if (tableExists($pdo, 'auth_sessions')) {
            $revoke = $pdo->prepare(
                'UPDATE auth_sessions
                 SET is_revoked = 1, revoked_at = NOW(), revoked_reason = "first_login_password_change_required",
                     is_active = 0, updated_at = NOW()
                 WHERE user_id = :user_id AND is_revoked = 0'
            );
            $revoke->execute([':user_id' => $user['user_id']]);
        }
        $_SESSION = [];
        session_regenerate_id(true);
        $_SESSION['restricted_password_change_user_id'] = (string) $user['user_id'];
        $_SESSION['restricted_password_change_username'] = (string) $user['username'];
        $_SESSION['restricted_password_change_started_at'] = time();
        $_SESSION['restricted_password_change_nonce'] = bin2hex(random_bytes(24));
        auditAuthenticationEvent($pdo, 'FIRST_LOGIN_PASSWORD_CHANGE_REQUIRED', [
            'user_id' => (string) $user['user_id'],
            'user_name' => $user['full_name'] ?: $user['username'],
            'role' => $role,
            'details' => 'First-login password change required before system access.',
        ]);
        recordLoginAttempt($pdo, $username, (string) $user['user_id'], true, null);
        resetLoginAttempts($pdo, $username);
        $lastLoginStmt = $pdo->prepare('UPDATE users SET last_login = NOW(), updated_at = NOW() WHERE user_id = :user_id');
        $lastLoginStmt->execute([':user_id' => $user['user_id']]);

        echo json_encode([
            'status' => 'success',
            'must_change_password' => true,
            'password_change_token' => $_SESSION['restricted_password_change_nonce'],
            'message' => 'Change your temporary password before continuing.',
        ]);
        exit();
    }

    $accountContext = loadPrimaryAccountContext($pdo, $user['user_id'], $user['role']);

    authDiagnosticLog('Session regeneration', ['function' => 'login']);
    $_SESSION = [];
    session_regenerate_id(true);

    $_SESSION['user_id'] = $user['user_id'];
    $_SESSION['username'] = $user['username'];
    $_SESSION['email'] = $user['email'];
    $_SESSION['contact_number'] = $user['contact_number'];
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
    $tabToken = createAuthSession($pdo, $user['user_id'], $accountContext['account_id'], $accountContext['tenant_id']);
    auditAuthenticationEvent($pdo, 'LOGIN_SUCCESS', [
        'user_id' => $user['user_id'],
        'user_name' => $user['full_name'] ?: $user['username'],
        'role' => $role,
        'auth_session_id' => $_SESSION['auth_session_id'] ?? null,
        'details' => 'User logged in',
    ]);
    authDiagnosticLog('Session verified', [
        'function' => 'login',
        'auth_session' => maskedAuthIdentifier((string) ($_SESSION['auth_session_id'] ?? '')),
    ]);
    recordLoginAttempt($pdo, $username, $user['user_id'], true, null);
    resetLoginAttempts($pdo, $username);
    $lastLoginStmt = $pdo->prepare('UPDATE users SET last_login = NOW(), updated_at = NOW() WHERE user_id = :user_id');
    $lastLoginStmt->execute([':user_id' => $user['user_id']]);

    echo json_encode([
        'status' => 'success',
        'message' => 'Login successful.',
        'redirect' => $dashboardPath,
        'tab_token' => $tabToken,
        'session' => currentSessionPayload()
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Unable to process login. Please try again later.'
    ]);
}
?>
