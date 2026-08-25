<?php

require_once __DIR__ . '/../pharma-api/config/rbac.php';

function sendForbiddenResponse(string $message = 'Access denied.'): void
{
    throw new RuntimeException($message, 403);
}

function assertRestrictedRoleRbac(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$cashierAllowed = [
    '/PharmacySystem_for_DocR/pharma-api/v1/auth/check_session.php',
    '/PharmacySystem_for_DocR/pharma-api/v1/cashier/get_cashier_orders.php',
    '/PharmacySystem_for_DocR/pharma-api/v1/cashier/complete_payment.php',
    '/PharmacySystem_for_DocR/pharma-api/v1/reports/get_report.php',
];
foreach ($cashierAllowed as $endpoint) {
    assertRestrictedRoleRbac(cashierApiRequestAllowed($endpoint), "Cashier endpoint should be allowed: {$endpoint}");
}

$salesClerkAllowed = [
    '/PharmacySystem_for_DocR/pharma-api/v1/auth/check_session.php',
    '/PharmacySystem_for_DocR/pharma-api/v1/sales/get_my_sales_clerk_orders.php',
    '/PharmacySystem_for_DocR/pharma-api/v1/sales/sales_products_search.php',
    '/PharmacySystem_for_DocR/pharma-api/v1/sales/sales_order_send_to_cashier.php',
    '/PharmacySystem_for_DocR/pharma-api/v1/reports/get_report.php',
];
foreach ($salesClerkAllowed as $endpoint) {
    assertRestrictedRoleRbac(salesClerkApiRequestAllowed($endpoint), "Sales Clerk endpoint should be allowed: {$endpoint}");
}

$managerOnly = [
    '/PharmacySystem_for_DocR/pharma-api/v1/settings/get_admin_settings.php',
    '/PharmacySystem_for_DocR/pharma-api/v1/users/fetch_users.php',
    '/PharmacySystem_for_DocR/pharma-api/v1/products/add_product.php',
    '/PharmacySystem_for_DocR/pharma-api/v1/purchase_orders/create_po.php',
];
foreach ($managerOnly as $endpoint) {
    assertRestrictedRoleRbac(!cashierApiRequestAllowed($endpoint), "Cashier endpoint should be denied: {$endpoint}");
    assertRestrictedRoleRbac(!salesClerkApiRequestAllowed($endpoint), "Sales Clerk endpoint should be denied: {$endpoint}");
}

$_SESSION = ['role' => 'cashier'];
$_SERVER['SCRIPT_NAME'] = '/PharmacySystem_for_DocR/pharma-api/v1/users/fetch_users.php';
try {
    enforceCashierApiBoundary();
    throw new RuntimeException('Cashier enforcement did not reject a Manager-only endpoint.');
} catch (RuntimeException $error) {
    assertRestrictedRoleRbac($error->getCode() === 403, 'Cashier enforcement should return 403.');
}

$_SESSION = ['role' => 'salesclerk'];
$_SERVER['SCRIPT_NAME'] = '/PharmacySystem_for_DocR/pharma-api/v1/purchase_orders/create_po.php';
try {
    enforceSalesClerkApiBoundary();
    throw new RuntimeException('Sales Clerk enforcement did not reject a Manager-only endpoint.');
} catch (RuntimeException $error) {
    assertRestrictedRoleRbac($error->getCode() === 403, 'Sales Clerk enforcement should return 403.');
}

echo "Restricted-role RBAC matrix tests passed.\n";
