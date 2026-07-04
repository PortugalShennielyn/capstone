<?php
require_once '../../config/db_connection.php';
require_once '../../config/auth_context.php';

requireValidSession($pdo);

$stmt = $pdo->prepare(
    'SELECT username, email, full_name, first_name, last_name, role, status
     FROM users
     WHERE user_id = :user_id
     LIMIT 1'
);
$stmt->execute([':user_id' => $_SESSION['user_id']]);
$user = $stmt->fetch();

if ($user) {
    $_SESSION['username'] = $user['username'];
    $_SESSION['email'] = $user['email'];
    $_SESSION['full_name'] = $user['full_name'];
    $_SESSION['first_name'] = $user['first_name'];
    $_SESSION['last_name'] = $user['last_name'];
    $_SESSION['role'] = $user['role'];
    $_SESSION['user_status'] = $user['status'];

    $accountContext = loadPrimaryAccountContext($pdo, $_SESSION['user_id'], $user['role']);
    $_SESSION['roles'] = $accountContext['roles'];
    $_SESSION['role_identifiers'] = $accountContext['role_identifiers'];
    $_SESSION['account_id'] = $accountContext['account_id'];
    $_SESSION['account_type'] = $accountContext['account_type'];
    $_SESSION['tenant_id'] = $accountContext['tenant_id'];
    $_SESSION['tenant_name'] = $accountContext['tenant_name'];
    $_SESSION['tenant_slug'] = $accountContext['tenant_slug'];
    $_SESSION['primary_domain'] = $accountContext['primary_domain'];
} else {
    sendUnauthorizedResponse();
}

if (tableExists($pdo, 'auth_sessions') && !empty($_SESSION['auth_session_id'])) {
    $sessionStmt = $pdo->prepare(
        'SELECT auth_session_id, created_at, expires_at, is_revoked
         FROM auth_sessions
         WHERE auth_session_id = :auth_session_id
           AND user_id = :user_id
         LIMIT 1'
    );
    $sessionStmt->execute([
        ':auth_session_id' => $_SESSION['auth_session_id'],
        ':user_id' => $_SESSION['user_id'],
    ]);
    $authSession = $sessionStmt->fetch();

    if ($authSession) {
        $_SESSION['auth_session_created_at'] = $authSession['created_at'];
        $_SESSION['auth_session_expires_at'] = $authSession['expires_at'];
        $_SESSION['auth_session_is_revoked'] = (bool) $authSession['is_revoked'];
    }
}

http_response_code(200);
echo json_encode(array_merge(['status' => 'success'], currentSessionPayload()));
?>
