<?php
require_once '../../config/db_connection.php';

function sendInvalidLoginResponse(): void
{
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
    sendInvalidLoginResponse();
}

$username = isset($payload['username']) ? trim((string) $payload['username']) : '';
$password = isset($payload['password']) ? (string) $payload['password'] : '';

if ($username === '' || $password === '') {
    sendInvalidLoginResponse();
}

try {
    $statement = $pdo->prepare(
        "SELECT user_id, username, password, role, full_name
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
        sendInvalidLoginResponse();
    }

    $redirects = [
        'Admin' => 'dashboard.html',
        'Sales Clerk' => 'clerk.html',
        'Cashier' => 'cashier.html'
    ];

    if (!isset($redirects[$user['role']])) {
        sendInvalidLoginResponse();
    }

    session_regenerate_id(true);

    $_SESSION['user_id'] = $user['user_id'];
    $_SESSION['username'] = $user['username'];
    $_SESSION['role'] = $user['role'];
    $_SESSION['full_name'] = $user['full_name'];

    echo json_encode([
        'status' => 'success',
        'message' => 'Login successful.',
        'redirect' => $redirects[$user['role']]
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Unable to process login. Please try again later.'
    ]);
}
?>
