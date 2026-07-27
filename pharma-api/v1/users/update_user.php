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
$fullName = trim((string) ($payload['full_name'] ?? ''));
$username = trim((string) ($payload['username'] ?? ''));
$role = normalizeUserRole((string) ($payload['role'] ?? ''));
$status = normalizeUserStatus((string) ($payload['status'] ?? 'Active'));
$email = trim((string) ($payload['email'] ?? ''));
$contactNumber = trim((string) ($payload['contact_number'] ?? ''));

if ($userId === '') sendUserJson(false, 'User record is missing.', null, 422);
if ($fullName === '') sendUserJson(false, 'Full Name is required.', null, 422);
if ($username === '') sendUserJson(false, 'Username is required.', null, 422);
if (!in_array($role, validUserRoles(), true)) sendUserJson(false, 'Role is required.', null, 422);
assertAssignableUserRole($role);
$target = assertCanManageUser($pdo, $userId, $role);

$exists = $pdo->prepare('SELECT COUNT(*) FROM users WHERE username = :username AND user_id <> :user_id');
$exists->execute([':username' => $username, ':user_id' => $userId]);
if ((int) $exists->fetchColumn() > 0) {
    sendUserJson(false, 'Username is already taken.', null, 409);
}
if ($email !== '') {
    $emailExists = $pdo->prepare('SELECT COUNT(*) FROM users WHERE LOWER(email) = LOWER(:email) AND user_id <> :user_id');
    $emailExists->execute([':email' => $email, ':user_id' => $userId]);
    if ((int) $emailExists->fetchColumn() > 0) {
        sendUserJson(false, 'Email address is already in use.', null, 409);
    }
}

$stmt = $pdo->prepare(
    'UPDATE users
     SET full_name = :full_name,
         username = :username,
         role = :role,
         status = :status,
         email = :email,
         contact_number = :contact_number,
         updated_at = NOW()
     WHERE user_id = :user_id
       AND COALESCE(is_deleted, 0) = 0'
);
$stmt->execute([
    ':full_name' => $fullName,
    ':username' => $username,
    ':role' => $role,
    ':status' => $status,
    ':email' => $email !== '' ? $email : null,
    ':contact_number' => $contactNumber !== '' ? $contactNumber : null,
    ':user_id' => $userId,
]);

recordActivityLog($pdo, 'User Management', 'Updated', userManagementActorLabel() . ' updated user ' . $fullName, $userId);

sendUserJson(true, 'User updated successfully.');
?>
