<?php

require_once __DIR__ . '/id_helpers.php';

function ensureAuditLogSchema(PDO $pdo): void
{
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS audit_logs (
            audit_id CHAR(36) NOT NULL PRIMARY KEY,
            user_id CHAR(36) NULL,
            employee_id VARCHAR(80) NULL,
            user_name VARCHAR(160) NULL,
            role VARCHAR(80) NULL,
            action VARCHAR(80) NOT NULL,
            module VARCHAR(80) NOT NULL DEFAULT 'Authentication',
            event_status VARCHAR(20) NOT NULL DEFAULT 'Success',
            description TEXT NULL,
            target_type VARCHAR(80) NULL,
            target_id VARCHAR(120) NULL,
            ip_address VARCHAR(80) NULL,
            user_agent TEXT NULL,
            session_reference VARCHAR(80) NULL,
            details TEXT NULL,
            idempotency_key VARCHAR(191) NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_audit_logs_idempotency (idempotency_key),
            KEY idx_audit_logs_created_at (created_at),
            KEY idx_audit_logs_module_action (module, action),
            KEY idx_audit_logs_user (user_id),
            KEY idx_audit_logs_target (target_type, target_id),
            KEY idx_audit_logs_session (session_reference)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );

    $columns = auditLogColumns($pdo);
    $addColumn = static function (string $name, string $definition) use ($pdo, &$columns): void {
        if (!isset($columns[$name])) {
            $pdo->exec("ALTER TABLE audit_logs ADD COLUMN {$name} {$definition}");
            $columns[$name] = true;
        }
    };
    $addColumn('employee_id', 'VARCHAR(80) NULL AFTER user_id');
    $addColumn('description', 'TEXT NULL AFTER event_status');
    $addColumn('target_type', 'VARCHAR(80) NULL AFTER description');
    $addColumn('target_id', 'VARCHAR(120) NULL AFTER target_type');
    auditEnsureIndex($pdo, 'idx_audit_logs_target', 'ALTER TABLE audit_logs ADD KEY idx_audit_logs_target (target_type, target_id)');
}

function auditLogColumns(PDO $pdo): array
{
    $stmt = $pdo->query('SHOW COLUMNS FROM audit_logs');
    $columns = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $column) {
        $columns[$column['Field']] = true;
    }
    return $columns;
}

function auditEnsureIndex(PDO $pdo, string $indexName, string $sql): void
{
    $stmt = $pdo->prepare(
        'SELECT COUNT(*)
         FROM INFORMATION_SCHEMA.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = "audit_logs"
           AND INDEX_NAME = :index_name'
    );
    $stmt->execute([':index_name' => $indexName]);
    if ((int) $stmt->fetchColumn() === 0) {
        $pdo->exec($sql);
    }
}

function auditClientIpAddress(): string
{
    if (function_exists('clientIpAddress')) {
        return clientIpAddress();
    }
    $forwardedFor = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? '';
    return $forwardedFor !== '' ? trim(explode(',', $forwardedFor)[0]) : ($_SERVER['REMOTE_ADDR'] ?? '');
}

function auditClientUserAgent(): string
{
    return function_exists('clientUserAgent') ? clientUserAgent() : ($_SERVER['HTTP_USER_AGENT'] ?? '');
}

function auditSessionReference(?string $sessionId): ?string
{
    $sessionId = trim((string) $sessionId);
    if ($sessionId === '') {
        return null;
    }
    return substr(hash('sha256', $sessionId), -12);
}

function auditCurrentUserName(): ?string
{
    foreach (['full_name', 'username', 'email'] as $key) {
        $value = trim((string) ($_SESSION[$key] ?? ''));
        if ($value !== '') {
            return $value;
        }
    }
    return null;
}

function auditCurrentEmployeeId(): ?string
{
    foreach (['employee_id', 'employee_number', 'user_code', 'username'] as $key) {
        $value = trim((string) ($_SESSION[$key] ?? ''));
        if ($value !== '') {
            return $value;
        }
    }
    return null;
}

function auditSanitizeText(?string $value): ?string
{
    $value = trim((string) $value);
    if ($value === '') {
        return null;
    }
    $blocked = ['password', 'password_hash', 'token', 'otp', 'secret', 'session_token_hash'];
    foreach ($blocked as $needle) {
        if (stripos($value, $needle) !== false) {
            $value = preg_replace('/(' . preg_quote($needle, '/') . ')\s*[:=]\s*[^,\s]+/i', '$1: [redacted]', $value);
        }
    }
    return $value;
}

function recordAuditLog(PDO $pdo, array $event): bool
{
    try {
        if (!$pdo->inTransaction()) {
            ensureAuditLogSchema($pdo);
        }
        $action = strtoupper(trim((string) ($event['action'] ?? '')));
        if ($action === '') {
            return false;
        }

        $module = trim((string) ($event['module'] ?? 'Authentication')) ?: 'Authentication';
        $sessionId = trim((string) ($event['session_id'] ?? $event['auth_session_id'] ?? ($_SESSION['auth_session_id'] ?? '')));
        $sessionReference = $event['session_reference'] ?? auditSessionReference($sessionId);
        $status = !empty($event['success']) || strcasecmp((string) ($event['event_status'] ?? ''), 'Success') === 0 ? 'Success' : 'Failure';
        $idempotencyKey = trim((string) ($event['idempotency_key'] ?? ''));
        if ($idempotencyKey === '' && $sessionId !== '' && !in_array($action, ['LOGIN_FAILED'], true)) {
            $idempotencyKey = $sessionId . ':' . $action;
        }

        $stmt = $pdo->prepare(
            'INSERT INTO audit_logs
                (audit_id, user_id, employee_id, user_name, role, action, module, event_status, description, target_type, target_id, ip_address, user_agent, session_reference, details, idempotency_key)
             VALUES
                (:audit_id, :user_id, :employee_id, :user_name, :role, :action, :module, :event_status, :description, :target_type, :target_id, :ip_address, :user_agent, :session_reference, :details, :idempotency_key)
             ON DUPLICATE KEY UPDATE audit_id = audit_id'
        );
        $description = auditSanitizeText($event['description'] ?? $event['details'] ?? null);
        $stmt->execute([
            ':audit_id' => newUuid($pdo),
            ':user_id' => $event['user_id'] ?? ($_SESSION['user_id'] ?? null),
            ':employee_id' => $event['employee_id'] ?? auditCurrentEmployeeId(),
            ':user_name' => $event['user_name'] ?? auditCurrentUserName(),
            ':role' => $event['role'] ?? ($_SESSION['role'] ?? null),
            ':action' => $action,
            ':module' => $module,
            ':event_status' => $status,
            ':description' => $description,
            ':target_type' => isset($event['target_type']) ? trim((string) $event['target_type']) : null,
            ':target_id' => $event['target_id'] ?? $event['reference_id'] ?? null,
            ':ip_address' => $event['ip_address'] ?? auditClientIpAddress(),
            ':user_agent' => $event['user_agent'] ?? auditClientUserAgent(),
            ':session_reference' => $sessionReference,
            ':details' => auditSanitizeText($event['details'] ?? $description),
            ':idempotency_key' => $idempotencyKey !== '' ? $idempotencyKey : null,
        ]);
        return true;
    } catch (Throwable $error) {
        error_log('Audit log write failed: ' . $error->getMessage());
        return false;
    }
}

function logAudit(PDO $pdo, array $event): bool
{
    return recordAuditLog($pdo, $event);
}

?>
