<?php

function userColumnExists(PDO $pdo, string $column): bool
{
    $stmt = $pdo->prepare(
        'SELECT COUNT(*)
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = "users"
           AND COLUMN_NAME = :column'
    );
    $stmt->execute([':column' => $column]);
    return (int) $stmt->fetchColumn() > 0;
}

function userColumnType(PDO $pdo, string $column): ?string
{
    $stmt = $pdo->prepare(
        'SELECT COLUMN_TYPE
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = "users"
           AND COLUMN_NAME = :column
         LIMIT 1'
    );
    $stmt->execute([':column' => $column]);
    $type = $stmt->fetchColumn();
    return $type === false ? null : strtolower((string) $type);
}

function ensureUserManagementSchema(PDO $pdo): void
{
    if (!userColumnExists($pdo, 'password_hash')) {
        $pdo->exec('ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NULL AFTER password');
        $pdo->exec('UPDATE users SET password_hash = password WHERE password_hash IS NULL OR password_hash = ""');
    }
    // Existing accounts keep their current behavior; only accounts created by
    // the user-management flow below are marked for a mandatory first login change.
    if (!userColumnExists($pdo, 'must_change_password')) {
        $pdo->exec('ALTER TABLE users ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0 AFTER password_hash');
    }
    if (!userColumnExists($pdo, 'contact_number')) {
        $pdo->exec('ALTER TABLE users ADD COLUMN contact_number VARCHAR(50) NULL AFTER email');
    }
    if (!userColumnExists($pdo, 'last_login')) {
        $pdo->exec('ALTER TABLE users ADD COLUMN last_login DATETIME NULL AFTER status');
    }
    if (!userColumnExists($pdo, 'updated_at')) {
        $pdo->exec('ALTER TABLE users ADD COLUMN updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP AFTER created_at');
    }

    $requiredRoleType = "enum('super_admin','admin','supervisor','cashier','salesclerk')";
    if (userColumnType($pdo, 'role') !== $requiredRoleType) {
        retireManagerAccounts($pdo);
        $pdo->exec(
            "UPDATE users
             SET role = CASE role
                WHEN 'Admin' THEN 'admin'
                WHEN 'Super Admin' THEN 'super_admin'
                WHEN 'Sales Clerk' THEN 'salesclerk'
                WHEN 'Cashier' THEN 'cashier'
                WHEN 'Supervisor' THEN 'supervisor'
                WHEN 'CEO' THEN 'supervisor'
                WHEN 'Inventory Manager' THEN 'supervisor'
                ELSE role
             END"
        );
        $pdo->exec("ALTER TABLE users MODIFY role ENUM('super_admin','admin','supervisor','cashier','salesclerk') NOT NULL DEFAULT 'salesclerk'");
    }
    relabelInventoryManagerRole($pdo);
}

function retireManagerAccounts(PDO $pdo): void
{
    $ids = $pdo->query("SELECT user_id FROM users WHERE role = 'manager'")->fetchAll(PDO::FETCH_COLUMN);
    if (!$ids) return;

    $marks = implode(',', array_fill(0, count($ids), '?'));
    $references = $pdo->query(
        "SELECT TABLE_NAME, COLUMN_NAME
         FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = DATABASE()
           AND REFERENCED_TABLE_NAME = 'users'
           AND REFERENCED_COLUMN_NAME = 'user_id'"
    )->fetchAll(PDO::FETCH_ASSOC);
    foreach ($references as $reference) {
        $table = (string) ($reference['TABLE_NAME'] ?? '');
        $column = (string) ($reference['COLUMN_NAME'] ?? '');
        if (!preg_match('/^[A-Za-z0-9_]+$/', $table) || !preg_match('/^[A-Za-z0-9_]+$/', $column)) continue;
        $pdo->prepare("DELETE FROM `{$table}` WHERE `{$column}` IN ($marks)")->execute($ids);
    }
    $pdo->prepare("DELETE FROM users WHERE role = 'manager' AND user_id IN ($marks)")->execute($ids);
}

function relabelInventoryManagerRole(PDO $pdo): void
{
    $table = $pdo->query("SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'roles'")->fetchColumn();
    if (!(int) $table) return;
    $pdo->exec("UPDATE roles SET name = 'Inventory Manager' WHERE role_identifier = 'ro-supervisor' AND name <> 'Inventory Manager'");
}

function sendUserJson(bool $success, string $message, $data = null, int $status = 200): void
{
    http_response_code($status);
    $payload = ['success' => $success, 'message' => $message];
    if ($data !== null) {
        $payload['data'] = $data;
    }
    echo json_encode($payload);
    exit();
}

function readUserJsonPayload(): array
{
    $payload = json_decode(file_get_contents('php://input'), true);
    return is_array($payload) ? $payload : $_POST;
}

function normalizeUserRole(string $role): string
{
    $value = strtolower(trim($role));
    $aliases = [
        'super admin' => 'super_admin',
        'supervisor' => 'supervisor',
        'ceo' => 'supervisor',
        'inventory manager' => 'supervisor',
        'inventory_manager' => 'supervisor',
        'inventory-manager' => 'supervisor',
        'cashier' => 'cashier',
        'sales clerk' => 'salesclerk',
        'sales-clerk' => 'salesclerk',
        'sales_clerk' => 'salesclerk',
    ];
    return $aliases[$value] ?? $value;
}

function userDashboardPath(string $role): ?string
{
    $routes = [
        'super_admin' => 'dashboard.html',
        'admin' => 'dashboard.html',
        'manager' => 'dashboard.html',
        'supervisor' => 'supervisor_dashboard.html',
        'cashier' => 'cashier_dashboard.html',
        'salesclerk' => 'sales_clerk_dashboard.html',
    ];
    return $routes[normalizeUserRole($role)] ?? null;
}

function roleLabel(string $role): string
{
    return [
        'super_admin' => 'Super Admin',
        'admin' => 'Admin',
        'manager' => 'Manager',
        'supervisor' => 'Inventory Manager',
        'cashier' => 'Cashier',
        'salesclerk' => 'Sales Clerk',
    ][$role] ?? $role;
}

function validUserRoles(): array
{
    return ['super_admin', 'admin', 'supervisor', 'cashier', 'salesclerk'];
}

function normalizeUserStatus(string $status): string
{
    return strtolower(trim($status)) === 'inactive' ? 'Inactive' : 'Active';
}

function requireUserAdmin(PDO $pdo): void
{
    $allowedRoles = ['super_admin', 'admin', 'manager', 'Admin', 'Super Admin', 'ro-admin', 'ro-super-admin', 'ro-manager'];
    require_once '../../config/require_auth.php';
}

function currentUserManagementRole(): string
{
    $roles = currentSessionRbacRoles();
    if (in_array('super_admin', $roles, true) || in_array('ro_super_admin', $roles, true)) return 'super_admin';
    if (in_array('admin', $roles, true) || in_array('ro_admin', $roles, true)) return 'admin';
    if (in_array('manager', $roles, true) || in_array('ro_manager', $roles, true)) return 'manager';
    return '';
}

function creatableUserRoles(): array
{
    return ['cashier', 'salesclerk', 'supervisor'];
}

function assignableUserRoles(): array
{
    return creatableUserRoles();
}

function sendUserPermissionDenied(): void
{
    sendUserJson(
        false,
        'You do not have permission to manage this account or assign this role.',
        null,
        403
    );
}

function assertAssignableUserRole(string $role, ?string $existingRole = null): void
{
    $role = normalizeUserRole($role);
    $existingRole = $existingRole === null ? '' : normalizeUserRole($existingRole);
    if ($existingRole !== '' && $role === $existingRole && in_array($role, ['admin', 'super_admin'], true)) {
        return;
    }
    if (!in_array($role, creatableUserRoles(), true)) {
        sendUserPermissionDenied();
    }
}

function assertSingleSuperAdmin(PDO $pdo, string $role, ?string $excludeUserId = null): void
{
    if (normalizeUserRole($role) !== 'super_admin') return;
    $sql = "SELECT COUNT(*) FROM users WHERE role = 'super_admin' AND COALESCE(is_deleted, 0) = 0";
    $params = [];
    if ($excludeUserId !== null && cleanId($excludeUserId) !== '') {
        $sql .= ' AND user_id <> :user_id';
        $params[':user_id'] = cleanId($excludeUserId);
    }
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    if ((int) $stmt->fetchColumn() > 0) {
        sendUserJson(false, 'Only one Super Admin account is allowed.', null, 409);
    }
}

function assertSingleActiveSupervisor(PDO $pdo, string $role, string $status, ?string $excludeUserId = null): void
{
    if ($role !== 'supervisor' || $status !== 'Active') return;
    $sql = "SELECT COUNT(*) FROM users WHERE role = 'supervisor' AND status = 'Active' AND COALESCE(is_deleted, 0) = 0";
    $params = [];
    if ($excludeUserId !== null && cleanId($excludeUserId) !== '') {
        $sql .= ' AND user_id <> :user_id';
        $params[':user_id'] = cleanId($excludeUserId);
    }
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    if ((int) $stmt->fetchColumn() > 0) {
        sendUserJson(false, 'Only one active Inventory Manager account is allowed.', null, 409);
    }
}

function managedUser(PDO $pdo, string $userId): array
{
    $stmt = $pdo->prepare(
        'SELECT user_id, full_name, username, role, status
         FROM users
         WHERE user_id = :user_id
           AND COALESCE(is_deleted, 0) = 0
         LIMIT 1'
    );
    $stmt->execute([':user_id' => $userId]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$user) {
        sendUserJson(false, 'User record was not found.', null, 404);
    }

    return $user;
}

function assertCanManageUser(PDO $pdo, string $userId, ?string $submittedRole = null): array
{
    $target = managedUser($pdo, $userId);
    if (currentUserManagementRole() !== 'manager') {
        return $target;
    }

    $targetRole = normalizeUserRole((string) ($target['role'] ?? ''));
    $actorId = cleanId($_SESSION['user_id'] ?? null);
    if (
        cleanId($userId) === $actorId
        || !in_array($targetRole, ['cashier', 'salesclerk'], true)
        || ($submittedRole !== null && !in_array($submittedRole, ['cashier', 'salesclerk'], true))
    ) {
        sendUserPermissionDenied();
    }

    return $target;
}

function assertAdminAccountStaysActive(string $currentRole, string $nextRole, string $nextStatus): void
{
    $protectsAdmin = normalizeUserRole($currentRole) === 'admin' || normalizeUserRole($nextRole) === 'admin';
    if ($protectsAdmin && $nextStatus !== 'Active') {
        sendUserJson(false, 'Admin accounts cannot be deactivated.', null, 422);
    }
}

function userManagementActorLabel(): string
{
    $name = trim((string) ($_SESSION['full_name'] ?? $_SESSION['username'] ?? 'User'));
    return $name !== '' ? $name : 'User';
}

?>
