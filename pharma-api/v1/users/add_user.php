<?php
require_once '../../config/db_connection.php';
require_once 'users_helpers.php';

requireUserAdmin($pdo);
ensureUserManagementSchema($pdo);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendUserJson(false, 'Only POST requests are allowed.', null, 405);
}

$payload = readUserJsonPayload();
$fullName = trim((string) ($payload['full_name'] ?? ''));
$username = trim((string) ($payload['username'] ?? ''));
$password = (string) ($payload['password'] ?? '');
$confirmPassword = (string) ($payload['confirm_password'] ?? '');
$role = normalizeUserRole((string) ($payload['role'] ?? ''));
$status = normalizeUserStatus((string) ($payload['status'] ?? 'Active'));
$email = trim((string) ($payload['email'] ?? ''));
$contactNumber = trim((string) ($payload['contact_number'] ?? ''));

if ($fullName === '') sendUserJson(false, 'Full Name is required.', null, 422);
if ($username === '') sendUserJson(false, 'Username is required.', null, 422);
if ($password === '') sendUserJson(false, 'Temporary Password is required.', null, 422);
if ($password !== $confirmPassword) sendUserJson(false, 'Password and Confirm Password must match.', null, 422);
if (!in_array($role, validUserRoles(), true)) sendUserJson(false, 'Role is required.', null, 422);

$exists = $pdo->prepare('SELECT COUNT(*) FROM users WHERE username = :username');
$exists->execute([':username' => $username]);
if ((int) $exists->fetchColumn() > 0) {
    sendUserJson(false, 'Username is already taken.', null, 409);
}

$hash = password_hash($password, PASSWORD_DEFAULT);
$stmt = $pdo->prepare(
    'INSERT INTO users
        (user_id, full_name, username, password, password_hash, role, status, email, contact_number, created_at, updated_at)
     VALUES
        (:user_id, :full_name, :username, :password, :password_hash, :role, :status, :email, :contact_number, NOW(), NOW())'
);
$stmt->execute([
    ':user_id' => newUuid($pdo),
    ':full_name' => $fullName,
    ':username' => $username,
    ':password' => $hash,
    ':password_hash' => $hash,
    ':role' => $role,
    ':status' => $status,
    ':email' => $email !== '' ? $email : null,
    ':contact_number' => $contactNumber !== '' ? $contactNumber : null,
]);

sendUserJson(true, 'User created successfully.');
?>
