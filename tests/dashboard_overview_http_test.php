<?php
declare(strict_types=1);

require_once __DIR__ . '/../pharma-api/config/db_connection.php';

function dashboardAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

function dashboardGet(string $path, string $sessionId, string $token): array
{
    $curl = curl_init('http://127.0.0.1/PharmacySystem_for_DocR/pharma-api/v1/' . $path);
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_COOKIE => 'PHPSESSID=' . $sessionId,
        CURLOPT_HTTPHEADER => ['Accept: application/json', 'X-Tab-Token: ' . $token],
        CURLOPT_TIMEOUT => 20,
    ]);
    $body = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $error = curl_error($curl);
    curl_close($curl);
    dashboardAssert($body !== false, 'HTTP failure: ' . $error);
    return ['status' => $status, 'body' => json_decode((string) $body, true) ?: []];
}

$user = $pdo->query("SELECT user_id, username, full_name, role, status FROM users WHERE role = 'admin' AND status = 'Active' LIMIT 1")->fetch(PDO::FETCH_ASSOC);
dashboardAssert((bool) $user, 'An active admin fixture is required.');

$dashboardHtml = file_get_contents(__DIR__ . '/../pharma-frontend/dashboard.html');
dashboardAssert($dashboardHtml !== false, 'Dashboard HTML could not be read.');
dashboardAssert(!str_contains($dashboardHtml, '<section class="content-panel dashboard-quick-actions"'), 'Quick Actions still renders in the dashboard overview.');
dashboardAssert(substr_count($dashboardHtml, 'class="stat-card performance-card"') === 5, 'Business Overview must render exactly five KPI cards.');
dashboardAssert(strpos($dashboardHtml, 'Needs Attention') < strpos($dashboardHtml, 'Sales Analytics'), 'Needs Attention must remain above Sales Analytics.');
dashboardAssert(str_contains($dashboardHtml, '.dashboard-report-scroll {') && str_contains($dashboardHtml, 'overflow-x: auto;'), 'Sales Analytics horizontal overflow was removed.');
dashboardAssert(str_contains($dashboardHtml, '.dashboard-report-scroll::-webkit-scrollbar'), 'The hidden analytics scrollbar rule was removed.');
dashboardAssert(str_contains($dashboardHtml, 'id="dashboardWelcomeTitle" class="dashboard-user-name">Welcome, <span class="manager-name">Jeham Aragase!</span></h1>'), 'The exact dashboard welcome heading is missing.');
dashboardAssert(str_contains($dashboardHtml, 'id="dashboardSalesClerkButton" href="sales_clerk_pos.html"') && str_contains($dashboardHtml, 'id="dashboardPosButton" href="cashier_pos.html"'), 'The Sales Clerk and POS shortcuts must point to their distinct existing routes.');
dashboardAssert(is_file(__DIR__ . '/../pharma-frontend/sales_clerk_pos.html') && is_file(__DIR__ . '/../pharma-frontend/cashier_pos.html'), 'One or both POS shortcut route files do not exist.');
dashboardAssert(!str_contains($dashboardHtml, 'nameElement.textContent = displayName;'), 'Runtime identity code can still overwrite the exact welcome heading.');
dashboardAssert(str_contains($dashboardHtml, 'class="stats-grid performance-strip"'), 'Performance Today is not rendered as one KPI strip.');
$analyticsViewportStart = strpos($dashboardHtml, '<div class="dashboard-report-scroll"');
$analyticsViewportEnd = strpos($dashboardHtml, '</section>', $analyticsViewportStart);
$inventoryStart = strpos($dashboardHtml, '<section class="dashboard-section" aria-labelledby="inventoryOverviewTitle">');
dashboardAssert($analyticsViewportStart !== false && $analyticsViewportEnd !== false && $inventoryStart !== false && $analyticsViewportEnd < $inventoryStart, 'Operational dashboard sections are still nested inside the Sales Analytics drag viewport.');
dashboardAssert(str_contains($dashboardHtml, 'surface.addEventListener("pointermove"') && str_contains($dashboardHtml, 'surface.scrollLeft = startScrollLeft - distance'), 'Sales Analytics mouse drag behavior is missing.');
dashboardAssert(str_contains($dashboardHtml, 'analytics-trend-card') && str_contains($dashboardHtml, 'analytics-weekly-card'), 'Sales & Purchase or Weekly Sales is missing.');
dashboardAssert(str_contains($dashboardHtml, 'grid-template-columns: 700px 350px 315px 390px 400px;') && str_contains($dashboardHtml, 'height: 332px;'), 'Sales Analytics does not use the requested five-card sizing system.');
dashboardAssert(str_contains($dashboardHtml, 'type: "doughnut"'), 'Category or inventory donut chart configuration is missing.');
dashboardAssert(str_contains($dashboardHtml, '.slice(0, 10)'), 'Top Selling Products does not support up to ten records.');
dashboardAssert(str_contains($dashboardHtml, 'class="top-product-ranking"') && !str_contains($dashboardHtml, '<span class="top-product-fill"'), 'Top Selling Products is not a ranked quantity-only list.');
dashboardAssert(str_contains($dashboardHtml, 'renderExpiryOverview(data.expiry_status_overview') && !str_contains($dashboardHtml, 'renderRingOverview("expiryStatusOverview"'), 'Expiry overview must use compact status chips instead of a donut.');
dashboardAssert(str_contains($dashboardHtml, 'next-expiry-card') && str_contains($dashboardHtml, 'class="risk-support-stack"'), 'Expiry and risk cards are not using the requested dominant-left composition.');
dashboardAssert(str_contains($dashboardHtml, 'id="inventoryStatusMeters"') && str_contains($dashboardHtml, 'id="dashboardInventoryCategoryCanvas"') && str_contains($dashboardHtml, 'id="stockAlertsList"'), 'The new inventory report composition is incomplete.');
dashboardAssert(!str_contains($dashboardHtml, 'Supplier Issue Summary') && !str_contains($dashboardHtml, 'supplierIssuesList'), 'Supplier Issue Summary was not removed.');
dashboardAssert(str_contains($dashboardHtml, 'id="dashboardGlobalPeriod"') && !str_contains($dashboardHtml, 'class="analytics-filter'), 'The dashboard must use one global period selector.');
dashboardAssert(str_contains($dashboardHtml, 'id="recentTransactionsList"') && str_contains($dashboardHtml, 'data-transaction-filter="cashier"'), 'Recent transaction tabs are missing.');
dashboardAssert(str_contains($dashboardHtml, 'data-alert-tone=') && str_contains($dashboardHtml, 'alert-item[data-alert-tone="purple"]'), 'Needs Attention cards do not have independent semantic colors.');

if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
$phpSessionId = 'codexdashboard' . bin2hex(random_bytes(10));
$tabToken = bin2hex(random_bytes(32));
$authSessionId = newUuid($pdo);
session_id($phpSessionId);
session_start();
$_SESSION = [
    'user_id' => $user['user_id'], 'username' => $user['username'], 'full_name' => $user['full_name'],
    'role' => $user['role'], 'roles' => [$user['role']], 'role_identifiers' => ['ro-admin'],
    'user_status' => $user['status'], 'auth_session_id' => $authSessionId,
    'tab_token_hash' => hash('sha256', $tabToken),
];
session_write_close();

$pdo->prepare("INSERT INTO auth_sessions
    (auth_session_id, php_session_id, user_id, session_token_hash, expires_at, ip_address, user_agent)
    VALUES (:id, :php, :user, :token, DATE_ADD(NOW(), INTERVAL 10 MINUTE), '127.0.0.1', 'Codex dashboard overview test')")
    ->execute([':id' => $authSessionId, ':php' => $phpSessionId, ':user' => $user['user_id'], ':token' => hash('sha256', $tabToken)]);

try {
    $summaryResponse = dashboardGet('dashboard/get_dashboard_summary.php?preset=last_7_days', $phpSessionId, $tabToken);
    dashboardAssert($summaryResponse['status'] === 200, 'Dashboard summary failed: ' . json_encode($summaryResponse));
    $summary = $summaryResponse['body'];
    foreach (['today_sales', 'transactions_today', 'units_sold_today'] as $field) {
        dashboardAssert(array_key_exists($field, $summary), "Dashboard summary is missing {$field}.");
    }

    foreach ([
        'today', 'last_7_days', 'last_30_days', 'this_month', 'this_year',
        'custom&start_date=2026-08-01&end_date=2026-08-26',
    ] as $presetQuery) {
        $analytics = dashboardGet('dashboard/get_dashboard_summary.php?scope=analytics&preset=' . $presetQuery, $phpSessionId, $tabToken);
        dashboardAssert($analytics['status'] === 200, "Analytics filter {$presetQuery} failed: " . json_encode($analytics));
        foreach (['sales_trend', 'weekly_sales', 'category_sales', 'top_selling_products', 'transfer_activity', 'supplier_invoice_summary', 'top_suppliers', 'inventory_value'] as $field) {
            dashboardAssert(array_key_exists($field, $analytics['body']), "Analytics filter {$presetQuery} is missing {$field}.");
        }
    }

    $countFields = [
        'out_stock' => 'out_of_stock',
        'low_shelf' => 'low_shelf_stock',
        'reorder_needed' => 'reorder_needed',
        'missing_expiry' => 'missing_expiry_dates',
        'expiring_soon' => 'expiring_soon',
        'pending_po' => 'pending_po',
        'awaiting_inspection' => 'awaiting_inspection',
        'replacement_pending' => 'replacement_pending',
        'supplier_credit_pending' => 'supplier_credit_pending',
    ];
    $inventoryCounts = $summary['inventory_health']['counts'] ?? [];
    foreach (['in_stock' => 'healthy', 'low_stock' => 'low_stock', 'out_stock' => 'out_of_stock'] as $type => $field) {
        $details = dashboardGet('dashboard/get_alert_details.php?type=' . $type, $phpSessionId, $tabToken);
        dashboardAssert($details['status'] === 200, "{$type} details failed: " . json_encode($details));
        dashboardAssert((int) ($details['body']['count'] ?? -1) === (int) ($inventoryCounts[$field] ?? -2), "{$type} inventory card/detail count mismatch.");
    }
    foreach ($countFields as $type => $field) {
        $details = dashboardGet('dashboard/get_alert_details.php?type=' . rawurlencode($type), $phpSessionId, $tabToken);
        dashboardAssert($details['status'] === 200, "{$type} details failed: " . json_encode($details));
        dashboardAssert((int) ($details['body']['count'] ?? -1) === (int) ($summary[$field] ?? -2), "{$type} card/detail count mismatch.");
        dashboardAssert(count($details['body']['data'] ?? []) === (int) ($details['body']['count'] ?? -1), "{$type} response count does not match its rows.");
    }

    echo "dashboard overview HTTP test passed\n";
} finally {
    $pdo->prepare('DELETE FROM auth_sessions WHERE auth_session_id = :id')->execute([':id' => $authSessionId]);
}
