<?php

$host = '127.0.0.1';
$dbName = 'pharma_db';
$username = 'root';
$password = '';

$pdo = new PDO(
    "mysql:host={$host};dbname={$dbName};charset=utf8mb4",
    $username,
    $password,
    [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]
);

$primaryKeys = [
    'users' => 'user_id',
    'suppliers' => 'supplier_id',
    'product_categories' => 'category_id',
    'product_types' => 'type_id',
    'product_measurement_units' => 'measurement_unit_id',
    'product' => 'product_id',
    'medicine_items' => 'medicine_id',
    'grocery_items' => 'grocery_id',
    'supplier_products' => 'supplier_product_id',
    'product_inventory' => 'inventory_id',
    'product_selling_stock' => 'selling_stock_id',
    'purchase_orders' => 'po_id',
    'purchase_order_items' => 'po_item_id',
    'purchase_order_receiving' => 'receiving_id',
    'purchase_order_receiving_items' => 'receiving_item_id',
    'purchase_order_returns' => 'return_id',
];

$references = [
    ['table' => 'product_types', 'column' => 'category_id', 'refTable' => 'product_categories', 'refColumn' => 'category_id', 'nullable' => true],
    ['table' => 'product', 'column' => 'category_id', 'refTable' => 'product_categories', 'refColumn' => 'category_id', 'nullable' => true],
    ['table' => 'product', 'column' => 'type_id', 'refTable' => 'product_types', 'refColumn' => 'type_id', 'nullable' => false],
    ['table' => 'product', 'column' => 'measurement_unit_id', 'refTable' => 'product_measurement_units', 'refColumn' => 'measurement_unit_id', 'nullable' => true],
    ['table' => 'product', 'column' => 'supplier_id', 'refTable' => 'suppliers', 'refColumn' => 'supplier_id', 'nullable' => true],
    ['table' => 'medicine_items', 'column' => 'product_id', 'refTable' => 'product', 'refColumn' => 'product_id', 'nullable' => false],
    ['table' => 'grocery_items', 'column' => 'product_id', 'refTable' => 'product', 'refColumn' => 'product_id', 'nullable' => false],
    ['table' => 'supplier_products', 'column' => 'supplier_id', 'refTable' => 'suppliers', 'refColumn' => 'supplier_id', 'nullable' => false],
    ['table' => 'supplier_products', 'column' => 'product_id', 'refTable' => 'product', 'refColumn' => 'product_id', 'nullable' => false],
    ['table' => 'product_inventory', 'column' => 'product_id', 'refTable' => 'product', 'refColumn' => 'product_id', 'nullable' => false],
    ['table' => 'product_selling_stock', 'column' => 'product_id', 'refTable' => 'product', 'refColumn' => 'product_id', 'nullable' => false],
    ['table' => 'product_selling_stock', 'column' => 'source_inventory_id', 'refTable' => 'product_inventory', 'refColumn' => 'inventory_id', 'nullable' => true],
    ['table' => 'purchase_orders', 'column' => 'supplier_id', 'refTable' => 'suppliers', 'refColumn' => 'supplier_id', 'nullable' => false],
    ['table' => 'purchase_order_items', 'column' => 'po_id', 'refTable' => 'purchase_orders', 'refColumn' => 'po_id', 'nullable' => false],
    ['table' => 'purchase_order_items', 'column' => 'product_id', 'refTable' => 'product', 'refColumn' => 'product_id', 'nullable' => false],
    ['table' => 'purchase_order_receiving', 'column' => 'po_id', 'refTable' => 'purchase_orders', 'refColumn' => 'po_id', 'nullable' => false],
    ['table' => 'purchase_order_receiving_items', 'column' => 'receiving_id', 'refTable' => 'purchase_order_receiving', 'refColumn' => 'receiving_id', 'nullable' => false],
    ['table' => 'purchase_order_receiving_items', 'column' => 'po_item_id', 'refTable' => 'purchase_order_items', 'refColumn' => 'po_item_id', 'nullable' => false],
    ['table' => 'purchase_order_returns', 'column' => 'po_id', 'refTable' => 'purchase_orders', 'refColumn' => 'po_id', 'nullable' => false],
    ['table' => 'purchase_order_returns', 'column' => 'po_item_id', 'refTable' => 'purchase_order_items', 'refColumn' => 'po_item_id', 'nullable' => false],
];

$relationshipIndexes = [
    'product_types' => [['category_id'], ['category_id', 'type_name', true]],
    'product' => [['category_id'], ['type_id'], ['measurement_unit_id'], ['supplier_id'], ['brand_name'], ['product_name']],
    'supplier_products' => [['supplier_id', 'product_id', true], ['product_id']],
    'product_inventory' => [['product_id'], ['expiration_date'], ['batch_number']],
    'product_selling_stock' => [['product_id'], ['source_inventory_id']],
    'purchase_orders' => [['supplier_id'], ['po_number', true], ['status'], ['created_at']],
    'purchase_order_items' => [['po_id'], ['product_id']],
    'purchase_order_receiving' => [['po_id', true]],
    'purchase_order_receiving_items' => [['receiving_id', 'po_item_id', true], ['po_item_id']],
    'purchase_order_returns' => [['po_id'], ['po_item_id'], ['return_status']],
    'medicine_items' => [['product_id']],
    'grocery_items' => [['product_id']],
];

function q(string $identifier): string
{
    return '`' . str_replace('`', '``', $identifier) . '`';
}

function tableExists(PDO $pdo, string $table): bool
{
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table');
    $stmt->execute([':table' => $table]);
    return (int) $stmt->fetchColumn() > 0;
}

function columnExists(PDO $pdo, string $table, string $column): bool
{
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND COLUMN_NAME = :column');
    $stmt->execute([':table' => $table, ':column' => $column]);
    return (int) $stmt->fetchColumn() > 0;
}

function columnType(PDO $pdo, string $table, string $column): ?string
{
    $stmt = $pdo->prepare('SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND COLUMN_NAME = :column');
    $stmt->execute([':table' => $table, ':column' => $column]);
    $type = $stmt->fetchColumn();
    return $type === false ? null : strtolower((string) $type);
}

function dropForeignKeys(PDO $pdo): void
{
    $stmt = $pdo->query(
        'SELECT TABLE_NAME, CONSTRAINT_NAME
         FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = DATABASE()
           AND REFERENCED_TABLE_NAME IS NOT NULL
         GROUP BY TABLE_NAME, CONSTRAINT_NAME'
    );

    foreach ($stmt->fetchAll() as $row) {
        $pdo->exec('ALTER TABLE ' . q($row['TABLE_NAME']) . ' DROP FOREIGN KEY ' . q($row['CONSTRAINT_NAME']));
    }
}

function dropIndexIfExists(PDO $pdo, string $table, string $index): void
{
    if ($index === 'PRIMARY') {
        return;
    }

    $stmt = $pdo->prepare('SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND INDEX_NAME = :index');
    $stmt->execute([':table' => $table, ':index' => $index]);
    if ((int) $stmt->fetchColumn() > 0) {
        $pdo->exec('ALTER TABLE ' . q($table) . ' DROP INDEX ' . q($index));
    }
}

function addIndex(PDO $pdo, string $table, array $definition): void
{
    if (!tableExists($pdo, $table)) {
        return;
    }

    $unique = end($definition) === true;
    if ($unique) {
        array_pop($definition);
    }

    foreach ($definition as $column) {
        if (!columnExists($pdo, $table, $column)) {
            return;
        }
    }

    $name = ($unique ? 'uniq_' : 'idx_') . $table . '_' . implode('_', $definition);
    dropIndexIfExists($pdo, $table, $name);
    $columns = implode(', ', array_map('q', $definition));
    $pdo->exec('ALTER TABLE ' . q($table) . ' ADD ' . ($unique ? 'UNIQUE ' : '') . 'INDEX ' . q($name) . " ({$columns})");
}

dropForeignKeys($pdo);

foreach ($relationshipIndexes as $table => $indexes) {
    if (!tableExists($pdo, $table)) {
        continue;
    }
    $indexStmt = $pdo->prepare('SELECT DISTINCT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND INDEX_NAME <> "PRIMARY"');
    $indexStmt->execute([':table' => $table]);
    foreach ($indexStmt->fetchAll(PDO::FETCH_COLUMN) as $indexName) {
        dropIndexIfExists($pdo, $table, (string) $indexName);
    }
}

foreach ($primaryKeys as $table => $column) {
    if (!tableExists($pdo, $table) || !columnExists($pdo, $table, $column)) {
        continue;
    }
    if (columnType($pdo, $table, $column) === 'char(36)') {
        continue;
    }

    $uuidColumn = $column . '_uuid';
    if (!columnExists($pdo, $table, $uuidColumn)) {
        $pdo->exec('ALTER TABLE ' . q($table) . ' ADD COLUMN ' . q($uuidColumn) . ' CHAR(36) NULL');
    }
    $pdo->exec('UPDATE ' . q($table) . ' SET ' . q($uuidColumn) . ' = UUID() WHERE ' . q($uuidColumn) . ' IS NULL OR ' . q($uuidColumn) . " = ''");
}

foreach ($references as $ref) {
    if (!tableExists($pdo, $ref['table']) || !tableExists($pdo, $ref['refTable'])) {
        continue;
    }
    if (!columnExists($pdo, $ref['table'], $ref['column']) || !columnExists($pdo, $ref['refTable'], $ref['refColumn'] . '_uuid')) {
        continue;
    }
    if (columnType($pdo, $ref['table'], $ref['column']) === 'char(36)') {
        continue;
    }

    $uuidColumn = $ref['column'] . '_uuid';
    if (!columnExists($pdo, $ref['table'], $uuidColumn)) {
        $pdo->exec('ALTER TABLE ' . q($ref['table']) . ' ADD COLUMN ' . q($uuidColumn) . ' CHAR(36) NULL');
    }
    $pdo->exec(
        'UPDATE ' . q($ref['table']) . ' child
         LEFT JOIN ' . q($ref['refTable']) . ' parent ON child.' . q($ref['column']) . ' = parent.' . q($ref['refColumn']) . '
         SET child.' . q($uuidColumn) . ' = parent.' . q($ref['refColumn'] . '_uuid') . '
         WHERE child.' . q($ref['column']) . ' IS NOT NULL'
    );
}

foreach ($references as $ref) {
    if (!tableExists($pdo, $ref['table']) || !columnExists($pdo, $ref['table'], $ref['column'] . '_uuid')) {
        continue;
    }
    if (columnType($pdo, $ref['table'], $ref['column']) === 'char(36)') {
        continue;
    }

    $pdo->exec('ALTER TABLE ' . q($ref['table']) . ' DROP COLUMN ' . q($ref['column']));
    $nullSql = $ref['nullable'] ? 'NULL' : 'NOT NULL';
    $pdo->exec('ALTER TABLE ' . q($ref['table']) . ' CHANGE ' . q($ref['column'] . '_uuid') . ' ' . q($ref['column']) . " CHAR(36) {$nullSql}");
}

foreach ($primaryKeys as $table => $column) {
    if (!tableExists($pdo, $table) || !columnExists($pdo, $table, $column . '_uuid')) {
        continue;
    }
    if (columnType($pdo, $table, $column) === 'char(36)') {
        continue;
    }

    $pdo->exec('ALTER TABLE ' . q($table) . ' MODIFY ' . q($column) . ' INT NOT NULL');
    $pdo->exec('ALTER TABLE ' . q($table) . ' DROP PRIMARY KEY');
    $pdo->exec('ALTER TABLE ' . q($table) . ' DROP COLUMN ' . q($column));
    $pdo->exec('ALTER TABLE ' . q($table) . ' CHANGE ' . q($column . '_uuid') . ' ' . q($column) . ' CHAR(36) NOT NULL DEFAULT (UUID())');
    $pdo->exec('ALTER TABLE ' . q($table) . ' ADD PRIMARY KEY (' . q($column) . ')');
    $pdo->exec('ALTER TABLE ' . q($table) . ' MODIFY ' . q($column) . ' CHAR(36) NOT NULL DEFAULT (UUID())');
}

foreach ($relationshipIndexes as $table => $indexes) {
    foreach ($indexes as $index) {
        addIndex($pdo, $table, $index);
    }
}

$foreignKeys = [
    ['product_types', 'category_id', 'product_categories', 'category_id', 'SET NULL'],
    ['product', 'category_id', 'product_categories', 'category_id', 'SET NULL'],
    ['product', 'type_id', 'product_types', 'type_id', 'RESTRICT'],
    ['product', 'measurement_unit_id', 'product_measurement_units', 'measurement_unit_id', 'SET NULL'],
    ['product', 'supplier_id', 'suppliers', 'supplier_id', 'SET NULL'],
    ['medicine_items', 'product_id', 'product', 'product_id', 'CASCADE'],
    ['grocery_items', 'product_id', 'product', 'product_id', 'CASCADE'],
    ['supplier_products', 'supplier_id', 'suppliers', 'supplier_id', 'CASCADE'],
    ['supplier_products', 'product_id', 'product', 'product_id', 'CASCADE'],
    ['product_inventory', 'product_id', 'product', 'product_id', 'CASCADE'],
    ['product_selling_stock', 'product_id', 'product', 'product_id', 'CASCADE'],
    ['product_selling_stock', 'source_inventory_id', 'product_inventory', 'inventory_id', 'SET NULL'],
    ['purchase_orders', 'supplier_id', 'suppliers', 'supplier_id', 'RESTRICT'],
    ['purchase_order_items', 'po_id', 'purchase_orders', 'po_id', 'CASCADE'],
    ['purchase_order_items', 'product_id', 'product', 'product_id', 'RESTRICT'],
    ['purchase_order_receiving', 'po_id', 'purchase_orders', 'po_id', 'CASCADE'],
    ['purchase_order_receiving_items', 'receiving_id', 'purchase_order_receiving', 'receiving_id', 'CASCADE'],
    ['purchase_order_receiving_items', 'po_item_id', 'purchase_order_items', 'po_item_id', 'CASCADE'],
    ['purchase_order_returns', 'po_id', 'purchase_orders', 'po_id', 'CASCADE'],
    ['purchase_order_returns', 'po_item_id', 'purchase_order_items', 'po_item_id', 'CASCADE'],
];

foreach ($foreignKeys as [$table, $column, $refTable, $refColumn, $deleteAction]) {
    if (!tableExists($pdo, $table) || !tableExists($pdo, $refTable) || !columnExists($pdo, $table, $column)) {
        continue;
    }
    $name = 'fk_' . $table . '_' . $column;
    $pdo->exec(
        'ALTER TABLE ' . q($table) . ' ADD CONSTRAINT ' . q($name) .
        ' FOREIGN KEY (' . q($column) . ') REFERENCES ' . q($refTable) . '(' . q($refColumn) . ')' .
        ' ON DELETE ' . $deleteAction
    );
}

$pdo->exec(
    "CREATE TABLE IF NOT EXISTS lookup_values (
        lookup_id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
        lookup_type VARCHAR(80) NOT NULL,
        lookup_code VARCHAR(120) NOT NULL,
        lookup_label VARCHAR(150) NOT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_lookup_values_type_code (lookup_type, lookup_code),
        KEY idx_lookup_values_type_active (lookup_type, is_active, sort_order)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
);

$pdo->exec(
    "CREATE TABLE IF NOT EXISTS entity_dimensions (
        dimension_id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
        entity_type VARCHAR(80) NOT NULL,
        entity_id CHAR(36) NOT NULL,
        dimension_type VARCHAR(80) NOT NULL,
        numeric_value DECIMAL(12,4) NULL,
        unit VARCHAR(50) NULL,
        text_value VARCHAR(150) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_entity_dimension (entity_type, entity_id, dimension_type, unit, text_value),
        KEY idx_entity_dimensions_entity (entity_type, entity_id),
        KEY idx_entity_dimensions_type (dimension_type, unit)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
);

$lookupSeed = $pdo->prepare(
    'INSERT INTO lookup_values (lookup_type, lookup_code, lookup_label, sort_order)
     VALUES (:lookup_type, :lookup_code, :lookup_label, :sort_order)
     ON DUPLICATE KEY UPDATE lookup_label = VALUES(lookup_label), sort_order = VALUES(sort_order), is_active = 1'
);
$lookupGroups = [
        'purchase_order_status' => ['Pending', 'Approved by the owner', 'In transit', 'Arrived', 'Delivered', 'Delivered with Return/Damage', 'Cancelled'],
    'payment_terms' => ['Cash', 'GCash', 'Bank Transfer'],
    'return_reason' => ['Expired', 'Broken package', 'Wrong item delivered', 'Incorrect quantity', 'Damaged during delivery', 'Other'],
    'stock_status' => ['Available', 'Low Stock', 'Out of Stock', 'Expired'],
];
foreach ($lookupGroups as $type => $values) {
    foreach (array_values($values) as $index => $label) {
        $lookupSeed->execute([
            ':lookup_type' => $type,
            ':lookup_code' => strtolower((string) preg_replace('/[^a-z0-9]+/i', '_', $label)),
            ':lookup_label' => $label,
            ':sort_order' => $index + 1,
        ]);
    }
}

$stmt = $pdo->query(
    "SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND COLUMN_KEY = 'PRI'
     ORDER BY TABLE_NAME"
);

echo json_encode([
    'status' => 'success',
    'primary_keys' => $stmt->fetchAll(),
], JSON_PRETTY_PRINT) . PHP_EOL;
