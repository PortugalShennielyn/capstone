<?php

require_once __DIR__ . '/../pharma-api/config/rbac.php';

function assertRbac(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

assertRbac(normalizeRbacRole('Manager') === 'manager', 'Manager role normalization failed.');
assertRbac(normalizeRbacRole('Manager/Owner') === 'manager', 'Legacy Manager/Owner normalization failed.');
assertRbac(normalizeRbacRole('Sales Clerk') === 'salesclerk', 'Sales Clerk role normalization failed.');

$allowedEndpoints = [
    '/PharmacySystem_for_DocR/pharma-api/v1/auth/check_session.php',
    '/PharmacySystem_for_DocR/pharma-api/v1/dashboard/get_dashboard_summary.php',
    '/PharmacySystem_for_DocR/pharma-api/v1/products/get_products.php',
    '/PharmacySystem_for_DocR/pharma-api/v1/inventory/get_inventory.php',
    '/PharmacySystem_for_DocR/pharma-api/v1/suppliers/get_suppliers.php',
    '/PharmacySystem_for_DocR/pharma-api/v1/purchase_orders/get_purchase_orders.php',
    '/PharmacySystem_for_DocR/pharma-api/v1/reports/get_report.php',
    '/PharmacySystem_for_DocR/pharma-api/v1/users/fetch_users.php',
    '/PharmacySystem_for_DocR/pharma-api/v1/sales/get_sales_history.php',
    '/PharmacySystem_for_DocR/pharma-api/v1/cashier/get_cashier_shift_summary.php',
];

foreach ($allowedEndpoints as $endpoint) {
    assertRbac(managerApiRequestAllowed($endpoint), "Manager endpoint should be allowed: {$endpoint}");
}

$deniedEndpoints = [
    '/PharmacySystem_for_DocR/pharma-api/v1/settings/get_admin_settings.php',
    '/PharmacySystem_for_DocR/pharma-api/v1/sales/sales_products_search.php',
    '/PharmacySystem_for_DocR/pharma-api/v1/sales/sales_order_create.php',
    '/PharmacySystem_for_DocR/pharma-api/v1/cashier/get_cashier_orders.php',
    '/PharmacySystem_for_DocR/pharma-api/v1/cashier/accept_order.php',
    '/PharmacySystem_for_DocR/pharma-api/v1/cashier/complete_payment.php',
];

foreach ($deniedEndpoints as $endpoint) {
    assertRbac(!managerApiRequestAllowed($endpoint), "Manager endpoint should be denied: {$endpoint}");
}

echo "Manager RBAC matrix tests passed.\n";
