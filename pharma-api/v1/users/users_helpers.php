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

function ensureUserManagementSchema(PDO $pdo): void
{
    if (!userColumnExists($pdo, 'password_hash')) {
        $pdo->exec('ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NULL AFTER password');
        $pdo->exec('UPDATE users SET password_hash = password WHERE password_hash IS NULL OR password_hash = ""');
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

    $pdo->exec(
        "UPDATE users
         SET role = CASE role
            WHEN 'Admin' THEN 'admin'
            WHEN 'Sales Clerk' THEN 'salesclerk'
            WHEN 'Cashier' THEN 'cashier'
            WHEN 'Owner/Manager' THEN 'manager'
            WHEN 'Manager / Owner' THEN 'manager'
            ELSE role
         END"
    );
    $pdo->exec("ALTER TABLE users MODIFY role ENUM('super_admin','admin','manager','cashier','salesclerk') NOT NULL DEFAULT 'salesclerk'");
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
        'owner/manager' => 'manager',
        'manager / owner' => 'manager',
        'manager' => 'manager',
        'sales clerk' => 'salesclerk',
        'sales-clerk' => 'salesclerk',
        'sales_clerk' => 'salesclerk',
    ];
    return $aliases[$value] ?? $value;
}

function roleLabel(string $role): string
{
    return [
        'super_admin' => 'Super Admin',
        'admin' => 'Admin',
        'manager' => 'Manager / Owner',
        'cashier' => 'Cashier',
        'salesclerk' => 'Sales Clerk',
    ][$role] ?? $role;
}

function validUserRoles(): array
{
    return ['super_admin', 'admin', 'manager', 'cashier', 'salesclerk'];
}

function normalizeUserStatus(string $status): string
{
    return strtolower(trim($status)) === 'inactive' ? 'Inactive' : 'Active';
}

function requireUserAdmin(PDO $pdo): void
{
    $allowedRoles = ['super_admin', 'admin', 'Admin', 'Super Admin', 'ro-admin', 'ro-super-admin'];
    require_once '../../config/require_auth.php';
}

?>
