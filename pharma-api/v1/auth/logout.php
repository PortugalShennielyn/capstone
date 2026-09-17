<?php
require_once '../../config/db_connection.php';
require_once '../../config/auth_context.php';

$usesDatabaseSessions = tableExists($pdo, 'auth_sessions') && requestTabToken() !== '';
$payload = json_decode(file_get_contents('php://input'), true);
$reason = is_array($payload) ? trim((string) ($payload['reason'] ?? 'logout')) : trim((string) ($_GET['reason'] ?? 'logout'));
if (!in_array($reason, ['logout', 'timeout', 'expired', 'revoked'], true)) {
    $reason = 'logout';
}
revokeCurrentAuthSession($pdo, $reason);

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
