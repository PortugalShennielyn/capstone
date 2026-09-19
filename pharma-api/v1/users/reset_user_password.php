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
$password = (string) ($payload['password'] ?? '');
$confirmPassword = (string) ($payload['confirm_password'] ?? '');

if ($userId === '') sendUserJson(false, 'User record is missing.', null, 422);
if ($password === '') sendUserJson(false, 'Temporary Password is required.', null, 422);
if ($password !== $confirmPassword) sendUserJson(false, 'Password and Confirm Password must match.', null, 422);
<<<<<<< HEAD
if (!isStrongUserPassword($password)) sendUserJson(false, 'Enter a password of at least 8 characters, with an uppercase, number and a symbol.', null, 422);
=======
>>>>>>> 2ed0554fe1db566e6833390b8a9bc5cd726661b2
assertCanManageUser($pdo, $userId);

$hash = password_hash($password, PASSWORD_DEFAULT);
$stmt = $pdo->prepare(
    'UPDATE users
     SET password = :password,
         password_hash = :password_hash,
         updated_at = NOW()
     WHERE user_id = :user_id
       AND COALESCE(is_deleted, 0) = 0'
);
$stmt->execute([
    ':password' => $hash,
    ':password_hash' => $hash,
    ':user_id' => $userId,
]);

sendUserJson(true, 'Password reset successfully.');
?>
