<?php
require_once '../../config/db_connection.php';
require_once '../../config/auth_context.php';

$usesDatabaseSessions = tableExists($pdo, 'auth_sessions') && requestTabToken() !== '';
revokeCurrentAuthSession($pdo);

// Database-backed tab sessions are independent even when tabs share PHP's
// cookie. Destroying that shared cookie here would sign other tabs out.
if (!$usesDatabaseSessions) {
    $_SESSION = [];
    session_destroy();
    clearCurrentPhpSessionCookie();
    authDiagnosticLog('Session destroyed', ['function' => 'logout']);
}

echo json_encode([
    'status' => 'success',
    'message' => 'Logged out successfully.'
]);
?>
