<?php
require_once '../../config/db_connection.php';
require_once 'product_category_schema.php';

try {
    ensureProductCategorySchema($pdo);

    $stmt = $pdo->prepare(
        "SELECT
            p.product_id,
            p.supplier_id,
            p.category_id,
            p.type_id,
            p.brand_name,
            p.product_name,
            p.generic_name,
            p.image_url,
            p.created_at,
            pc.category_name,
            pt.type_name
         FROM product p
         LEFT JOIN product_categories pc ON p.category_id = pc.category_id
         LEFT JOIN product_types pt ON p.type_id = pt.type_id
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
            $variation['stock'] = (int) ($variation['current_stock'] ?? 0);
            $variationsByProduct[(int) $variation['product_id']][] = $variation;
        }

        foreach ($products as &$product) {
            $variations = $variationsByProduct[(int) $product['product_id']] ?? [];
            $defaultVariation = $variations[0] ?? [];
            $product['variations'] = $variations;
            $product['current_stock'] = array_sum(array_map(static fn($variation) => (int) ($variation['stock'] ?? 0), $variations));
            $product['variation_id'] = $defaultVariation['variation_id'] ?? null;
            $product['barcode'] = $defaultVariation['barcode'] ?? '';
            $product['price'] = $defaultVariation['price'] ?? 0;
            $product['product_unit'] = $defaultVariation['unit'] ?? '';
            $product['measurement_unit_name'] = $defaultVariation['unit'] ?? '';
            $product['unit'] = $defaultVariation['unit'] ?? '';
            $product['strength_size_value'] = $defaultVariation['strength_value'] ?? '';
            $product['strength_value'] = $defaultVariation['strength_value'] ?? '';
            $product['strength_unit'] = $defaultVariation['strength_unit'] ?? '';
            $product['volume_value'] = $defaultVariation['volume_value'] ?? '';
            $product['volume_unit'] = $defaultVariation['volume_unit'] ?? '';
            $product['variant_flavor'] = $defaultVariation['variant_name'] ?? '';
            $product['size_value'] = $defaultVariation['size_value'] ?? '';
            $product['display_size'] = $defaultVariation['size_value'] ?? '';
            $product['weight_volume_value'] = $defaultVariation['weight_value'] ?? '';
            $product['weight_volume_unit'] = $defaultVariation['weight_unit'] ?? '';
            $product['packaging'] = $defaultVariation['packaging'] ?? '';
            $product['packaging_size'] = $defaultVariation['size_value'] ?? '';
            $product['strength_size_display'] = trim(implode(' ', array_filter([
                $defaultVariation['strength_value'] ?? '',
                $defaultVariation['strength_unit'] ?? ''
            ])));
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
        'message' => 'Unable to load products.',
        'error' => $e->getMessage()
    ]);
}

?>
