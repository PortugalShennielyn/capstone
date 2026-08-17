<?php

require_once __DIR__ . '/../pharma-api/config/rbac.php';

function supplierCatalogPermissionAssert(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$mutationEndpoints = [
    'assign_product.php',
    'update_supplier_assignment.php',
    'update_supplier_product.php',
    'delete_supplier_product.php',
];

foreach ($mutationEndpoints as $endpoint) {
    supplierCatalogPermissionAssert(
        !supervisorApiRequestAllowed("/pharma-api/v1/suppliers/{$endpoint}", 'POST'),
        "Supervisor must not pass the API boundary for {$endpoint}."
    );

    $source = file_get_contents(__DIR__ . "/../pharma-api/v1/suppliers/{$endpoint}");
    supplierCatalogPermissionAssert(
        str_contains($source, "'admin'") && str_contains($source, "'ro-admin'"),
        "{$endpoint} must allow Admin sessions."
    );
    supplierCatalogPermissionAssert(
        !str_contains($source, "'supervisor'") && !str_contains($source, "'ro-supervisor'"),
        "{$endpoint} must reject Supervisor/CEO sessions."
    );
}

supplierCatalogPermissionAssert(
    supervisorApiRequestAllowed('/pharma-api/v1/suppliers/get_supplier_product_list.php', 'GET'),
    'Supervisor/CEO must retain read access to the Supplier Product Catalog.'
);

$addProductSource = file_get_contents(__DIR__ . '/../pharma-api/v1/products/add_product.php');
supplierCatalogPermissionAssert(
    str_contains($addProductSource, "!currentSessionHasRbacRole('admin')")
        && str_contains($addProductSource, "!currentSessionHasRbacRole('ro_admin')"),
    'The indirect add-product supplier assignment path must require Admin.'
);

echo "Supplier catalog role permission checks passed.\n";
