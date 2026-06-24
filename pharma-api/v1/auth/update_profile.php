<?php
require_once '../../config/db_connection.php';
require_once '../../config/auth_context.php';

if (!isset($_SESSION['user_id'], $_SESSION['role'])) {
    http_response_code(401);
    echo json_encode([
        'status' => 'error',
        'message' => 'Unauthorized'
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
    http_response_code(400);
    echo json_encode([
        'status' => 'error',
        'message' => 'Invalid profile update payload.'
    ]);
    exit();
}

$username = trim((string) ($payload['username'] ?? ($_SESSION['username'] ?? '')));
$email = trim((string) ($payload['email'] ?? ''));
$fullName = trim((string) ($payload['full_name'] ?? ''));
$firstName = trim((string) ($payload['first_name'] ?? ''));
$lastName = trim((string) ($payload['last_name'] ?? ''));

$username = preg_replace('/\s+/', '', $username);
$email = preg_replace('/\s+/', '', $email);
$fullName = preg_replace('/\s+/', ' ', $fullName);
$firstName = preg_replace('/\s+/', ' ', $firstName);
$lastName = preg_replace('/\s+/', ' ', $lastName);

if ($username === '' || mb_strlen($username) > 50) {
    http_response_code(422);
    echo json_encode([
        'status' => 'error',
        'message' => 'Username is required and must be 50 characters or fewer.'
    ]);
    exit();
}

if (!preg_match('/^[A-Za-z0-9._-]+$/', $username)) {
    http_response_code(422);
    echo json_encode([
        'status' => 'error',
        'message' => 'Username can only include letters, numbers, dots, underscores, and hyphens.'
    ]);
    exit();
}

if ($email !== '' && (mb_strlen($email) > 255 || !filter_var($email, FILTER_VALIDATE_EMAIL))) {
    http_response_code(422);
    echo json_encode([
        'status' => 'error',
        'message' => 'Enter a valid email address.'
    ]);
    exit();
}

if ($fullName === '' || mb_strlen($fullName) > 100) {
    http_response_code(422);
    echo json_encode([
        'status' => 'error',
        'message' => 'Full name is required and must be 100 characters or fewer.'
    ]);
    exit();
}

if (mb_strlen($firstName) > 100 || mb_strlen($lastName) > 100) {
    http_response_code(422);
    echo json_encode([
        'status' => 'error',
        'message' => 'First name and last name must be 100 characters or fewer.'
    ]);
    exit();
}

try {
    $pdo->beginTransaction();

    $duplicateStmt = $pdo->prepare(
        'SELECT user_id
         FROM users
         WHERE username = :username
           AND user_id <> :user_id
         LIMIT 1'
    );
    $duplicateStmt->execute([
        ':username' => $username,
        ':user_id' => $_SESSION['user_id'],
    ]);

    if ($duplicateStmt->fetchColumn()) {
        $pdo->rollBack();
        http_response_code(409);
        echo json_encode([
            'status' => 'error',
            'message' => 'That username is already in use.'
        ]);
        exit();
    }

    if ($email !== '') {
        $emailStmt = $pdo->prepare(
            'SELECT user_id
             FROM users
             WHERE email = :email
               AND user_id <> :user_id
             LIMIT 1'
        );
        $emailStmt->execute([
            ':email' => $email,
            ':user_id' => $_SESSION['user_id'],
        ]);

        if ($emailStmt->fetchColumn()) {
            $pdo->rollBack();
            http_response_code(409);
            echo json_encode([
                'status' => 'error',
                'message' => 'That email address is already in use.'
            ]);
            exit();
        }
    }

    $stmt = $pdo->prepare(
        'UPDATE users
         SET username = :username,
             email = :email,
             full_name = :full_name,
             first_name = :first_name,
             last_name = :last_name
         WHERE user_id = :user_id'
    );
    $stmt->execute([
        ':username' => $username,
        ':email' => $email === '' ? null : $email,
        ':full_name' => $fullName,
        ':first_name' => $firstName === '' ? null : $firstName,
        ':last_name' => $lastName === '' ? null : $lastName,
        ':user_id' => $_SESSION['user_id'],
    ]);

    $pdo->commit();

    $_SESSION['username'] = $username;
    $_SESSION['email'] = $email === '' ? null : $email;
    $_SESSION['full_name'] = $fullName;
    $_SESSION['first_name'] = $firstName === '' ? null : $firstName;
    $_SESSION['last_name'] = $lastName === '' ? null : $lastName;

    http_response_code(200);
    echo json_encode(array_merge([
        'status' => 'success',
        'message' => 'Profile identity updated.'
    ], currentSessionPayload()));
} catch (PDOException $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Unable to update profile identity.'
    ]);
}
?>
