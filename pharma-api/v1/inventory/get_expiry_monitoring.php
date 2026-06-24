<?php
require_once '../../config/db_connection.php';
require_once '../products/product_category_schema.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Only GET requests are allowed.']);
    exit();
}

try {
    ensureProductCategorySchema($pdo);
    $pdo->exec("ALTER TABLE product_inventory ADD COLUMN IF NOT EXISTS expiry_date DATE NULL");
    $pdo->exec("ALTER TABLE product_inventory ADD COLUMN IF NOT EXISTS expiration_date DATE NULL");
    $pdo->exec("ALTER TABLE product_inventory ADD COLUMN IF NOT EXISTS expiry_alert_days INT NOT NULL DEFAULT 30");

    $statement = $pdo->prepare(
        "SELECT
            inv.inventory_id,
            inv.product_id,
            inv.batch_number,
            inv.quantity_stocked AS received_quantity,
            inv.quantity_remaining AS available_quantity,
            COALESCE(inv.expiry_date, inv.expiration_date) AS expiry_date,
            COALESCE(inv.expiry_alert_days, 30) AS expiry_alert_days,
            DATEDIFF(COALESCE(inv.expiry_date, inv.expiration_date), CURRENT_DATE) AS days_until_expiry,
            p.product_name,
            p.brand_name,
            md.generic_name,
            COALESCE(md.strength, 'N/A') AS strength,
            md.strength AS strength_value,
            '' AS strength_unit,
            NULL AS volume_value,
            NULL AS volume_unit,
            COALESCE(gd.variant, 'N/A') AS variant_flavor,
            COALESCE(gd.size, 'N/A') AS size_value,
            gd.net_weight AS weight_volume_value,
            '' AS weight_volume_unit,
            COALESCE(md.package_type, gd.package_type, 'N/A') AS unit,
            COALESCE(md.package_type, gd.package_type, 'N/A') AS packaging,
            COALESCE(pc.category_name, 'N/A') AS category_name,
            COALESCE(pt.type_name, 'N/A') AS type_name
         FROM product_inventory inv
         INNER JOIN product p ON p.product_id = inv.product_id
         LEFT JOIN product_categories pc ON pc.category_id = p.category_id
         LEFT JOIN product_types pt ON pt.type_id = p.type_id
         LEFT JOIN medicine_details md ON md.product_id = p.product_id
         LEFT JOIN grocery_details gd ON gd.product_id = p.product_id
         WHERE inv.quantity_stocked > 0
            OR inv.quantity_remaining > 0
         ORDER BY COALESCE(inv.expiry_date, inv.expiration_date) IS NULL ASC,
                  COALESCE(inv.expiry_date, inv.expiration_date) ASC,
                  p.product_name ASC"
    );
    $statement->execute();

    $rows = array_map(static function (array $row): array {
        if (empty($row['expiry_date'])) {
            $row['expiry_status'] = 'No Expiry Date';
            $row['days_until_expiry'] = null;
            return $row;
        }

        $days = (int) $row['days_until_expiry'];
        if ($days < 0) {
            $row['expiry_status'] = 'Expired';
        } elseif ($days <= (int) ($row['expiry_alert_days'] ?? 30)) {
            $row['expiry_status'] = 'Expiring Soon';
        } else {
            $row['expiry_status'] = 'Good';
        }
        return $row;
    }, $statement->fetchAll(PDO::FETCH_ASSOC));

    echo json_encode([
        'status' => 'success',
        'data' => $rows
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Unable to load expiry monitoring records.',
        'error' => $e->getMessage()
    ]);
}
?>
