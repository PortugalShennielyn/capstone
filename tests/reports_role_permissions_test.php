<?php

require_once __DIR__ . '/../pharma-api/config/rbac.php';

$_SERVER['REQUEST_METHOD'] = 'GET';
define('REPORTS_LIBRARY_ONLY', true);
require_once __DIR__ . '/../pharma-api/v1/reports/get_report.php';

function assertReportPermission(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$path = '/pharmacy/pharma-api/v1/reports/get_report.php';
$overallPath = '/pharmacy/pharma-api/v1/reports/get_overall_report.php';
foreach ([$path, $overallPath] as $reportPath) {
    assertReportPermission(cashierApiRequestAllowed($reportPath, 'GET'), 'Cashier GET report access must remain enabled.');
    assertReportPermission(!cashierApiRequestAllowed($reportPath, 'POST'), 'Cashier report mutation methods must be denied.');
    assertReportPermission(salesClerkApiRequestAllowed($reportPath, 'GET'), 'Sales Clerk GET report access must remain enabled.');
    assertReportPermission(!salesClerkApiRequestAllowed($reportPath, 'POST'), 'Sales Clerk report mutation methods must be denied.');
}

$_SESSION = ['role' => 'Cashier', 'user_id' => 'cashier-1'];
$cashier = reportRoleContext();
assertReportPermission($cashier['cashier'] && $cashier['available_categories'] === ['sales'], 'Cashier report categories must remain sales-only.');

$_SESSION = ['role' => 'Sales Clerk', 'user_id' => 'clerk-1'];
$clerk = reportRoleContext();
assertReportPermission($clerk['sales_clerk'] && $clerk['available_categories'] === ['sales', 'products'], 'Sales Clerk report categories must remain sales and product only.');
$filters = [
    'start_date' => '2026-10-01', 'date_end_exclusive' => '2026-10-11',
    'cashier_id' => '', 'sales_clerk_id' => 'another-clerk', 'payment_method' => '',
    'category_id' => '', 'type_id' => '', 'product_id' => '', 'brand' => ''
];
[$where, $params] = reportSalesWhere($filters, $clerk);
assertReportPermission(str_contains($where, 'o.sales_clerk_id = :scope_user'), 'Clerk sales must be scoped by the authenticated user.');
assertReportPermission(($params[':scope_user'] ?? '') === 'clerk-1', 'A Clerk filter must not override the authenticated user scope.');

$_SESSION = ['role' => 'Manager/Owner', 'user_id' => 'owner-1'];
$ownerAlias = reportRoleContext();
assertReportPermission($ownerAlias['management'] && in_array('overview', $ownerAlias['available_categories'], true), 'Manager/Owner legacy role must receive established management report access.');

$_SESSION = ['role' => 'Supervisor', 'user_id' => 'supervisor-1'];
$supervisor = reportRoleContext();
assertReportPermission($supervisor['supervisor'] && !in_array('sales', $supervisor['available_categories'], true), 'Supervisor must not receive company-wide sales reports.');

$inventory = supervisorInventoryPayload([
    'summary' => [['title' => 'Inventory Cost', 'value' => 123], ['title' => 'Total On Hand', 'value' => 8]],
    'charts' => [], 'columns' => ['unit_cost' => 'Unit Cost', 'on_hand' => 'On Hand', 'inventory_value' => 'Inventory Value'],
    'currency_columns' => ['unit_cost', 'inventory_value'],
    'rows' => [['unit_cost' => 4.5, 'inventory_value' => 12, 'on_hand' => 3]], 'notes' => []
]);
assertReportPermission(count($inventory['summary']) === 1 && $inventory['summary'][0]['title'] === 'Total On Hand', 'Supervisor inventory cost card must be removed.');
assertReportPermission(!isset($inventory['columns']['unit_cost'], $inventory['columns']['inventory_value']), 'Supervisor inventory cost columns must be removed.');
assertReportPermission(!isset($inventory['rows'][0]['unit_cost'], $inventory['rows'][0]['inventory_value']), 'Supervisor inventory costs must be removed from row data.');

$expiry = supervisorExpiryPayload([
    'summary' => [['title' => 'Cost at Risk', 'value' => 123], ['title' => 'Quantity at Risk', 'value' => 8]],
    'charts' => [['id' => 'expiry-cost', 'rows' => []], ['id' => 'expiry-window', 'rows' => []]],
    'columns' => ['cost_at_risk' => 'Cost at Risk', 'quantity_at_risk' => 'Quantity at Risk'],
    'currency_columns' => ['cost_at_risk'],
    'rows' => [['cost_at_risk' => 4.5, 'quantity_at_risk' => 3]], 'notes' => []
]);
assertReportPermission(count($expiry['summary']) === 1 && $expiry['summary'][0]['title'] === 'Quantity at Risk', 'Supervisor expiry cost card must be removed.');
assertReportPermission(count($expiry['charts']) === 1 && $expiry['charts'][0]['id'] === 'expiry-window', 'Supervisor expiry-cost chart must be removed.');
assertReportPermission(!isset($expiry['columns']['cost_at_risk'], $expiry['rows'][0]['cost_at_risk']), 'Supervisor expiry costs must be removed from row data.');

echo "Reports role and restricted-data tests passed.\n";
