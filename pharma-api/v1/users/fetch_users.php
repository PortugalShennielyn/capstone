<?php
require_once '../../config/db_connection.php';
require_once 'users_helpers.php';

requireUserAdmin($pdo);
ensureUserManagementSchema($pdo);

$search = trim((string) ($_GET['search'] ?? ''));
$role = normalizeUserRole((string) ($_GET['role'] ?? ''));
$status = trim((string) ($_GET['status'] ?? ''));

$where = ['COALESCE(is_deleted, 0) = 0'];
$params = [];

if ($search !== '') {
    $where[] = '(full_name LIKE :search OR username LIKE :search OR role LIKE :search)';
    $params[':search'] = '%' . $search . '%';
}
if ($role !== '' && in_array($role, validUserRoles(), true)) {
    $where[] = 'role = :role';
    $params[':role'] = $role;
}
if (in_array($status, ['Active', 'Inactive'], true)) {
    $where[] = 'status = :status';
    $params[':status'] = $status;
}

$sql = 'SELECT user_id, full_name, username, role, status, email, contact_number, last_login, created_at, updated_at
        FROM users
        WHERE ' . implode(' AND ', $where) . '
        ORDER BY created_at DESC, full_name ASC';
$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$users = array_map(static function (array $row): array {
    $row['role_label'] = roleLabel((string) $row['role']);
    return $row;
}, $stmt->fetchAll());

$summary = $pdo->query(
    "SELECT
        COUNT(*) AS total_users,
        SUM(CASE WHEN status = 'Active' THEN 1 ELSE 0 END) AS active_users,
        SUM(CASE WHEN status = 'Inactive' THEN 1 ELSE 0 END) AS inactive_users
     FROM users
     WHERE COALESCE(is_deleted, 0) = 0"
)->fetch();

sendUserJson(true, 'Users loaded.', [
    'users' => $users,
    'summary' => [
        'total_users' => (int) ($summary['total_users'] ?? 0),
        'active_users' => (int) ($summary['active_users'] ?? 0),
        'inactive_users' => (int) ($summary['inactive_users'] ?? 0),
    ],
]);
?>
