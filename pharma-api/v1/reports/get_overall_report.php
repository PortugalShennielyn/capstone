<?php
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once __DIR__ . '/reports_helpers.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Only GET requests are allowed.']);
    exit;
}

try {
    reportApplyConfiguredTimezone($pdo);
    $role = reportRoleContext();
    $f    = reportFilters();

    $categories = $role['available_categories'];
    $result = [
        'status'    => 'success',
        'generated' => date('Y-m-d H:i:s'),
        'access'    => $role,
        'system'    => reportSystem($pdo, $role, $f),
        'sections'  => [],
    ];

    foreach ($categories as $category) {
        try {
            $report = match ($category) {
                'sales'     => salesReport($pdo, $f, $role),
                'inventory' => inventoryReport($pdo, $f),
                'purchases' => !empty($role['supervisor'])
                                ? supervisorPurchaseRequestReport($pdo, $f)
                                : purchasesReport($pdo, $f),
                'expiry'    => expiryReport($pdo, $f),
                'products'  => !empty($role['supervisor'])
                                ? supervisorProductReport($pdo, $f, $role)
                                : productReport($pdo, $f, $role),
                'staff'     => staffReport($pdo, $f, $role),
                'overview'  => overviewReport($pdo, $f, $role),
                default     => null,
            };
            if ($report !== null) {
                $report['category'] = $category;
                $result['sections'][$category] = $report;
            }
        } catch (Throwable $sectionError) {
            error_log("[OVERALL_REPORT] section {$category} failed: " . $sectionError->getMessage());
            $result['sections'][$category] = [
                'category' => $category,
                'error'    => 'Unable to generate this section.',
            ];
        }
    }

    echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
} catch (Throwable $e) {
    error_log('Overall report error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to generate the overall report.']);
}