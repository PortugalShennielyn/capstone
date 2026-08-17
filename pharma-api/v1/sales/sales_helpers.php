<?php

function salesTableExists(PDO $pdo, string $table): bool
{
    $stmt = $pdo->prepare(
        'SELECT COUNT(*)
         FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = :table'
    );
    $stmt->execute([':table' => $table]);
    return (int) $stmt->fetchColumn() > 0;
}

function salesColumnExists(PDO $pdo, string $table, string $column): bool
{
    $stmt = $pdo->prepare(
        'SELECT COUNT(*)
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = :table
           AND COLUMN_NAME = :column'
    );
    $stmt->execute([':table' => $table, ':column' => $column]);
    return (int) $stmt->fetchColumn() > 0;
}

function salesFirstColumn(PDO $pdo, string $table, array $candidates): ?string
{
    foreach ($candidates as $column) {
        if (salesColumnExists($pdo, $table, $column)) {
            return $column;
        }
    }

    return null;
}

function salesSqlValue(?string $column, string $alias, string $fallback = "''"): string
{
    return $column ? "{$alias}.`{$column}`" : $fallback;
}

function salesDisplayValue($value, string $fallback = ''): string
{
    $text = trim((string) ($value ?? ''));
    return $text !== '' ? $text : $fallback;
}

function salesMoneyValue($value): float
{
    return round((float) ($value ?? 0), 2);
}

function salesEmptyListPayload(): array
{
    return [
        'orders' => [],
        'summary' => [
            'waiting_count' => 0,
            'cashier_queue_count' => 0,
            'completed_today_count' => 0,
            'cancelled_today_count' => 0,
            'total_sales_today' => 0,
            'total_sales_orders_today' => 0,
            'waiting_total' => 0,
        ],
    ];
}

require_once __DIR__ . '/sales_pos_helpers.php';

?>
