<?php
require_once __DIR__ . '/../config/db_connection.php';
require_once __DIR__ . '/../v1/products/product_customization_schema.php';

ensureProductCustomizationSchema($pdo);

$pdo->beginTransaction();
try {
    $wrongMedicineTypes = ['Device/Equipment', 'First Aid', 'Medical Supply', 'Medicine', 'Nebulizer'];
    $findWrong = $pdo->prepare(
        "SELECT pt.type_id, pt.type_name,
                (SELECT COUNT(*) FROM product p WHERE p.type_id = pt.type_id) AS product_count
         FROM product_types pt
         INNER JOIN product_categories pc ON pc.category_id = pt.category_id
         WHERE LOWER(TRIM(pc.category_name)) = 'medicine'
           AND pt.type_name = :type_name"
    );
    $archive = $pdo->prepare('UPDATE product_types SET is_active = 0 WHERE type_id = :type_id');
    $deleteType = $pdo->prepare('DELETE FROM product_types WHERE type_id = :type_id');
    foreach ($wrongMedicineTypes as $typeName) {
        $findWrong->execute([':type_name' => $typeName]);
        foreach ($findWrong->fetchAll(PDO::FETCH_ASSOC) as $type) {
            if ((int) $type['product_count'] > 0) {
                $archive->execute([':type_id' => $type['type_id']]);
            } else {
                $deleteType->execute([':type_id' => $type['type_id']]);
            }
        }
    }

    // Replace only untouched catalog templates. Types already used by products
    // retain their exact mappings so historical values are never invalidated.
    $types = $pdo->query(
        "SELECT pt.type_id
         FROM product_types pt
         INNER JOIN product_categories pc ON pc.category_id = pt.category_id
         WHERE pc.category_name IN ('Medicine','Grocery','Medical Supplies')
           AND pt.is_active = 1
           AND NOT EXISTS (SELECT 1 FROM product p WHERE p.type_id = pt.type_id)"
    )->fetchAll(PDO::FETCH_COLUMN);
    $clear = $pdo->prepare('DELETE FROM product_type_specifications WHERE type_id = :type_id');
    foreach ($types as $typeId) {
        $clear->execute([':type_id' => $typeId]);
        assignSuggestedProductTypeTemplate($pdo, $typeId);
    }

    $pdo->commit();
    echo json_encode(['status' => 'success', 'configured_types' => count($types)], JSON_PRETTY_PRINT) . PHP_EOL;
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    fwrite(STDERR, $error->getMessage() . PHP_EOL);
    exit(1);
}
?>
