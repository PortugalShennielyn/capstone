<?php

require_once __DIR__ . '/id_helpers.php';

function tableExists(PDO $pdo, string $table): bool
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

function clientIpAddress(): string
{
    $forwardedFor = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? '';
    if ($forwardedFor !== '') {
        return trim(explode(',', $forwardedFor)[0]);
    }

    return $_SERVER['REMOTE_ADDR'] ?? '';
}

function clientUserAgent(): string
{
    return $_SERVER['HTTP_USER_AGENT'] ?? '';
}

function recordLoginAttempt(PDO $pdo, string $username, ?string $userId, bool $success, ?string $failureReason): void
{
    if (!tableExists($pdo, 'login_attempts')) {
        return;
    }

    $stmt = $pdo->prepare(
        'INSERT INTO login_attempts
            (attempt_id, user_id, username, ip_address, user_agent, is_successful, failure_reason)
         VALUES
            (:attempt_id, :user_id, :username, :ip_address, :user_agent, :is_successful, :failure_reason)'
    );
    $stmt->execute([
        ':attempt_id' => newUuid($pdo),
        ':user_id' => $userId,
        ':username' => $username,
        ':ip_address' => clientIpAddress(),
        ':user_agent' => clientUserAgent(),
        ':is_successful' => $success ? 1 : 0,
        ':failure_reason' => $failureReason,
    ]);
}

function loginLockoutSecondsRemaining(PDO $pdo, string $username): int
{
    if (!tableExists($pdo, 'login_attempts')) {
        return 0;
    }

    $stmt = $pdo->prepare(
        'SELECT created_at
         FROM login_attempts
         WHERE username = :username
           AND ip_address = :ip_address
           AND is_successful = 0
           AND is_active = 1
           AND is_deleted = 0
           AND created_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)
         ORDER BY created_at DESC
         LIMIT 5'
    );
    $stmt->execute([
        ':username' => $username,
        ':ip_address' => clientIpAddress(),
    ]);
    $failures = $stmt->fetchAll();

    if (count($failures) < 5) {
        return 0;
    }

    $oldestOfFive = end($failures);
    $elapsedStmt = $pdo->prepare('SELECT TIMESTAMPDIFF(SECOND, :locked_at, NOW())');
    $elapsedStmt->execute([':locked_at' => $oldestOfFive['created_at']]);
    $elapsedSeconds = (int) $elapsedStmt->fetchColumn();

    return max(0, 300 - $elapsedSeconds);
}

function resetLoginAttempts(PDO $pdo, string $username): void
{
    if (!tableExists($pdo, 'login_attempts')) {
        return;
    }

    $stmt = $pdo->prepare(
        'UPDATE login_attempts
         SET is_active = 0,
             updated_at = NOW()
         WHERE username = :username
           AND ip_address = :ip_address
           AND is_successful = 0
           AND is_active = 1
           AND is_deleted = 0'
    );
    $stmt->execute([
        ':username' => $username,
        ':ip_address' => clientIpAddress(),
    ]);
}

function loadPrimaryAccountContext(PDO $pdo, string $userId, string $legacyRole): array
{
    $fallback = [
        'account_id' => null,
        'account_type' => 'staff',
        'tenant_id' => null,
        'tenant_name' => 'Dr. R Pharmacy',
        'tenant_slug' => 'dr-r-pharmacy',
        'primary_domain' => null,
        'roles' => [$legacyRole],
        'role_identifiers' => [legacyRoleIdentifier($legacyRole)],
    ];

    if (!tableExists($pdo, 'accounts')) {
        return $fallback;
    }

    $stmt = $pdo->prepare(
        'SELECT
            a.account_id,
            a.tenant_id,
            atype.code AS account_type,
            t.name AS tenant_name,
            t.slug AS tenant_slug,
            td.domain_name AS primary_domain
         FROM accounts a
         LEFT JOIN account_types atype ON atype.account_type_id = a.account_type_id
         LEFT JOIN tenants t ON t.tenant_id = a.tenant_id
         LEFT JOIN tenant_domains td ON td.tenant_id = a.tenant_id
            AND td.is_primary = 1
            AND td.is_active = 1
         WHERE a.user_id = :user_id
           AND a.is_active = 1
           AND a.is_deleted = 0
         ORDER BY a.is_primary DESC, a.created_at ASC
         LIMIT 1'
    );
    $stmt->execute([':user_id' => $userId]);
    $account = $stmt->fetch();

    if (!$account) {
        return $fallback;
    }

    $roleNames = [];
    $roleIdentifiers = [];

    if (tableExists($pdo, 'account_roles')) {
        $roleStmt = $pdo->prepare(
            'SELECT r.name, r.role_identifier
             FROM account_roles ar
             INNER JOIN roles r ON r.role_id = ar.role_id
             WHERE ar.account_id = :account_id
               AND ar.is_active = 1
               AND ar.is_pending = 0
               AND ar.is_deleted = 0
               AND r.is_active = 1
               AND r.is_deleted = 0
               AND (ar.expires_at IS NULL OR ar.expires_at > NOW())
             ORDER BY ar.is_primary DESC, r.name ASC'
        );
        $roleStmt->execute([':account_id' => $account['account_id']]);
        foreach ($roleStmt->fetchAll() as $role) {
            $roleNames[] = $role['name'];
            $roleIdentifiers[] = $role['role_identifier'];
        }
    }

    return [
        'account_id' => $account['account_id'],
        'account_type' => $account['account_type'] ?: 'staff',
        'tenant_id' => $account['tenant_id'],
        'tenant_name' => $account['tenant_name'] ?: 'Dr. R Pharmacy',
        'tenant_slug' => $account['tenant_slug'] ?: 'dr-r-pharmacy',
        'primary_domain' => $account['primary_domain'] ?: null,
        'roles' => $roleNames ?: [$legacyRole],
        'role_identifiers' => $roleIdentifiers ?: [legacyRoleIdentifier($legacyRole)],
    ];
}

function legacyRoleIdentifier(string $role): string
{
    $map = [
        'Admin' => 'ro-admin',
        'Sales Clerk' => 'ro-sales-clerk',
        'Cashier' => 'ro-cashier',
        'super_admin' => 'ro-super-admin',
        'admin' => 'ro-admin',
        'manager' => 'ro-manager',
        'cashier' => 'ro-cashier',
        'salesclerk' => 'ro-sales-clerk',
    ];

    return $map[$role] ?? strtolower('ro-' . preg_replace('/[^A-Za-z0-9]+/', '-', trim($role)));
}

function createAuthSession(PDO $pdo, string $userId, ?string $accountId, ?string $tenantId): ?string
{
    $sessionId = newUuid($pdo);
    $token = bin2hex(random_bytes(32));
    $_SESSION['tab_token_hash'] = hash('sha256', $token);
    $_SESSION['tab_token_created_at'] = date('Y-m-d H:i:s');

    if (!tableExists($pdo, 'auth_sessions')) {
        $_SESSION['auth_session_id'] = $sessionId;
        return $token;
    }

    $stmt = $pdo->prepare(
        'INSERT INTO auth_sessions
            (auth_session_id, php_session_id, user_id, account_id, tenant_id, session_token_hash, expires_at, ip_address, user_agent)
         VALUES
            (:auth_session_id, :php_session_id, :user_id, :account_id, :tenant_id, :session_token_hash, DATE_ADD(NOW(), INTERVAL 1 DAY), :ip_address, :user_agent)'
    );
    $stmt->execute([
        ':auth_session_id' => $sessionId,
        ':php_session_id' => session_id(),
        ':user_id' => $userId,
        ':account_id' => $accountId,
        ':tenant_id' => $tenantId,
        ':session_token_hash' => hash('sha256', $token),
        ':ip_address' => clientIpAddress(),
        ':user_agent' => clientUserAgent(),
    ]);

    $_SESSION['auth_session_id'] = $sessionId;
    return $token;
}

function requestTabToken(): string
{
    return trim((string) ($_SERVER['HTTP_X_TAB_TOKEN'] ?? ''));
}

function tabTokenIsValid(): bool
{
    $expectedHash = $_SESSION['tab_token_hash'] ?? '';
    $presentedToken = requestTabToken();

    return $expectedHash !== ''
        && $presentedToken !== ''
        && hash_equals($expectedHash, hash('sha256', $presentedToken));
}

function clearCurrentPhpSessionCookie(): void
{
    $params = session_get_cookie_params();
    setcookie(session_name(), '', time() - 42000, $params['path'] ?: '/', $params['domain'] ?? '', $params['secure'] ?? false, $params['httponly'] ?? false);
}

function revokeCurrentAuthSession(PDO $pdo, string $reason = 'logout'): void
{
    if (!tableExists($pdo, 'auth_sessions') || empty($_SESSION['auth_session_id'])) {
        return;
    }

    $stmt = $pdo->prepare(
        'UPDATE auth_sessions
         SET is_revoked = 1,
             revoked_at = NOW(),
             revoked_reason = :reason,
             is_active = 0,
             updated_at = NOW()
         WHERE auth_session_id = :auth_session_id'
    );
    $stmt->execute([
        ':reason' => $reason,
        ':auth_session_id' => $_SESSION['auth_session_id'],
    ]);
}

function preventProtectedPageCache(): void
{
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Cache-Control: post-check=0, pre-check=0', false);
    header('Pragma: no-cache');
    header('Expires: Thu, 01 Jan 1970 00:00:00 GMT');
}

function sendUnauthorizedResponse(string $message = 'Unauthorized'): void
{
    http_response_code(401);
    echo json_encode([
        'status' => 'error',
        'message' => $message,
    ]);
    exit();
}

function currentSessionHasAnyRole(array $allowedRoles): bool
{
    if (empty($allowedRoles)) {
        return true;
    }

    $sessionRoles = $_SESSION['roles'] ?? [];
    if (!is_array($sessionRoles)) {
        $sessionRoles = [];
    }

    $allRoles = array_merge([$_SESSION['role'] ?? ''], $sessionRoles, $_SESSION['role_identifiers'] ?? []);
    $normalizedRoles = array_map(
        static fn($role) => strtolower(trim((string) $role)),
        array_filter($allRoles, static fn($role) => trim((string) $role) !== '')
    );

    foreach ($allowedRoles as $role) {
        if (in_array(strtolower(trim((string) $role)), $normalizedRoles, true)) {
            return true;
        }
    }

    return false;
}

function requireValidSession(PDO $pdo, array $allowedRoles = []): void
{
    preventProtectedPageCache();

    if (!isset($_SESSION['user_id'], $_SESSION['role'])) {
        sendUnauthorizedResponse();
    }

    if (!tabTokenIsValid()) {
        sendUnauthorizedResponse('This tab is not authenticated. Please sign in again.');
    }

    if (tableExists($pdo, 'auth_sessions') && !empty($_SESSION['auth_session_id'])) {
        $stmt = $pdo->prepare(
            'SELECT expires_at, is_revoked, is_active
             FROM auth_sessions
             WHERE auth_session_id = :auth_session_id
               AND user_id = :user_id
             LIMIT 1'
        );
        $stmt->execute([
            ':auth_session_id' => $_SESSION['auth_session_id'],
            ':user_id' => $_SESSION['user_id'],
        ]);
        $authSession = $stmt->fetch();

        if (!$authSession || (int) $authSession['is_revoked'] === 1 || (int) $authSession['is_active'] !== 1) {
            sendUnauthorizedResponse();
        }

        if (!empty($authSession['expires_at']) && strtotime((string) $authSession['expires_at']) <= time()) {
            sendUnauthorizedResponse('Session expired. Please sign in again.');
        }

        $_SESSION['auth_session_expires_at'] = $authSession['expires_at'];
        $_SESSION['auth_session_is_revoked'] = (bool) $authSession['is_revoked'];
    }

    if (!currentSessionHasAnyRole($allowedRoles)) {
        http_response_code(403);
        echo json_encode([
            'status' => 'error',
            'message' => 'Forbidden',
        ]);
        exit();
    }
}

function currentSessionPayload(): array
{
    return [
        'user_id' => $_SESSION['user_id'] ?? '',
        'username' => $_SESSION['username'] ?? '',
        'email' => $_SESSION['email'] ?? null,
        'contact_number' => $_SESSION['contact_number'] ?? null,
        'full_name' => $_SESSION['full_name'] ?? '',
        'first_name' => $_SESSION['first_name'] ?? null,
        'last_name' => $_SESSION['last_name'] ?? null,
        'role' => $_SESSION['role'] ?? '',
        'user_status' => $_SESSION['user_status'] ?? null,
        'roles' => $_SESSION['roles'] ?? (isset($_SESSION['role']) ? [$_SESSION['role']] : []),
        'role_identifiers' => $_SESSION['role_identifiers'] ?? [],
        'account_id' => $_SESSION['account_id'] ?? null,
        'account_type' => $_SESSION['account_type'] ?? null,
        'tenant_id' => $_SESSION['tenant_id'] ?? null,
        'tenant_name' => $_SESSION['tenant_name'] ?? null,
        'tenant_slug' => $_SESSION['tenant_slug'] ?? null,
        'primary_domain' => $_SESSION['primary_domain'] ?? null,
        'auth_session_id' => $_SESSION['auth_session_id'] ?? null,
        'auth_session_created_at' => $_SESSION['auth_session_created_at'] ?? null,
        'auth_session_expires_at' => $_SESSION['auth_session_expires_at'] ?? null,
        'auth_session_is_revoked' => $_SESSION['auth_session_is_revoked'] ?? null,
    ];
}

?>
