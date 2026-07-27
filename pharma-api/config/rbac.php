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

    foreach (['dashboard/', 'products/', 'inventory/', 'suppliers/', 'purchase_orders/', 'reports/', 'users/'] as $prefix) {
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

?>
