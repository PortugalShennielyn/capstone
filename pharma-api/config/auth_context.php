<?php

require_once __DIR__ . '/id_helpers.php';
require_once __DIR__ . '/rbac.php';
require_once __DIR__ . '/audit_log.php';

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

function maskedAuthIdentifier(?string $value): string
{
    return empty($value) ? 'none' : substr(hash('sha256', $value), 0, 12);
}

function authDiagnosticLog(string $event, array $context = []): void
{
    $safeContext = array_merge([
        'session' => maskedAuthIdentifier(session_id()),
        'user' => maskedAuthIdentifier((string) ($_SESSION['user_id'] ?? '')),
        'file' => basename((string) ($_SERVER['SCRIPT_FILENAME'] ?? 'unknown')),
    ], $context);

    $pairs = [];
    foreach ($safeContext as $key => $value) {
        $pairs[] = preg_replace('/[^a-z0-9_-]/i', '', (string) $key)
            . '=' . str_replace(["\r", "\n"], '', (string) $value);
    }
    error_log('[AUTH] ' . $event . ' ' . implode(' ', $pairs));
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

function auditAuthenticationEvent(PDO $pdo, string $action, array $context = []): void
{
    $actorAuthenticated = !array_key_exists('actor_authenticated', $context) || (bool) $context['actor_authenticated'];
    recordAuditLog($pdo, [
        'module' => 'Authentication',
        'action' => $action,
        'success' => $context['success'] ?? true,
        'event_status' => $context['event_status'] ?? null,
        'actor_authenticated' => $actorAuthenticated,
        'user_id' => $actorAuthenticated ? ($context['user_id'] ?? ($_SESSION['user_id'] ?? null)) : null,
        'employee_id' => $actorAuthenticated ? ($context['employee_id'] ?? null) : null,
        'user_name' => $actorAuthenticated ? ($context['user_name'] ?? auditCurrentUserName()) : 'Unauthenticated',
        'role' => $actorAuthenticated ? ($context['role'] ?? ($_SESSION['role'] ?? null)) : null,
        'auth_session_id' => $actorAuthenticated ? ($context['auth_session_id'] ?? ($_SESSION['auth_session_id'] ?? null)) : null,
        'details' => $context['details'] ?? null,
        'idempotency_key' => $context['idempotency_key'] ?? null,
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
        'supervisor' => 'ro-supervisor',
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

function loadAuthSessionByPresentedToken(PDO $pdo): ?array
{
    $token = requestTabToken();
    if ($token === '') {
        return null;
    }

    $stmt = $pdo->prepare(
        'SELECT auth_session_id, user_id, account_id, tenant_id, created_at, expires_at,
                is_revoked, is_active, is_deleted, (expires_at <= NOW()) AS is_expired
         FROM auth_sessions
         WHERE session_token_hash = :session_token_hash
         LIMIT 1'
    );
    $stmt->execute([':session_token_hash' => hash('sha256', $token)]);
    $authSession = $stmt->fetch();
    return $authSession ?: null;
}

function hydrateSessionFromAuthRecord(PDO $pdo, array $authSession): bool
{
    $stmt = $pdo->prepare(
        'SELECT user_id, username, email, contact_number, role, status, full_name, first_name, last_name
         FROM users
         WHERE user_id = :user_id
           AND status = "Active"
           AND COALESCE(is_deleted, 0) = 0
         LIMIT 1'
    );
    $stmt->execute([':user_id' => $authSession['user_id']]);
    $user = $stmt->fetch();
    if (!$user) {
        return false;
    }

    $accountContext = loadPrimaryAccountContext($pdo, (string) $user['user_id'], (string) $user['role']);
    $_SESSION['user_id'] = $user['user_id'];
    $_SESSION['username'] = $user['username'];
    $_SESSION['email'] = $user['email'];
    $_SESSION['contact_number'] = $user['contact_number'];
    $_SESSION['role'] = $user['role'];
    $_SESSION['user_status'] = $user['status'];
    $_SESSION['full_name'] = $user['full_name'];
    $_SESSION['first_name'] = $user['first_name'];
    $_SESSION['last_name'] = $user['last_name'];
    // The Admin-managed users.role column is authoritative for this account.
    // Linked account_roles may be stale and must not override that assignment.
    $assignedRole = strtolower(trim((string) $user['role']));
    $_SESSION['roles'] = [$assignedRole];
    $_SESSION['role_identifiers'] = [legacyRoleIdentifier($assignedRole)];
    $_SESSION['account_id'] = $accountContext['account_id'];
    $_SESSION['account_type'] = $accountContext['account_type'];
    $_SESSION['tenant_id'] = $accountContext['tenant_id'];
    $_SESSION['tenant_name'] = $accountContext['tenant_name'];
    $_SESSION['tenant_slug'] = $accountContext['tenant_slug'];
    $_SESSION['primary_domain'] = $accountContext['primary_domain'];
    $_SESSION['auth_session_id'] = $authSession['auth_session_id'];
    $_SESSION['auth_session_created_at'] = $authSession['created_at'];
    $_SESSION['auth_session_expires_at'] = $authSession['expires_at'];
    $_SESSION['auth_session_is_revoked'] = (bool) $authSession['is_revoked'];
    $_SESSION['tab_token_hash'] = hash('sha256', requestTabToken());
    return true;
}

function clearCurrentPhpSessionCookie(): void
{
    $params = session_get_cookie_params();
    setcookie(session_name(), '', time() - 42000, $params['path'] ?: '/', $params['domain'] ?? '', $params['secure'] ?? false, $params['httponly'] ?? false);
}

function revokeCurrentAuthSession(PDO $pdo, string $reason = 'logout'): void
{
    if (!tableExists($pdo, 'auth_sessions')) {
        return;
    }

    $presentedToken = requestTabToken();
    if ($presentedToken === '' && empty($_SESSION['auth_session_id'])) {
        return;
    }

    $authSessionId = trim((string) ($_SESSION['auth_session_id'] ?? ''));
    if ($authSessionId === '' && $presentedToken !== '') {
        $loaded = loadAuthSessionByPresentedToken($pdo);
        $authSessionId = trim((string) ($loaded['auth_session_id'] ?? ''));
        if ($loaded && empty($_SESSION['user_id'])) {
            hydrateSessionFromAuthRecord($pdo, $loaded);
        }
    }
    $auditAction = match (strtolower(trim($reason))) {
        'timeout', 'session_timeout', 'inactivity' => 'SESSION_TIMEOUT',
        'expired', 'session_expired' => 'SESSION_EXPIRED',
        'revoked', 'admin_revoked', 'session_revoked' => 'SESSION_REVOKED',
        default => 'LOGOUT',
    };
    auditAuthenticationEvent($pdo, $auditAction, [
        'auth_session_id' => $authSessionId,
        'details' => $auditAction === 'LOGOUT' ? 'User logged out' : $reason,
        'idempotency_key' => $authSessionId !== '' ? $authSessionId . ':' . $auditAction : null,
    ]);

    if ($presentedToken !== '') {
        $stmt = $pdo->prepare(
            'UPDATE auth_sessions
             SET is_revoked = 1, revoked_at = NOW(), revoked_reason = :reason,
                 is_active = 0, updated_at = NOW()
             WHERE session_token_hash = :session_token_hash'
        );
        $stmt->execute([
            ':reason' => $reason,
            ':session_token_hash' => hash('sha256', $presentedToken),
        ]);
    } else {
        $stmt = $pdo->prepare(
            'UPDATE auth_sessions
             SET is_revoked = 1, revoked_at = NOW(), revoked_reason = :reason,
                 is_active = 0, updated_at = NOW()
             WHERE auth_session_id = :auth_session_id'
        );
        $stmt->execute([
            ':reason' => $reason,
            ':auth_session_id' => $_SESSION['auth_session_id'],
        ]);
    }
    authDiagnosticLog('Logout requested', [
        'function' => __FUNCTION__,
        'auth_session' => maskedAuthIdentifier((string) ($_SESSION['auth_session_id'] ?? '')),
        'reason' => $reason,
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
    global $pdo;
    if ($pdo instanceof PDO) {
        auditAuthenticationEvent($pdo, 'ACCESS_DENIED', [
            'success' => false,
            'event_status' => 'Denied',
            'actor_authenticated' => false,
            'details' => 'Unauthenticated request denied: ' . basename((string) ($_SERVER['SCRIPT_NAME'] ?? 'unknown')),
            'idempotency_key' => auditRequestId() . ':ACCESS_DENIED',
        ]);
    }
    authDiagnosticLog('401 returned', ['function' => __FUNCTION__, 'reason' => $message]);
    http_response_code(401);
    echo json_encode([
        'success' => false,
        'status' => 'error',
        'message' => $message,
    ]);
    exit();
}

function sendForbiddenResponse(string $message = 'Access denied.'): void
{
    global $pdo;
    if ($pdo instanceof PDO) {
        auditAuthenticationEvent($pdo, 'ACCESS_DENIED', [
            'success' => false,
            'event_status' => 'Denied',
            'actor_authenticated' => !empty($_SESSION['user_id']),
            'details' => 'Access denied: ' . basename((string) ($_SERVER['SCRIPT_NAME'] ?? 'unknown')),
            'idempotency_key' => auditRequestId() . ':ACCESS_DENIED',
        ]);
    }
    http_response_code(403);
    echo json_encode([
        'success' => false,
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

    // A restricted first-login session never carries a normal tab token. Keep
    // every endpoint using this shared guard closed until password completion.
    if (!empty($_SESSION['restricted_password_change_user_id'])) {
        sendForbiddenResponse('A password change is required before accessing the system.');
    }

    try {
        if (tableExists($pdo, 'auth_sessions')) {
            $authSession = loadAuthSessionByPresentedToken($pdo);
            if (!$authSession) {
                sendUnauthorizedResponse('This tab is not authenticated. Please sign in again.');
            }
            if ((int) $authSession['is_revoked'] === 1
                || (int) $authSession['is_active'] !== 1
                || (int) $authSession['is_deleted'] === 1) {
                auditAuthenticationEvent($pdo, 'SESSION_REVOKED', [
                    'actor_authenticated' => false,
                    'event_status' => 'Denied',
                    'success' => false,
                    'auth_session_id' => (string) ($authSession['auth_session_id'] ?? ''),
                    'user_id' => $authSession['user_id'] ?? null,
                    'details' => 'Session is revoked or inactive.',
                    'idempotency_key' => ($authSession['auth_session_id'] ?? '') . ':SESSION_REVOKED',
                ]);
                sendUnauthorizedResponse();
            }
            if ((int) ($authSession['is_expired'] ?? 0) === 1) {
                auditAuthenticationEvent($pdo, 'SESSION_EXPIRED', [
                    'actor_authenticated' => false,
                    'event_status' => 'Denied',
                    'success' => false,
                    'auth_session_id' => (string) ($authSession['auth_session_id'] ?? ''),
                    'user_id' => $authSession['user_id'] ?? null,
                    'details' => 'Session reached expires_at.',
                    'idempotency_key' => ($authSession['auth_session_id'] ?? '') . ':SESSION_EXPIRED',
                ]);
                sendUnauthorizedResponse('Session expired. Please sign in again.');
            }
            if (!hydrateSessionFromAuthRecord($pdo, $authSession)) {
                sendUnauthorizedResponse('Account is no longer active. Please sign in again.');
            }
        } else {
            if (!isset($_SESSION['user_id'], $_SESSION['role'])) {
                sendUnauthorizedResponse();
            }
            if (!tabTokenIsValid()) {
                sendUnauthorizedResponse('This tab is not authenticated. Please sign in again.');
            }
        }
    } catch (PDOException $error) {
        authDiagnosticLog('API error - session preserved', [
            'function' => __FUNCTION__,
            'error' => get_class($error),
        ]);
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'status' => 'error',
            'message' => 'Authentication service is temporarily unavailable. Please retry.',
        ]);
        exit();
    }

    // Also honor the database flag on every protected API request so stale or
    // manually-created sessions cannot bypass a newly-required password change.
    try {
        $columnCheck = $pdo->query("SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'must_change_password'");
        if ((int) $columnCheck->fetchColumn() > 0) {
            $requiredStmt = $pdo->prepare('SELECT must_change_password FROM users WHERE user_id = :user_id LIMIT 1');
            $requiredStmt->execute([':user_id' => $_SESSION['user_id']]);
            if ((int) $requiredStmt->fetchColumn() === 1) {
                sendForbiddenResponse('A password change is required before accessing the system.');
            }
        }
    } catch (PDOException $error) {
        http_response_code(500);
        echo json_encode(['success' => false, 'status' => 'error', 'message' => 'Authentication service is temporarily unavailable. Please retry.']);
        exit();
    }

    if (!currentSessionHasAnyRole($allowedRoles)) {
        sendForbiddenResponse();
    }

    enforceManagerApiBoundary();
    enforceSupervisorApiBoundary();
    enforceCashierApiBoundary();
    enforceSalesClerkApiBoundary();
    authDiagnosticLog('Session verified', [
        'function' => __FUNCTION__,
        'auth_session' => maskedAuthIdentifier((string) ($_SESSION['auth_session_id'] ?? '')),
    ]);
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
        'created_at' => $_SESSION['user_created_at'] ?? null,
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
