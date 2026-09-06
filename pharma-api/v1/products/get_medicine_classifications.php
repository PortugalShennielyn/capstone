<?php
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once 'product_customization_schema.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Only GET requests are allowed.']);
    exit();
}

try {
    ensureProductCustomizationSchema($pdo);
    $statement = $pdo->query(
        "SELECT choice.choice_value AS value,
                CASE
                    WHEN LOWER(TRIM(choice.choice_value)) = 'prescription (rx)' THEN 'Rx'
                    ELSE NULL
                END AS badge
         FROM product_specification_choices choice
         INNER JOIN product_specifications specification
            ON specification.specification_id=choice.specification_id
         WHERE LOWER(TRIM(specification.specification_name))='medicine classification'
         ORDER BY choice.sort_order, choice.choice_value"
    );
    echo json_encode(['status' => 'success', 'classifications' => $statement->fetchAll(PDO::FETCH_ASSOC)]);
} catch (Throwable $error) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to load medicine classifications.']);
}
?>
