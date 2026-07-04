<?php
function ensureSupplierArchiveColumn(PDO $pdo): void
{
    $pdo->exec(
        'ALTER TABLE suppliers
         ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP NULL DEFAULT NULL'
    );
}
?>
