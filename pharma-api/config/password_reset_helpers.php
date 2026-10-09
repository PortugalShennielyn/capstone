<?php
require_once __DIR__ . '/id_helpers.php';
require_once __DIR__ . '/mailer.php';

function ensurePasswordResetTable(PDO $pdo): void
{
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS password_resets (
            reset_id CHAR(36) NOT NULL,
            user_id VARCHAR(100) NOT NULL,
            email VARCHAR(255) NOT NULL,
            code_hash VARCHAR(255) NOT NULL,
            attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
            expires_at DATETIME NOT NULL,
            used_at DATETIME NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (reset_id),
            KEY idx_password_resets_email (email),
            KEY idx_password_resets_user_id (user_id),
            KEY idx_password_resets_expires_at (expires_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"
    );
}

function passwordResetIdColumn(PDO $pdo): string
{
    $stmt = $pdo->prepare(
        'SELECT COLUMN_NAME
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = "password_resets"
           AND COLUMN_NAME IN ("reset_id", "id")
         ORDER BY FIELD(COLUMN_NAME, "reset_id", "id")
         LIMIT 1'
    );
    $stmt->execute();
    $column = $stmt->fetchColumn();
    if (!in_array($column, ['reset_id', 'id'], true)) {
        throw new RuntimeException('The password reset table has no supported identifier column.');
    }
    return (string) $column;
}

function passwordResetTableExists(PDO $pdo, string $table): bool
{
    $stmt = $pdo->prepare(
        'SELECT COUNT(*)
         FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table'
    );
    $stmt->execute([':table' => $table]);
    return (int) $stmt->fetchColumn() > 0;
}

function generateVerificationCode(): string
{
    return str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
}

function createPasswordReset(PDO $pdo, string $userId, string $email, string $code): string
{
    $idColumn = passwordResetIdColumn($pdo);

    $pdo->prepare(
        'UPDATE password_resets
         SET used_at = NOW()
         WHERE user_id = :user_id AND used_at IS NULL'
    )->execute([':user_id' => $userId]);

    $resetId = $idColumn === 'reset_id' ? newUuid($pdo) : null;
    $idSql = $resetId === null ? '' : 'reset_id, ';
    $valueSql = $resetId === null ? '' : ':reset_id, ';
    $stmt = $pdo->prepare(
        "INSERT INTO password_resets
            ({$idSql}user_id, email, code_hash, expires_at)
         VALUES
            ({$valueSql}:user_id, :email, :code_hash, DATE_ADD(NOW(), INTERVAL 10 MINUTE))"
    );
    $params = [
        ':user_id'   => $userId,
        ':email'     => strtolower($email),
        ':code_hash' => password_hash($code, PASSWORD_DEFAULT),
    ];
    if ($resetId !== null) {
        $params[':reset_id'] = $resetId;
    }
    $stmt->execute($params);

    return $resetId ?? (string) $pdo->lastInsertId();
}

function verifyPasswordReset(PDO $pdo, string $email, string $code): ?array
{
    $idColumn = passwordResetIdColumn($pdo);
    $lockSql = $pdo->inTransaction() ? ' FOR UPDATE' : '';
    $stmt = $pdo->prepare(
        "SELECT {$idColumn} AS reset_id, user_id, code_hash, attempts, expires_at
         FROM password_resets
         WHERE LOWER(email) = LOWER(:email)
           AND used_at IS NULL
           AND expires_at > NOW()
         ORDER BY created_at DESC
         LIMIT 1{$lockSql}"
    );
    $stmt->execute([':email' => $email]);
    $row = $stmt->fetch();
    if (!$row) return null;

    if ((int) $row['attempts'] >= 5) return null;

    if (!password_verify($code, $row['code_hash'])) {
        $pdo->prepare(
            "UPDATE password_resets SET attempts = attempts + 1
             WHERE {$idColumn} = :reset_id"
        )->execute([':reset_id' => $row['reset_id']]);
        return null;
    }

    return $row;
}

function consumePasswordReset(PDO $pdo, string $resetId): void
{
    $idColumn = passwordResetIdColumn($pdo);
    $pdo->prepare(
        "UPDATE password_resets SET used_at = NOW() WHERE {$idColumn} = :reset_id"
    )->execute([':reset_id' => $resetId]);
}