<?php
function ensureProductStatusColumn(PDO $pdo): void
{
    static $verified = false;
    if ($verified) {
        return;
    }

    $statement = $pdo->query("SHOW COLUMNS FROM product LIKE 'status'");
    if (!$statement->fetch(PDO::FETCH_ASSOC)) {
        throw new RuntimeException('The existing product status field is unavailable.');
    }
    $verified = true;
}

function normalizeProductStatus($value): string
{
    return strcasecmp(trim((string) $value), 'Inactive') === 0 ? 'Inactive' : 'Active';
}
?>
