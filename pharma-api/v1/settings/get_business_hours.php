<?php
$allowedRoles = [
    'super_admin', 'admin', 'manager', 'supervisor', 'cashier', 'salesclerk',
    'Admin', 'Manager', 'Supervisor', 'Cashier', 'Sales Clerk',
    'ro-super-admin', 'ro-admin', 'ro-manager', 'ro-supervisor',
    'ro-cashier', 'ro-sales-clerk', 'ro_sales_clerk',
];
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once __DIR__ . '/settings_helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Only GET requests are allowed.']);
    exit();
}

try {
    $month = $_GET['month'] ?? date('Y-m');
    if (!is_string($month) || !preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $month)) {
        $month = date('Y-m');
    }
    $systemSettings = fetchSystemSettings($pdo);
    $exceptions = fetchBusinessHourExceptions($pdo, $month);
    foreach ($exceptions as &$exception) {
        unset($exception['createdBy'], $exception['createdAt'], $exception['updatedAt']);
    }
    unset($exception);

    echo json_encode([
        'status' => 'success',
        'profile' => [
            'address' => $systemSettings['address'] ?? '',
            'contactNumber' => $systemSettings['contactNumber'] ?? '',
        ],
        'businessSchedule' => fetchBusinessHours($pdo),
        'businessExceptions' => $exceptions,
    ]);
} catch (Throwable $error) {
    error_log('Unable to load shared business hours: ' . $error->getMessage());
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Unable to load business hours.',
    ]);
}
?>
