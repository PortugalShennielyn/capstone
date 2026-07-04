<?php

require_once __DIR__ . '/../pharma-api/config/db_connection.php';
require_once __DIR__ . '/../pharma-api/config/auth_context.php';

header('Content-Type: text/html; charset=UTF-8');
preventProtectedPageCache();

function redirectToLoginPage(): void
{
    header('Location: login.php');
    exit();
}

if (!isset($_SESSION['user_id'], $_SESSION['role'])) {
    redirectToLoginPage();
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
        redirectToLoginPage();
    }

    if (!empty($authSession['expires_at']) && strtotime((string) $authSession['expires_at']) <= time()) {
        redirectToLoginPage();
    }
}

?>
