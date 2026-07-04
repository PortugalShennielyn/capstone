<?php
require_once '../../config/db_connection.php';
require_once 'users_helpers.php';

requireUserAdmin($pdo);
ensureUserManagementSchema($pdo);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendUserJson(false, 'Only POST requests are allowed.', null, 405);
}

$payload = readUserJsonPayload();
$userId = trim((string) ($payload['user_id'] ?? ''));
$status = normalizeUserStatus((string) ($payload['status'] ?? ''));

if ($userId === '') sendUserJson(false, 'User record is missing.', null, 422);

$stmt = $pdo->prepare(
    'UPDATE users
     SET status = :status,
         updated_at = NOW()
     WHERE user_id = :user_id
       AND COALESCE(is_deleted, 0) = 0'
);
$stmt->execute([':status' => $status, ':user_id' => $userId]);

sendUserJson(true, $status === 'Active' ? 'User activated successfully.' : 'User deactivated successfully.');
?>
