<?php
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';

try {
    $categories = $pdo->query(
        'SELECT category_id, category_name
         FROM product_categories
         ORDER BY category_name ASC'
    )->fetchAll(PDO::FETCH_ASSOC);

    $types = $pdo->query(
        'SELECT type_id, type_name, category_id
         FROM product_types
         ORDER BY type_name ASC'
    )->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'status' => 'success',
        'data' => [
            'categories' => array_map(static fn (array $row): array => [
                'category_id' => trim((string) ($row['category_id'] ?? '')),
                'category_name' => trim((string) ($row['category_name'] ?? '')),
            ], $categories),
            'types' => array_map(static fn (array $row): array => [
                'type_id' => trim((string) ($row['type_id'] ?? '')),
                'type_name' => trim((string) ($row['type_name'] ?? '')),
                'category_id' => trim((string) ($row['category_id'] ?? '')),
            ], $types),
        ],
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Unable to load sales product filters.',
        'error' => $e->getMessage(),
    ]);
}

?>
