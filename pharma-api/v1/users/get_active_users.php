<?php
require_once '../../config/db_connection.php';
require_once '../../config/auth_context.php';

requireValidSession($pdo);

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode([
        'status' => 'error',
        'message' => 'Only GET requests are allowed.'
    ]);
    exit();
}

$sql = "SELECT user_id, username, full_name, first_name, last_name, role
     FROM users
     WHERE LOWER(COALESCE(status, '')) = 'active'";
if (currentSessionHasRbacRole('manager') || currentSessionHasRbacRole('ro_manager')) {
    $sql .= " AND role IN ('cashier', 'salesclerk')";
}
$sql .= ' ORDER BY role, full_name, username';
$stmt = $pdo->query($sql);

$users = array_map(static function (array $user): array {
    $nameParts = array_filter([
        trim((string) ($user['first_name'] ?? '')),
        trim((string) ($user['last_name'] ?? ''))
    ]);
    $displayName = trim((string) ($user['full_name'] ?? ''));
    if ($displayName === '') {
        $displayName = trim(implode(' ', $nameParts));
    }
    if ($displayName === '') {
        $displayName = trim((string) ($user['username'] ?? 'Staff'));
    }

    return [
        'user_id' => (string) $user['user_id'],
        'name' => $displayName,
        'role' => (string) ($user['role'] ?? 'Staff')
    ];
}, $stmt->fetchAll());

echo json_encode([
    'status' => 'success',
    'users' => $users
]);
?>
