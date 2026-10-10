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
assertSingleActiveSupervisor($pdo, $role, $status, $userId);

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

$previousRole = normalizeUserRole((string) ($target['role'] ?? ''));
$previousUsername = (string) ($target['username'] ?? '');
$pdo->beginTransaction();
try {
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

$trackableAuditChange = $previousRole !== $role || $previousUsername !== $username;
recordActivityLog($pdo, 'User Management', 'Updated', userManagementActorLabel() . ' updated user ' . $fullName, $userId, null, null, !$trackableAuditChange);
$changedFields = [];
if ($previousRole !== $role) $changedFields['role'] = ['previous' => $previousRole, 'new' => $role];
if ($previousUsername !== $username) $changedFields['username'] = ['previous' => $previousUsername, 'new' => $username];
if ($previousRole !== $role) {
    recordManagementAudit($pdo, 'ROLE_CHANGED', userManagementActorLabel() . ' changed ' . $previousUsername . "'s role from " . roleLabel($previousRole) . ' to ' . roleLabel($role) . '.', 'User Account', $userId, [
        'affected_user_id' => $userId,
        'affected_username' => $username,
        'previous_role' => $previousRole,
        'new_role' => $role,
        'changed_fields' => $changedFields,
    ]);
} elseif ($changedFields !== []) {
    recordManagementAudit($pdo, 'USER_UPDATED', userManagementActorLabel() . ' updated account ' . $username . '.', 'User Account', $userId, [
        'affected_user_id' => $userId,
        'affected_username' => $username,
        'changed_fields' => $changedFields,
    ]);
}
$pdo->commit();
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('User update transaction failed: ' . $error->getMessage());
    sendUserJson(false, 'Unable to update the user account.', null, 500);
}

sendUserJson(true, 'User updated successfully.');
?>
