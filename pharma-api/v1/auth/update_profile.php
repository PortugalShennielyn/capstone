<?php
require_once '../../config/db_connection.php';
require_once '../../config/auth_context.php';

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

requireValidSession($pdo, []);

$payload = json_decode(file_get_contents('php://input'), true) ?: [];
$fullName      = trim((string) ($payload['full_name'] ?? ''));
$email         = trim((string) ($payload['email'] ?? ''));
$contactNumber = trim((string) ($payload['contact_number'] ?? ''));

if ($fullName === '') {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => 'Please enter a display name.']);
    exit();
}
if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => 'Invalid email address.']);
    exit();
}

$userId = (string) $_SESSION['user_id'];

try {
    if ($email !== '') {
        $check = $pdo->prepare(
            'SELECT COUNT(*) FROM users
             WHERE LOWER(email) = LOWER(:email) AND user_id <> :user_id'
        );
        $check->execute([':email' => $email, ':user_id' => $userId]);
        if ((int) $check->fetchColumn() > 0) {
            http_response_code(409);
            echo json_encode(['success' => false, 'message' => 'Email already in use.']);
            exit();
        }
    }

    $stmt = $pdo->prepare(
        'UPDATE users
         SET full_name      = :full_name,
             email          = :email,
             contact_number = :contact_number,
             updated_at     = NOW()
         WHERE user_id = :user_id
           AND COALESCE(is_deleted, 0) = 0'
    );
    $stmt->execute([
        ':full_name'      => $fullName,
        ':email'          => $email !== '' ? $email : null,
        ':contact_number' => $contactNumber !== '' ? $contactNumber : null,
        ':user_id'        => $userId,
    ]);

    $_SESSION['full_name']      = $fullName;
    $_SESSION['email']          = $email;
    $_SESSION['contact_number'] = $contactNumber;

    echo json_encode([
        'success' => true,
        'message' => 'Profile updated.',
        'session' => currentSessionPayload(),
    ]);
} catch (PDOException $e) {
    error_log('[UPDATE_PROFILE] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Server error.']);
}