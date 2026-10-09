<?php
require_once '../../config/db_connection.php';
require_once '../../config/password_reset_helpers.php';

header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: ' . ($_SERVER['HTTP_ORIGIN'] ?? '*'));
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Headers: Content-Type, X-Tab-Token');
header('Access-Control-Allow-Methods: POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Only POST allowed.']);
    exit();
}

$payload = json_decode(file_get_contents('php://input'), true) ?: [];
$email   = trim((string) ($payload['email'] ?? ''));

if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => 'A valid email address is required.']);
    exit();
}

try {
    ensurePasswordResetTable($pdo);
    $stmt = $pdo->prepare(
        'SELECT user_id, full_name, username
         FROM users
         WHERE LOWER(email) = LOWER(:email)
           AND status = "Active"
           AND COALESCE(is_deleted, 0) = 0
         LIMIT 1'
    );
    $stmt->execute([':email' => $email]);
    $user = $stmt->fetch();

    if (!$user) {
        echo json_encode([
            'success' => true,
            'message' => 'If that email exists in our system, a code has been sent.',
        ]);
        exit();
    }

    $code = generateVerificationCode();
    $resetId = createPasswordReset($pdo, (string) $user['user_id'], $email, $code);

    $displayName = $user['full_name'] ?: $user['username'] ?: 'User';
    $sent = sendVerificationEmail($email, $code, $displayName);

    if (!$sent) {
        consumePasswordReset($pdo, $resetId);
        http_response_code(503);
        echo json_encode(['success' => false, 'message' => 'We could not send the verification email right now. Please try again later.']);
        exit();
    }

    echo json_encode(['success' => true, 'message' => 'If the email is registered, a verification code has been sent.']);
} catch (Throwable $e) {
    error_log('[PASSWORD_RESET] Verification code request failed: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Server error. Try again later.']);
}