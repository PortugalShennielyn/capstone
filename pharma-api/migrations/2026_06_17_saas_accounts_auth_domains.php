<?php

$host = '127.0.0.1';
$dbName = 'pharma_db';
$username = 'root';
$password = '';

$pdo = new PDO(
    "mysql:host={$host};dbname={$dbName};charset=utf8mb4",
    $username,
    $password,
    [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]
);

require_once __DIR__ . '/../config/id_helpers.php';

function migrationTableExists(PDO $pdo, string $table): bool
{
    $stmt = $pdo->prepare(
        'SELECT COUNT(*)
         FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = :table'
    );
    $stmt->execute([':table' => $table]);
    return (int) $stmt->fetchColumn() > 0;
}

function migrationColumnExists(PDO $pdo, string $table, string $column): bool
{
    $stmt = $pdo->prepare(
        'SELECT COUNT(*)
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = :table
           AND COLUMN_NAME = :column'
    );
    $stmt->execute([':table' => $table, ':column' => $column]);
    return (int) $stmt->fetchColumn() > 0;
}

function migrationIndexExists(PDO $pdo, string $table, string $index): bool
{
    $stmt = $pdo->prepare(
        'SELECT COUNT(*)
         FROM INFORMATION_SCHEMA.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = :table
           AND INDEX_NAME = :index'
    );
    $stmt->execute([':table' => $table, ':index' => $index]);
    return (int) $stmt->fetchColumn() > 0;
}

function addColumnIfMissing(PDO $pdo, string $table, string $column, string $definition): void
{
    if (!migrationColumnExists($pdo, $table, $column)) {
        $pdo->exec("ALTER TABLE `{$table}` ADD COLUMN `{$column}` {$definition}");
    }
}

function addIndexIfMissing(PDO $pdo, string $table, string $index, string $definition): void
{
    if (!migrationIndexExists($pdo, $table, $index)) {
        $pdo->exec("ALTER TABLE `{$table}` ADD {$definition}");
    }
}

function fetchId(PDO $pdo, string $table, string $idColumn, string $whereColumn, string $value): ?string
{
    $stmt = $pdo->prepare("SELECT `{$idColumn}` FROM `{$table}` WHERE `{$whereColumn}` = :value LIMIT 1");
    $stmt->execute([':value' => $value]);
    $id = $stmt->fetchColumn();
    return $id === false ? null : (string) $id;
}

function ensureTenant(PDO $pdo): string
{
    $existing = fetchId($pdo, 'tenants', 'tenant_id', 'slug', 'dr-r-pharmacy');
    if ($existing !== null) {
        return $existing;
    }

    $tenantId = newUuid($pdo);
    $stmt = $pdo->prepare(
        'INSERT INTO tenants (tenant_id, name, slug, status)
         VALUES (:tenant_id, :name, :slug, :status)'
    );
    $stmt->execute([
        ':tenant_id' => $tenantId,
        ':name' => 'Dr. R Pharmacy',
        ':slug' => 'dr-r-pharmacy',
        ':status' => 'active',
    ]);

    return $tenantId;
}

function ensureAccountType(PDO $pdo, string $code, string $name): string
{
    $existing = fetchId($pdo, 'account_types', 'account_type_id', 'code', $code);
    if ($existing !== null) {
        return $existing;
    }

    $id = newUuid($pdo);
    $stmt = $pdo->prepare(
        'INSERT INTO account_types (account_type_id, code, name)
         VALUES (:account_type_id, :code, :name)'
    );
    $stmt->execute([
        ':account_type_id' => $id,
        ':code' => $code,
        ':name' => $name,
    ]);

    return $id;
}

function ensureRole(PDO $pdo, string $identifier, string $name, string $description): string
{
    $existing = fetchId($pdo, 'roles', 'role_id', 'role_identifier', $identifier);
    if ($existing !== null) {
        return $existing;
    }

    $id = newUuid($pdo);
    $stmt = $pdo->prepare(
        'INSERT INTO roles (role_id, role_identifier, name, description, is_system)
         VALUES (:role_id, :role_identifier, :name, :description, 1)'
    );
    $stmt->execute([
        ':role_id' => $id,
        ':role_identifier' => $identifier,
        ':name' => $name,
        ':description' => $description,
    ]);

    return $id;
}

function roleIdentifierForLegacyRole(string $role): string
{
    $map = [
        'Admin' => 'ro-admin',
        'Sales Clerk' => 'ro-sales-clerk',
        'Cashier' => 'ro-cashier',
    ];

    return $map[$role] ?? strtolower('ro-' . preg_replace('/[^A-Za-z0-9]+/', '-', trim($role)));
}

function seedCurrentUsers(PDO $pdo, string $tenantId, string $staffTypeId, array $roleIds): void
{
    $users = $pdo->query('SELECT user_id, username, full_name, role FROM users')->fetchAll();

    foreach ($users as $user) {
        $nameParts = preg_split('/\s+/', trim((string) $user['full_name']), 2);
        $firstName = $nameParts[0] ?? '';
        $lastName = $nameParts[1] ?? '';
        $email = filter_var($user['username'], FILTER_VALIDATE_EMAIL) ? $user['username'] : null;

        $updateUser = $pdo->prepare(
            'UPDATE users
             SET email = COALESCE(email, :email),
                 first_name = COALESCE(first_name, :first_name),
                 last_name = COALESCE(last_name, :last_name),
                 updated_at = NOW()
             WHERE user_id = :user_id'
        );
        $updateUser->execute([
            ':email' => $email,
            ':first_name' => $firstName,
            ':last_name' => $lastName,
            ':user_id' => $user['user_id'],
        ]);

        $accountStmt = $pdo->prepare(
            'SELECT account_id
             FROM accounts
             WHERE user_id = :user_id
               AND tenant_id = :tenant_id
               AND account_type_id = :account_type_id
             LIMIT 1'
        );
        $accountStmt->execute([
            ':user_id' => $user['user_id'],
            ':tenant_id' => $tenantId,
            ':account_type_id' => $staffTypeId,
        ]);
        $accountId = $accountStmt->fetchColumn();

        if ($accountId === false) {
            $accountId = newUuid($pdo);
            $insertAccount = $pdo->prepare(
                'INSERT INTO accounts
                    (account_id, user_id, tenant_id, account_type_id, accountable_type, accountable_id, is_primary)
                 VALUES
                    (:account_id, :user_id, :tenant_id, :account_type_id, :accountable_type, :accountable_id, 1)'
            );
            $insertAccount->execute([
                ':account_id' => $accountId,
                ':user_id' => $user['user_id'],
                ':tenant_id' => $tenantId,
                ':account_type_id' => $staffTypeId,
                ':accountable_type' => 'staff',
                ':accountable_id' => $user['user_id'],
            ]);
        }

        $roleId = $roleIds[roleIdentifierForLegacyRole($user['role'])] ?? null;
        if ($roleId === null) {
            continue;
        }

        $existingRoleStmt = $pdo->prepare(
            'SELECT account_role_id
             FROM account_roles
             WHERE account_id = :account_id
               AND role_id = :role_id
             LIMIT 1'
        );
        $existingRoleStmt->execute([
            ':account_id' => $accountId,
            ':role_id' => $roleId,
        ]);

        if ($existingRoleStmt->fetchColumn() !== false) {
            continue;
        }

        $insertRole = $pdo->prepare(
            'INSERT INTO account_roles
                (account_role_id, account_id, role_id, is_primary, approved_at)
             VALUES
                (:account_role_id, :account_id, :role_id, 1, NOW())'
        );
        $insertRole->execute([
            ':account_role_id' => newUuid($pdo),
            ':account_id' => $accountId,
            ':role_id' => $roleId,
        ]);
    }
}

if (!migrationTableExists($pdo, 'users')) {
    throw new RuntimeException('Expected users table to exist before applying SaaS auth migration.');
}

addColumnIfMissing($pdo, 'users', 'email', 'VARCHAR(255) NULL AFTER username');
addColumnIfMissing($pdo, 'users', 'first_name', 'VARCHAR(100) NULL AFTER full_name');
addColumnIfMissing($pdo, 'users', 'last_name', 'VARCHAR(100) NULL AFTER first_name');
addColumnIfMissing($pdo, 'users', 'is_archived', 'TINYINT(1) NOT NULL DEFAULT 0 AFTER status');
addColumnIfMissing($pdo, 'users', 'is_deleted', 'TINYINT(1) NOT NULL DEFAULT 0 AFTER is_archived');
addColumnIfMissing($pdo, 'users', 'updated_at', 'TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP AFTER created_at');
addIndexIfMissing($pdo, 'users', 'idx_users_email', 'INDEX `idx_users_email` (`email`)');

$pdo->exec(
    'CREATE TABLE IF NOT EXISTS tenants (
        tenant_id CHAR(36) NOT NULL DEFAULT (uuid()),
        name VARCHAR(120) NOT NULL,
        slug VARCHAR(80) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT "active",
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        is_archived TINYINT(1) NOT NULL DEFAULT 0,
        is_deleted TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (tenant_id),
        UNIQUE KEY uniq_tenants_slug (slug)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci'
);

$pdo->exec(
    'CREATE TABLE IF NOT EXISTS tenant_domains (
        tenant_domain_id CHAR(36) NOT NULL DEFAULT (uuid()),
        tenant_id CHAR(36) NOT NULL,
        domain_name VARCHAR(255) NOT NULL,
        domain_type VARCHAR(50) NOT NULL DEFAULT "platform",
        is_primary TINYINT(1) NOT NULL DEFAULT 0,
        verification_status VARCHAR(50) NOT NULL DEFAULT "pending",
        ssl_status VARCHAR(50) NOT NULL DEFAULT "pending",
        target_type VARCHAR(100) NULL,
        target_id CHAR(36) NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        is_archived TINYINT(1) NOT NULL DEFAULT 0,
        is_deleted TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (tenant_domain_id),
        UNIQUE KEY uniq_tenant_domains_domain_name (domain_name),
        KEY idx_tenant_domains_tenant (tenant_id),
        CONSTRAINT fk_tenant_domains_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (tenant_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci'
);

$pdo->exec(
    'CREATE TABLE IF NOT EXISTS account_types (
        account_type_id CHAR(36) NOT NULL DEFAULT (uuid()),
        code VARCHAR(50) NOT NULL,
        name VARCHAR(80) NOT NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        is_archived TINYINT(1) NOT NULL DEFAULT 0,
        is_deleted TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (account_type_id),
        UNIQUE KEY uniq_account_types_code (code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci'
);

$pdo->exec(
    'CREATE TABLE IF NOT EXISTS roles (
        role_id CHAR(36) NOT NULL DEFAULT (uuid()),
        role_identifier VARCHAR(50) NOT NULL,
        name VARCHAR(80) NOT NULL,
        description TEXT NULL,
        is_system TINYINT(1) NOT NULL DEFAULT 0,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        is_archived TINYINT(1) NOT NULL DEFAULT 0,
        is_deleted TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (role_id),
        UNIQUE KEY uniq_roles_identifier (role_identifier)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci'
);

$pdo->exec(
    'CREATE TABLE IF NOT EXISTS accounts (
        account_id CHAR(36) NOT NULL DEFAULT (uuid()),
        user_id CHAR(36) NOT NULL,
        tenant_id CHAR(36) NOT NULL,
        account_type_id CHAR(36) NOT NULL,
        accountable_type VARCHAR(50) NOT NULL DEFAULT "",
        accountable_id CHAR(36) NULL,
        parent_account_id CHAR(36) NULL,
        is_primary TINYINT(1) NOT NULL DEFAULT 0,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        is_archived TINYINT(1) NOT NULL DEFAULT 0,
        is_deleted TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (account_id),
        UNIQUE KEY uniq_accounts_context (user_id, tenant_id, account_type_id, accountable_id),
        KEY idx_accounts_user (user_id),
        KEY idx_accounts_tenant (tenant_id),
        KEY idx_accounts_type (account_type_id),
        CONSTRAINT fk_accounts_user FOREIGN KEY (user_id) REFERENCES users (user_id),
        CONSTRAINT fk_accounts_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (tenant_id),
        CONSTRAINT fk_accounts_type FOREIGN KEY (account_type_id) REFERENCES account_types (account_type_id),
        CONSTRAINT fk_accounts_parent FOREIGN KEY (parent_account_id) REFERENCES accounts (account_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci'
);

$pdo->exec(
    'CREATE TABLE IF NOT EXISTS account_roles (
        account_role_id CHAR(36) NOT NULL DEFAULT (uuid()),
        account_id CHAR(36) NOT NULL,
        role_id CHAR(36) NOT NULL,
        granted_by_account_id CHAR(36) NULL,
        requested_by_id CHAR(36) NULL,
        approved_by_id CHAR(36) NULL,
        approved_at TIMESTAMP NULL DEFAULT NULL,
        denied_at TIMESTAMP NULL DEFAULT NULL,
        denied_reason TEXT NULL,
        expires_at TIMESTAMP NULL DEFAULT NULL,
        is_pending TINYINT(1) NOT NULL DEFAULT 0,
        is_primary TINYINT(1) NOT NULL DEFAULT 0,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        is_archived TINYINT(1) NOT NULL DEFAULT 0,
        is_deleted TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (account_role_id),
        UNIQUE KEY uniq_account_roles_account_role (account_id, role_id),
        KEY idx_account_roles_role (role_id),
        CONSTRAINT fk_account_roles_account FOREIGN KEY (account_id) REFERENCES accounts (account_id),
        CONSTRAINT fk_account_roles_role FOREIGN KEY (role_id) REFERENCES roles (role_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci'
);

$pdo->exec(
    'CREATE TABLE IF NOT EXISTS auth_sessions (
        auth_session_id CHAR(36) NOT NULL DEFAULT (uuid()),
        php_session_id VARCHAR(128) NOT NULL,
        user_id CHAR(36) NOT NULL,
        account_id CHAR(36) NULL,
        tenant_id CHAR(36) NULL,
        session_token_hash CHAR(64) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        ip_address VARCHAR(45) NULL,
        user_agent TEXT NULL,
        is_revoked TINYINT(1) NOT NULL DEFAULT 0,
        revoked_at TIMESTAMP NULL DEFAULT NULL,
        revoked_reason VARCHAR(100) NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        is_archived TINYINT(1) NOT NULL DEFAULT 0,
        is_deleted TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (auth_session_id),
        UNIQUE KEY uniq_auth_sessions_token_hash (session_token_hash),
        KEY idx_auth_sessions_php_session (php_session_id),
        KEY idx_auth_sessions_user (user_id),
        KEY idx_auth_sessions_account (account_id),
        KEY idx_auth_sessions_tenant (tenant_id),
        CONSTRAINT fk_auth_sessions_user FOREIGN KEY (user_id) REFERENCES users (user_id),
        CONSTRAINT fk_auth_sessions_account FOREIGN KEY (account_id) REFERENCES accounts (account_id),
        CONSTRAINT fk_auth_sessions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (tenant_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci'
);

$pdo->exec(
    'CREATE TABLE IF NOT EXISTS login_attempts (
        attempt_id CHAR(36) NOT NULL DEFAULT (uuid()),
        user_id CHAR(36) NULL,
        username VARCHAR(255) NOT NULL,
        ip_address VARCHAR(45) NOT NULL DEFAULT "",
        user_agent TEXT NULL,
        is_successful TINYINT(1) NOT NULL DEFAULT 0,
        failure_reason VARCHAR(100) NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        is_archived TINYINT(1) NOT NULL DEFAULT 0,
        is_deleted TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (attempt_id),
        KEY idx_login_attempts_user (user_id),
        KEY idx_login_attempts_username (username),
        KEY idx_login_attempts_ip (ip_address),
        KEY idx_login_attempts_created (created_at),
        CONSTRAINT fk_login_attempts_user FOREIGN KEY (user_id) REFERENCES users (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci'
);

$tenantId = ensureTenant($pdo);

$domainStmt = $pdo->prepare(
    'INSERT IGNORE INTO tenant_domains
        (tenant_domain_id, tenant_id, domain_name, domain_type, is_primary, verification_status, ssl_status, target_type, target_id)
     VALUES
        (:tenant_domain_id, :tenant_id, :domain_name, "platform", 1, "verified", "active", "tenant", :target_id)'
);
$domainStmt->execute([
    ':tenant_domain_id' => newUuid($pdo),
    ':tenant_id' => $tenantId,
    ':domain_name' => 'localhost',
    ':target_id' => $tenantId,
]);

$staffTypeId = ensureAccountType($pdo, 'staff', 'Staff');
ensureAccountType($pdo, 'customer', 'Customer');
ensureAccountType($pdo, 'vendor', 'Vendor');
ensureAccountType($pdo, 'contractor', 'Contractor');

$roleIds = [
    'ro-admin' => ensureRole($pdo, 'ro-admin', 'Admin', 'Full pharmacy administration access.'),
    'ro-sales-clerk' => ensureRole($pdo, 'ro-sales-clerk', 'Sales Clerk', 'Sales clerk pharmacy counter access.'),
    'ro-cashier' => ensureRole($pdo, 'ro-cashier', 'Cashier', 'Cashier point-of-sale access.'),
];

seedCurrentUsers($pdo, $tenantId, $staffTypeId, $roleIds);

echo "SaaS accounts/auth/domains migration completed.\n";

?>
