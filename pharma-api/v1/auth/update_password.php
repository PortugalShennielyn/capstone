<?php
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
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
        'message' => 'Invalid password update payload.'
    ]);
    exit();
}

$currentPassword = (string) ($payload['current_password'] ?? '');
$newPassword = (string) ($payload['new_password'] ?? '');
$confirmPassword = (string) ($payload['confirm_password'] ?? '');

if ($currentPassword === '' || $newPassword === '' || $confirmPassword === '') {
    http_response_code(422);
    echo json_encode([
        'status' => 'error',
        'message' => 'Current password, new password, and confirmation are required.'
    ]);
    exit();
}

if ($newPassword !== $confirmPassword) {
    http_response_code(422);
    echo json_encode([
        'status' => 'error',
        'message' => 'New password and confirmation do not match.'
    ]);
    exit();
}

if (strlen($newPassword) < 8 || strlen($newPassword) > 72) {
    http_response_code(422);
    echo json_encode([
        'status' => 'error',
        'message' => 'New password must be between 8 and 72 characters.'
    ]);
    exit();
}

try {
    $stmt = $pdo->prepare(
        'SELECT password, password_hash
         FROM users
         WHERE user_id = :user_id
         LIMIT 1'
    );
    $stmt->execute([':user_id' => $_SESSION['user_id']]);
    $user = $stmt->fetch();

    $currentHash = (string) ($user['password_hash'] ?? $user['password'] ?? '');

    if (!$user || !password_verify($currentPassword, $currentHash)) {
        http_response_code(422);
        echo json_encode([
            'status' => 'error',
            'message' => 'Current password is incorrect.'
        ]);
        exit();
    }

    if (password_verify($newPassword, $currentHash)) {
        http_response_code(422);
        echo json_encode([
            'status' => 'error',
            'message' => 'New password must be different from the current password.'
        ]);
        exit();
    }

    $pdo->beginTransaction();

    $newHash = password_hash($newPassword, PASSWORD_DEFAULT);
    $updateStmt = $pdo->prepare(
        'UPDATE users
         SET password = :password,
             password_hash = :password_hash
         WHERE user_id = :user_id'
    );
    $updateStmt->execute([
        ':password' => $newHash,
        ':password_hash' => $newHash,
        ':user_id' => $_SESSION['user_id'],
    ]);

    if (tableExists($pdo, 'auth_sessions') && !empty($_SESSION['auth_session_id'])) {
        $sessionStmt = $pdo->prepare(
            'UPDATE auth_sessions
             SET is_revoked = 1,
                 revoked_at = NOW(),
                 revoked_reason = "password_change",
                 is_active = 0,
                 updated_at = NOW()
             WHERE user_id = :user_id
               AND auth_session_id <> :auth_session_id
               AND is_revoked = 0'
        );
        $sessionStmt->execute([
            ':user_id' => $_SESSION['user_id'],
            ':auth_session_id' => $_SESSION['auth_session_id'],
        ]);
    }

    $pdo->commit();

    http_response_code(200);
    echo json_encode([
        'status' => 'success',
        'message' => 'Password updated. Other active sessions were revoked.'
    ]);
} catch (PDOException $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Unable to update password.'
    ]);
}
?>
