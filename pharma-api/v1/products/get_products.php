<?php
require_once '../../config/db_connection.php';
require_once 'product_category_schema.php';

try {
    ensureProductCategorySchema($pdo);
    $unitIdColumn = getMeasurementUnitIdColumn($pdo);

    $stmt = $pdo->prepare(
        "SELECT
            p.*,
            pc.category_name,
            pt.type_name,
            pmu.unit_name AS measurement_unit_name,
            COALESCE(first_variation.unit, p.product_unit, pmu.unit_name, p.unit, 'N/A') AS product_unit,
            CASE
                WHEN COALESCE(first_variation.strength_value, p.strength_value, p.strength_size_value, p.strength_size) = 'N/A' THEN 'N/A'
                WHEN COALESCE(first_variation.strength_unit, p.strength_unit) IS NULL OR COALESCE(first_variation.strength_unit, p.strength_unit) = '' THEN COALESCE(first_variation.strength_value, p.strength_value, p.strength_size_value, p.strength_size, 'N/A')
                ELSE CONCAT(COALESCE(first_variation.strength_value, p.strength_value, p.strength_size_value, p.strength_size), ' ', COALESCE(first_variation.strength_unit, p.strength_unit))
            END AS strength_size_display,
            p.generic_name,
            COALESCE(first_variation.strength_value, p.strength_value, p.strength_size_value, p.strength_size) AS strength_size_value,
            COALESCE(first_variation.strength_value, p.strength_value) AS strength_value,
            COALESCE(first_variation.strength_unit, p.strength_unit) AS strength_unit,
            COALESCE(first_variation.volume_value, p.volume_value) AS volume_value,
            COALESCE(first_variation.volume_unit, p.volume_unit) AS volume_unit,
            COALESCE(first_variation.variant_name, p.variant_flavor, p.goods_type) AS variant_flavor,
            COALESCE(first_variation.size_value, p.display_size, p.size_value, p.size_weight) AS size_value,
            COALESCE(first_variation.size_value, p.display_size) AS display_size,
            COALESCE(first_variation.weight_value, p.weight_volume_value) AS weight_volume_value,
            COALESCE(first_variation.weight_unit, p.weight_volume_unit) AS weight_volume_unit,
            COALESCE(first_variation.packaging, p.packaging, p.unit) AS packaging,
            first_variation.variation_id,
            CASE
                WHEN pc.category_name = 'Grocery' THEN COALESCE(first_variation.size_value, p.display_size, p.size_value, p.size_weight, 'N/A')
                ELSE COALESCE(p.size_weight, p.goods_type, p.unit, 'N/A')
            END AS packaging_size,
            COALESCE(stock.current_stock, 0) AS current_stock
         FROM product p
         LEFT JOIN product_categories pc ON p.category_id = pc.category_id
         LEFT JOIN product_types pt ON p.type_id = pt.type_id
         LEFT JOIN product_measurement_units pmu ON p.measurement_unit_id = pmu.{$unitIdColumn}
         LEFT JOIN product_variations first_variation ON first_variation.variation_id = (
            SELECT pv.variation_id
            FROM product_variations pv
            WHERE pv.product_id = p.product_id
            ORDER BY pv.is_default DESC, pv.variation_id ASC
            LIMIT 1
         )
         LEFT JOIN (
            SELECT product_id, SUM(quantity_remaining) AS current_stock
            FROM product_selling_stock
            GROUP BY product_id
         ) stock ON stock.product_id = p.product_id
         ORDER BY p.product_id DESC"
    );

    $stmt->execute();

    $products = $stmt->fetchAll(PDO::FETCH_ASSOC);
    if (count($products) > 0) {
        $productIds = array_map(static fn($row) => (int) $row['product_id'], $products);
        $placeholders = implode(',', array_fill(0, count($productIds), '?'));
        $variationStatement = $pdo->prepare(
            "SELECT
                pv.*,
                COALESCE(stock.current_stock, 0) + COALESCE(legacy_stock.current_stock, 0) + COALESCE(pv.stock, 0) AS current_stock
             FROM product_variations pv
             LEFT JOIN (
                SELECT variation_id, SUM(quantity_remaining) AS current_stock
                FROM product_selling_stock
                WHERE variation_id IS NOT NULL
                GROUP BY variation_id
             ) stock ON stock.variation_id = pv.variation_id
             LEFT JOIN (
                SELECT product_id, SUM(quantity_remaining) AS current_stock
                FROM product_selling_stock
                WHERE variation_id IS NULL
                GROUP BY product_id
             ) legacy_stock ON legacy_stock.product_id = pv.product_id
                AND pv.variation_id = (
                    SELECT first_pv.variation_id
                    FROM product_variations first_pv
                    WHERE first_pv.product_id = pv.product_id
                    ORDER BY first_pv.is_default DESC, first_pv.variation_id ASC
                    LIMIT 1
                )
             WHERE pv.product_id IN ({$placeholders})
             ORDER BY pv.product_id ASC, pv.is_default DESC, pv.variation_id ASC"
        );
        $variationStatement->execute($productIds);
        $variationsByProduct = [];
        foreach ($variationStatement->fetchAll(PDO::FETCH_ASSOC) as $variation) {
            $variation['stock'] = (int) ($variation['current_stock'] ?? $variation['stock'] ?? 0);
            $variationsByProduct[(int) $variation['product_id']][] = $variation;
        }

        foreach ($products as &$product) {
            $product['variations'] = $variationsByProduct[(int) $product['product_id']] ?? [];
            $product['current_stock'] = array_sum(array_map(static fn($variation) => (int) ($variation['stock'] ?? 0), $product['variations']));
        }
        unset($product);
    }

    echo json_encode([
        'status' => 'success',
        'data' => $products
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Unable to load products.'
    ]);
}

?>
