<?php
require_once '../../config/db_connection.php';
require_once '../activity_log_helpers.php';
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
$target = assertCanManageUser($pdo, $userId);
assertSingleActiveSupervisor($pdo, normalizeUserRole((string) ($target['role'] ?? '')), $status, $userId);

$stmt = $pdo->prepare(
    'UPDATE users
     SET status = :status,
         updated_at = NOW()
     WHERE user_id = :user_id
       AND COALESCE(is_deleted, 0) = 0'
);
$stmt->execute([':status' => $status, ':user_id' => $userId]);

$user = $target;
$displayName = trim((string) ($user['full_name'] ?? '')) ?: trim((string) ($user['username'] ?? 'user'));
recordActivityLog(
    $pdo,
    'User Management',
    $status === 'Active' ? 'Activated' : 'Deactivated',
    userManagementActorLabel() . ' ' . strtolower($status === 'Active' ? 'activated' : 'deactivated') . ' user ' . $displayName,
    $userId
);

sendUserJson(true, $status === 'Active' ? 'User activated successfully.' : 'User deactivated successfully.');
?>
