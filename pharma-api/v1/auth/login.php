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
           AND status = 'Active'
         LIMIT 1"
    );

    $statement->execute([
        ':username' => $username
    ]);

    $user = $statement->fetch();
    $storedHash = (string) ($user['password_hash'] ?? $user['password'] ?? '');

    if (!$user || !password_verify($password, $storedHash)) {
        sendInvalidLoginResponse($pdo, $username, $user['user_id'] ?? null);
    }

    $redirects = [
        'super_admin' => 'dashboard.html',
        'admin' => 'dashboard.html',
        'manager' => 'dashboard.html',
        'cashier' => 'cashier.html',
        'salesclerk' => 'clerk.html',
        'Admin' => 'dashboard.html',
        'Sales Clerk' => 'clerk.html',
        'Cashier' => 'cashier.html'
    ];

    if (!isset($redirects[$user['role']])) {
        sendInvalidLoginResponse($pdo, $username, $user['user_id'], 'role_not_allowed');
    }

    $accountContext = loadPrimaryAccountContext($pdo, $user['user_id'], $user['role']);

    session_regenerate_id(true);

    $_SESSION['user_id'] = $user['user_id'];
    $_SESSION['username'] = $user['username'];
    $_SESSION['email'] = $user['email'];
    $_SESSION['contact_number'] = $user['contact_number'];
    $_SESSION['role'] = $user['role'];
    $_SESSION['user_status'] = $user['status'];
    $_SESSION['full_name'] = $user['full_name'];
    $_SESSION['first_name'] = $user['first_name'];
    $_SESSION['last_name'] = $user['last_name'];
    $_SESSION['roles'] = $accountContext['roles'];
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
        'redirect' => $redirects[$user['role']],
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
