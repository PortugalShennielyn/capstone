<?php
require_once '../../config/db_connection.php';
require_once '../../config/auth_context.php';

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
    $statement = $pdo->prepare(
        "SELECT user_id, username, email, password, role, status, full_name, first_name, last_name
         FROM users
         WHERE username = :username
           AND status = 'Active'
         LIMIT 1"
    );

    $statement->execute([
        ':username' => $username
    ]);

    $user = $statement->fetch();

    if (!$user || !password_verify($password, $user['password'])) {
        sendInvalidLoginResponse($pdo, $username, $user['user_id'] ?? null);
    }

    $redirects = [
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
    createAuthSession($pdo, $user['user_id'], $accountContext['account_id'], $accountContext['tenant_id']);
    recordLoginAttempt($pdo, $username, $user['user_id'], true, null);

    echo json_encode([
        'status' => 'success',
        'message' => 'Login successful.',
        'redirect' => $redirects[$user['role']],
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
