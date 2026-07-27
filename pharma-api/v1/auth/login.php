<?php
require_once '../../config/db_connection.php';
require_once '../../config/auth_context.php';
require_once '../users/users_helpers.php';

function sendInvalidLoginResponse(PDO $pdo, string $username = '', ?string $userId = null, string $reason = 'invalid_credentials'): void
{
    if ($username !== '') {
        recordLoginAttempt($pdo, $username, $userId, false, $reason);
    }

    http_response_code(401);
    echo json_encode([
        'status' => 'error',
        'message' => 'Invalid username or password'
    ]);
    exit();
}

function sendLockoutResponse(): void
{
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
        sendLockoutResponse();
    }

    $statement = $pdo->prepare(
        "SELECT user_id, username, email, contact_number, password, password_hash, role, status, full_name, first_name, last_name
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
    $redirects = [
        'super_admin' => 'dashboard.html',
        'admin' => 'dashboard.html',
        'manager' => 'dashboard.html',
        'cashier' => 'cashier_dashboard.html',
        'salesclerk' => 'sales_clerk_pos.html'
    ];

    if (!isset($redirects[$role])) {
        sendInvalidLoginResponse($pdo, $username, $user['user_id'], 'role_not_allowed');
    }

    $accountContext = loadPrimaryAccountContext($pdo, $user['user_id'], $user['role']);

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
    $_SESSION['role_identifiers'] = $accountContext['role_identifiers'];
    $_SESSION['account_id'] = $accountContext['account_id'];
    $_SESSION['account_type'] = $accountContext['account_type'];
    $_SESSION['tenant_id'] = $accountContext['tenant_id'];
    $_SESSION['tenant_name'] = $accountContext['tenant_name'];
    $_SESSION['tenant_slug'] = $accountContext['tenant_slug'];
    $_SESSION['primary_domain'] = $accountContext['primary_domain'];
    $tabToken = createAuthSession($pdo, $user['user_id'], $accountContext['account_id'], $accountContext['tenant_id']);
    recordLoginAttempt($pdo, $username, $user['user_id'], true, null);
    resetLoginAttempts($pdo, $username);
    $lastLoginStmt = $pdo->prepare('UPDATE users SET last_login = NOW(), updated_at = NOW() WHERE user_id = :user_id');
    $lastLoginStmt->execute([':user_id' => $user['user_id']]);

    echo json_encode([
        'status' => 'success',
        'message' => 'Login successful.',
        'redirect' => $redirects[$role],
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
