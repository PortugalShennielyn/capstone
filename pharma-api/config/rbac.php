<?php

function normalizeRbacRole($role): string
{
    $normalized = strtolower(trim((string) $role));
    $normalized = str_replace([' ', '-'], '_', $normalized);

    return match ($normalized) {
        'sales_clerk', 'ro_salesclerk' => 'salesclerk',
        'manager/owner', 'owner/manager', 'manager_owner', 'owner_manager', 'manager_/_owner' => 'manager',
        default => $normalized,
    };
}

function currentSessionRbacRoles(): array
{
    $roles = array_merge(
        [$_SESSION['role'] ?? ''],
        is_array($_SESSION['roles'] ?? null) ? $_SESSION['roles'] : [],
        is_array($_SESSION['role_identifiers'] ?? null) ? $_SESSION['role_identifiers'] : []
    );

    return array_values(array_unique(array_filter(array_map('normalizeRbacRole', $roles))));
}

function currentSessionHasRbacRole(string $role): bool
{
    return in_array(normalizeRbacRole($role), currentSessionRbacRoles(), true);
}

function managerApiRequestAllowed(string $scriptName): bool
{
    $path = strtolower(str_replace('\\', '/', $scriptName));
    $marker = '/pharma-api/v1/';
    $markerPosition = strpos($path, $marker);
    $relativePath = $markerPosition === false
        ? ltrim($path, '/')
        : substr($path, $markerPosition + strlen($marker));

    if (str_starts_with($relativePath, 'auth/')) {
        return true;
    }

    foreach (['dashboard/', 'products/', 'inventory/', 'suppliers/', 'purchase_orders/', 'purchase_requests/', 'reports/', 'users/'] as $prefix) {
        if (str_starts_with($relativePath, $prefix)) {
            return true;
        }
    }

    return in_array($relativePath, [
        'sales/get_sales_history.php',
        'cashier/get_cashier_shift_summary.php',
        'cashier/get_cashier_order.php',
    ], true);
}

function enforceManagerApiBoundary(): void
{
    if (
        currentSessionHasRbacRole('manager')
        || currentSessionHasRbacRole('ro_manager')
    ) {
        if (!managerApiRequestAllowed($_SERVER['SCRIPT_NAME'] ?? '')) {
            sendForbiddenResponse('Access denied.');
        }
    }
}

function supervisorApiRequestAllowed(string $scriptName, string $requestMethod): bool
{
    $path = strtolower(str_replace('\\', '/', $scriptName));
    $marker = '/pharma-api/v1/';
    $markerPosition = strpos($path, $marker);
    $relativePath = $markerPosition === false
        ? ltrim($path, '/')
        : substr($path, $markerPosition + strlen($marker));
    $method = strtoupper($requestMethod);

    if (str_starts_with($relativePath, 'auth/')) return true;
    if ($relativePath === 'purchase_requests/decide_purchase_request.php') return $method === 'POST';
    if ($relativePath === 'purchase_requests/get_purchase_requests.php') return $method === 'GET';
    if (in_array($relativePath, ['dashboard/get_dashboard_summary.php', 'dashboard/get_supervisor_dashboard.php'], true)) return $method === 'GET';
    if ($relativePath === 'settings/get_admin_settings.php') return $method === 'GET';
    if (str_starts_with($relativePath, 'purchase_orders/get_')) return $method === 'GET';
    if (str_starts_with($relativePath, 'suppliers/get_')) return $method === 'GET';
    if (str_starts_with($relativePath, 'reports/get_')) return $method === 'GET';
    if (str_starts_with($relativePath, 'inventory/get_')) return $method === 'GET';
    if (str_starts_with($relativePath, 'products/get_')) return $method === 'GET';
    return false;
}

function enforceSupervisorApiBoundary(): void
{
    $hasAdminRole = currentSessionHasRbacRole('super_admin')
        || currentSessionHasRbacRole('ro_super_admin')
        || currentSessionHasRbacRole('admin')
        || currentSessionHasRbacRole('ro_admin');

    if (!$hasAdminRole && (currentSessionHasRbacRole('supervisor') || currentSessionHasRbacRole('ro_supervisor'))) {
        if (!supervisorApiRequestAllowed($_SERVER['SCRIPT_NAME'] ?? '', $_SERVER['REQUEST_METHOD'] ?? 'GET')) {
            sendForbiddenResponse('This action is outside Supervisor PR-review permissions.');
        }
    }
}

?>
