<?php

// CLI-only smoke harness for the authenticated reporting endpoint.
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$category = $argv[1] ?? 'overview';
$role = $argv[2] ?? 'admin';
$userId = $argv[3] ?? '';
$token = 'reports-smoke-token';

$sessionPath = __DIR__ . '/.sessions';
if (!is_dir($sessionPath)) {
    mkdir($sessionPath, 0777, true);
}
session_save_path($sessionPath);
session_id('reports-smoke-' . preg_replace('/[^a-z0-9]/i', '', $category . $role));
$smokeSessionId = session_id();
register_shutdown_function(static function () use ($sessionPath, $smokeSessionId): void {
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_write_close();
    }
    @unlink($sessionPath . '/sess_' . $smokeSessionId);
    @rmdir($sessionPath);
});
session_start();
$_SESSION = [
    'user_id' => $userId,
    'username' => 'reports_smoke',
    'full_name' => 'Reports Smoke Test',
    'role' => $role,
    'roles' => [$role],
    'role_identifiers' => [],
    'tab_token_hash' => hash('sha256', $token),
];
session_write_close();

$_SERVER['REQUEST_METHOD'] = 'GET';
$_SERVER['HTTP_X_TAB_TOKEN'] = $token;
$_GET = [
    'category' => $category,
    'start_date' => '2020-01-01',
    'end_date' => date('Y-m-d'),
    'page' => 1,
    'page_size' => 20,
];
if (!empty($argv[4])) {
    parse_str((string) $argv[4], $extraFilters);
    $_GET = array_merge($_GET, $extraFilters);
}

chdir(__DIR__ . '/../pharma-api/v1/reports');
require __DIR__ . '/../pharma-api/v1/reports/get_report.php';

if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}
@unlink($sessionPath . '/sess_' . $smokeSessionId);
@rmdir($sessionPath);
