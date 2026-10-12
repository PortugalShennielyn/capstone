<?php
// 1. Project-wide PHP session configuration.
if (session_status() === PHP_SESSION_NONE) {
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    ini_set('session.cookie_httponly', '1');

    // Keep PHP's session store alive slightly longer than the restricted
    // first-login flow timeout, so ordinary requests do not GC it prematurely.
    ini_set('session.gc_maxlifetime', '1800');
    $requestScriptPath = str_replace('\\', '/', (string) ($_SERVER['SCRIPT_NAME'] ?? ''));
    $apiMarkerPosition = stripos($requestScriptPath, '/pharma-api/');
    $applicationPath = $apiMarkerPosition === false
        ? ''
        : rtrim(substr($requestScriptPath, 0, $apiMarkerPosition), '/');
    $sessionCookiePath = $applicationPath === '' ? '/' : $applicationPath . '/';

    session_set_cookie_params([
        'lifetime' => 0,
        'path' => $sessionCookiePath,
        'domain' => '',
        'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();

    $maskedSessionId = session_id() === '' ? 'none' : substr(hash('sha256', session_id()), 0, 12);
    error_log(sprintf(
        '[AUTH] Session started session=%s user=%s file=%s',
        $maskedSessionId,
        empty($_SESSION['user_id']) ? 'none' : substr(hash('sha256', (string) $_SESSION['user_id']), 0, 12),
        basename(__FILE__)
    ));
}

// 2. CORS API Headers
$allowedOrigins = [
    'http://127.0.0.1:5500',
    'http://127.0.0.1:5501',
    'http://localhost:5500',
    'http://localhost:5501',
    'http://127.0.0.1',
    'http://localhost'
];

$requestOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';

if (in_array($requestOrigin, $allowedOrigins, true)) {
    header("Access-Control-Allow-Origin: {$requestOrigin}");
    header("Access-Control-Allow-Credentials: true");
} else {
    header("Access-Control-Allow-Origin: *");
}

header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST, GET, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With, X-Tab-Token");

// Handle preflight OPTIONS requests from frontend Fetch clients
if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    http_response_code(200);
    exit();
}

// 3. Database Configuration Parameters
$host     = "127.0.0.1";
$db_name  = "pharma_db";
$username = "root";
$password = "";
$charset  = "utf8mb4";

$dsn = "mysql:host=$host;dbname=$db_name;charset=$charset";

$options = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
];

try {
    // Create global PDO connection instance
    $pdo = new PDO($dsn, $username, $password, $options);
    require_once __DIR__ . '/id_helpers.php';
} catch (\PDOException $e) {
    http_response_code(500);
    echo json_encode([
        "status" => "error",
        "message" => "Database connection failed: " . $e->getMessage()
    ]);
    exit();
}
?>
