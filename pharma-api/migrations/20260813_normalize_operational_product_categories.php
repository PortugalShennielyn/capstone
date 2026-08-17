<?php

declare(strict_types=1);

require_once __DIR__ . '/../config/db_connection.php';

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

/** @return array<string, int> */
function normalizationCounts(PDO $pdo): array
{
    return [
        'products' => (int) $pdo->query('SELECT COUNT(*) FROM product')->fetchColumn(),
        'product_types' => (int) $pdo->query('SELECT COUNT(*) FROM product_types')->fetchColumn(),
        'product_type_specifications' => (int) $pdo->query('SELECT COUNT(*) FROM product_type_specifications')->fetchColumn(),
        'product_specifications' => (int) $pdo->query('SELECT COUNT(*) FROM product_specifications')->fetchColumn(),
    ];
}

try {
    $pdo->beginTransaction();

    $canonicalNames = ['Grocery', 'Medicine', 'Medical Supplies'];
    $categoryRows = $pdo->query(
        'SELECT category_id, category_name FROM product_categories ORDER BY category_name FOR UPDATE'
    )->fetchAll(PDO::FETCH_ASSOC);

    $categoryIds = [];
    foreach ($categoryRows as $row) {
        $normalizedName = strtolower(trim((string) $row['category_name']));
        foreach ($canonicalNames as $canonicalName) {
            if ($normalizedName === strtolower($canonicalName)) {
                $categoryIds[$canonicalName] = (string) $row['category_id'];
            }
        }
    }
    foreach ($canonicalNames as $canonicalName) {
        if (empty($categoryIds[$canonicalName])) {
            throw new RuntimeException("Missing canonical category: {$canonicalName}");
        }
    }

    $countsBefore = normalizationCounts($pdo);
    $knownMappings = [
        'cosmetics' => 'Grocery',
        'beauty care' => 'Grocery',
        'analgesic/antipyretic' => 'Medicine',
        'analgesic/ antipyretic' => 'Medicine',
    ];
    $canonicalLookup = array_fill_keys(array_map('strtolower', $canonicalNames), true);
    $obsoleteCategories = [];
    $typeUpdates = 0;

    foreach ($categoryRows as $row) {
        $categoryId = (string) $row['category_id'];
        $categoryName = trim((string) $row['category_name']);
        $normalizedName = strtolower($categoryName);
        if (isset($canonicalLookup[$normalizedName])) {
            continue;
        }

        $typeStatement = $pdo->prepare(
            'SELECT type_id, type_name FROM product_types WHERE category_id = :category_id ORDER BY type_name'
        );
        $typeStatement->execute([':category_id' => $categoryId]);
        $types = $typeStatement->fetchAll(PDO::FETCH_ASSOC);

        if ($normalizedName === 'others' && count($types) > 0) {
            $names = implode(', ', array_column($types, 'type_name'));
            throw new RuntimeException("Ambiguous Product Types under Others: {$names}");
        }
        if ($normalizedName !== 'others' && !isset($knownMappings[$normalizedName])) {
            throw new RuntimeException("Unknown non-operational category requires review: {$categoryName}");
        }

        if (isset($knownMappings[$normalizedName])) {
            $updateTypes = $pdo->prepare(
                'UPDATE product_types SET category_id = :target_id WHERE category_id = :source_id'
            );
            $updateTypes->execute([
                ':target_id' => $categoryIds[$knownMappings[$normalizedName]],
                ':source_id' => $categoryId,
            ]);
            $typeUpdates += $updateTypes->rowCount();
        }
        $obsoleteCategories[] = ['category_id' => $categoryId, 'category_name' => $categoryName];
    }

    $invalidProductTypes = (int) $pdo->query(
        'SELECT COUNT(*) FROM product p LEFT JOIN product_types pt ON pt.type_id = p.type_id WHERE pt.type_id IS NULL'
    )->fetchColumn();
    if ($invalidProductTypes !== 0) {
        throw new RuntimeException("Products with an invalid Product Type: {$invalidProductTypes}");
    }

    $productUpdate = $pdo->prepare(
        'UPDATE product p INNER JOIN product_types pt ON pt.type_id = p.type_id '
        . 'SET p.category_id = pt.category_id WHERE NOT (p.category_id <=> pt.category_id)'
    );
    $productUpdate->execute();
    $productUpdates = $productUpdate->rowCount();

    $canonicalPlaceholders = implode(',', array_fill(0, count($canonicalNames), '?'));
    $invalidTypeCategory = $pdo->prepare(
        "SELECT COUNT(*) FROM product_types pt LEFT JOIN product_categories pc ON pc.category_id = pt.category_id "
        . "WHERE pc.category_id IS NULL OR pc.category_name NOT IN ({$canonicalPlaceholders})"
    );
    $invalidTypeCategory->execute($canonicalNames);
    if ((int) $invalidTypeCategory->fetchColumn() !== 0) {
        throw new RuntimeException('At least one Product Type is not assigned to a canonical category.');
    }

    $inconsistentProducts = (int) $pdo->query(
        'SELECT COUNT(*) FROM product p INNER JOIN product_types pt ON pt.type_id = p.type_id '
        . 'WHERE NOT (p.category_id <=> pt.category_id)'
    )->fetchColumn();
    if ($inconsistentProducts !== 0) {
        throw new RuntimeException("Products still inconsistent with their Product Type: {$inconsistentProducts}");
    }

    $brokenTypeSpecifications = (int) $pdo->query(
        'SELECT COUNT(*) FROM product_type_specifications pts '
        . 'LEFT JOIN product_types pt ON pt.type_id = pts.type_id '
        . 'LEFT JOIN product_specifications ps ON ps.specification_id = pts.specification_id '
        . 'WHERE pt.type_id IS NULL OR ps.specification_id IS NULL'
    )->fetchColumn();
    if ($brokenTypeSpecifications !== 0) {
        throw new RuntimeException("Broken Product Type specification relationships: {$brokenTypeSpecifications}");
    }

    $duplicateTypes = (int) $pdo->query(
        'SELECT COUNT(*) FROM ('
        . 'SELECT category_id, LOWER(TRIM(type_name)) normalized_name FROM product_types '
        . 'GROUP BY category_id, LOWER(TRIM(type_name)) HAVING COUNT(*) > 1'
        . ') duplicate_type_groups'
    )->fetchColumn();
    if ($duplicateTypes !== 0) {
        throw new RuntimeException("Duplicate Product Type names within a category: {$duplicateTypes}");
    }

    $deletedCategories = [];
    foreach ($obsoleteCategories as $category) {
        $referenceStatement = $pdo->prepare(
            'SELECT '
            . '(SELECT COUNT(*) FROM product WHERE category_id = :product_category_id) + '
            . '(SELECT COUNT(*) FROM product_types WHERE category_id = :type_category_id)'
        );
        $referenceStatement->execute([
            ':product_category_id' => $category['category_id'],
            ':type_category_id' => $category['category_id'],
        ]);
        if ((int) $referenceStatement->fetchColumn() !== 0) {
            throw new RuntimeException("Category still has references and cannot be removed: {$category['category_name']}");
        }

        $deleteStatement = $pdo->prepare('DELETE FROM product_categories WHERE category_id = :category_id');
        $deleteStatement->execute([':category_id' => $category['category_id']]);
        if ($deleteStatement->rowCount() !== 1) {
            throw new RuntimeException("Category removal failed: {$category['category_name']}");
        }
        $deletedCategories[] = $category['category_name'];
    }

    $remainingCategories = $pdo->query(
        'SELECT category_name FROM product_categories ORDER BY category_name'
    )->fetchAll(PDO::FETCH_COLUMN);
    $expectedCategories = $canonicalNames;
    sort($remainingCategories);
    sort($expectedCategories);
    if ($remainingCategories !== $expectedCategories) {
        throw new RuntimeException('The final category set is not exactly the three canonical categories.');
    }

    if (normalizationCounts($pdo) !== $countsBefore) {
        throw new RuntimeException('Protected product/type/specification row counts changed; rolling back.');
    }

    $pdo->commit();
    echo json_encode([
        'status' => 'success',
        'product_type_category_updates' => $typeUpdates,
        'product_category_updates' => $productUpdates,
        'deleted_categories' => $deletedCategories,
        'protected_counts' => $countsBefore,
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL;
} catch (Throwable $error) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    fwrite(STDERR, "Category normalization rolled back: {$error->getMessage()}" . PHP_EOL);
    exit(1);
}

