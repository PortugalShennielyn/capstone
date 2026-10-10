<?php
$allowedRoles = ['super_admin','admin','manager','supervisor','salesclerk','Admin','Sales Clerk','ro-super-admin','ro-admin','ro-manager','ro-supervisor','ro-sales-clerk','ro_sales_clerk'];
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once 'expiry_status_helpers.php';
require_once '../settings/settings_helpers.php';

function shelfDisplayBatchNumber(?string $batchNumber): string
{
    $batchNumber = trim((string)$batchNumber);
    if ($batchNumber === '') {
        return 'Not recorded';
    }
    return $batchNumber;
}

try {
    $statement = $pdo->query(
        "SELECT p.product_id,p.brand_name,p.product_name,p.barcode,p.status AS product_status,
                pc.category_name,pt.type_name,
                pmu.unit_name AS inventory_unit_name,
                COALESCE(NULLIF(pmu.unit_symbol,''),pmu.unit_name) AS inventory_unit_symbol,
                SUM(pss.quantity_remaining) AS shelf_quantity,
                SUM(CASE WHEN pss.quantity_remaining>0 AND (pss.expiration_date IS NULL OR pss.expiration_date>=CURDATE()) THEN pss.quantity_remaining ELSE 0 END) AS usable_shelf_quantity,
                MIN(CASE WHEN pss.quantity_remaining>0 THEN pss.expiration_date END) AS nearest_expiry_date,
                DATEDIFF(MIN(CASE WHEN pss.quantity_remaining>0 THEN pss.expiration_date END), CURDATE()) AS days_until_expiry,
                MIN(CASE WHEN pss.quantity_remaining>0 AND (pss.expiration_date IS NULL OR pss.expiration_date>=CURDATE()) THEN pss.expiration_date END) AS nearest_usable_expiry_date,
                DATEDIFF(MIN(CASE WHEN pss.quantity_remaining>0 AND (pss.expiration_date IS NULL OR pss.expiration_date>=CURDATE()) THEN pss.expiration_date END), CURDATE()) AS usable_days_until_expiry,
                COUNT(DISTINCT pss.selling_stock_id) AS shelf_batch_count,
                MIN(COALESCE(NULLIF(pi.batch_number,''), NULLIF(pss.batch_number,''), pss.source_batch_id)) AS single_batch_number,
                COALESCE(MAX(so.pos_enabled),0) AS has_pos_option,
                MAX(so.minimum_selling_price) AS selling_price,
                COALESCE(MAX(so.selling_unit_count),0) AS selling_unit_count,
                md.generic_name,classification_values.medicine_classification,classification_values.medicine_classification_badge,
                md.strength,md.strength_value,md.strength_unit,
                md.net_content_value,md.net_content_unit,md.dosage_form,
                COALESCE(md.package_type,gd.package_type,msd.package_type) AS package_type,
                gd.variant,gd.size,gd.net_weight,gd.unit,
                msd.variant AS medical_variant,msd.size AS medical_size,
                msd.material,msd.sterile_status,msd.package_type AS medical_package_type,
                msd.pack_content AS medical_pack_content,
                (SELECT GROUP_CONCAT(
                    COALESCE(NULLIF(TRIM(psv.value_text),''), NULLIF(TRIM(CONCAT(TRIM(TRAILING '.' FROM TRIM(TRAILING '0' FROM CAST(psv.value_number AS CHAR))), CASE WHEN spec_unit.unit_name IS NULL THEN '' ELSE CONCAT(' ',spec_unit.unit_name) END)),''))
                    ORDER BY COALESCE(pts.sort_order,2147483647),ps.specification_name SEPARATOR ' • ')
                 FROM product_specification_values psv
                 INNER JOIN product_specifications ps ON ps.specification_id=psv.specification_id
                 LEFT JOIN product_type_specifications pts ON pts.type_id=p.type_id AND pts.specification_id=psv.specification_id
                 LEFT JOIN product_measurement_units spec_unit ON spec_unit.measurement_unit_id=psv.measurement_unit_id
                 WHERE psv.product_id=p.product_id
                   AND LOWER(TRIM(ps.specification_name)) <> 'medicine classification') AS normalized_specification
         FROM product_selling_stock pss
         INNER JOIN product p ON p.product_id=pss.product_id
         LEFT JOIN product_inventory pi ON pi.inventory_id=pss.source_inventory_id
         LEFT JOIN product_categories pc ON pc.category_id=p.category_id
         LEFT JOIN product_types pt ON pt.type_id=p.type_id
         LEFT JOIN product_measurement_units pmu ON pmu.measurement_unit_id=p.inventory_unit_id
         LEFT JOIN medicine_details md ON md.product_id=p.product_id
         LEFT JOIN (
            SELECT psv.product_id,
                   psv.value_text AS medicine_classification,
                   CASE
                       WHEN LOWER(TRIM(psv.value_text)) = 'prescription (rx)' THEN 'Rx'
                       ELSE NULL
                   END AS medicine_classification_badge
            FROM product_specification_values psv
            INNER JOIN product_specifications ps ON ps.specification_id=psv.specification_id
            WHERE LOWER(TRIM(ps.specification_name))='medicine classification'
         ) classification_values ON classification_values.product_id=p.product_id
         LEFT JOIN grocery_details gd ON gd.product_id=p.product_id
         LEFT JOIN medical_supply_details msd ON msd.product_id=p.product_id
         LEFT JOIN (
             SELECT product_id,
                    MAX(CASE WHEN is_active=1 AND pos_enabled=1 THEN 1 ELSE 0 END) pos_enabled,
                    MIN(CASE WHEN is_active=1 AND pos_enabled=1 THEN selling_price END) minimum_selling_price,
                    SUM(CASE WHEN is_active=1 AND pos_enabled=1 THEN 1 ELSE 0 END) selling_unit_count
             FROM product_selling_options GROUP BY product_id
         ) so ON so.product_id=p.product_id
         WHERE pss.quantity_remaining>0
         GROUP BY p.product_id,p.brand_name,p.product_name,p.barcode,p.status,
                  pc.category_name,pt.type_name,pmu.unit_name,pmu.unit_symbol,p.price,
                  md.generic_name,classification_values.medicine_classification,classification_values.medicine_classification_badge,
                  md.strength,md.strength_value,md.strength_unit,
                  md.net_content_value,md.net_content_unit,md.dosage_form,md.package_type,
                  gd.package_type,gd.variant,gd.size,gd.net_weight,gd.unit,
                  msd.variant,msd.size,msd.material,msd.sterile_status,msd.package_type,msd.pack_content
         ORDER BY p.product_name,p.brand_name"
    );
    $rows = array_map(static function(array $row): array {
        $expiry = $row['nearest_expiry_date'] ?? null;
        $row['shelf_quantity'] = (int)$row['shelf_quantity'];
        $row['usable_shelf_quantity'] = (int)($row['usable_shelf_quantity'] ?? 0);
        $row['shelf_batch_count'] = (int)$row['shelf_batch_count'];
        $row['batch_display'] = $row['shelf_batch_count'] === 1
            ? shelfDisplayBatchNumber($row['single_batch_number'] ?? '')
            : ($row['shelf_batch_count'] . ' Batches');
        $row['has_pos_option'] = (int)$row['has_pos_option'];
        $row['selling_price'] = $row['selling_price'] === null ? null : round((float)$row['selling_price'], 2);
        $row['selling_unit_count'] = (int)($row['selling_unit_count'] ?? 0);
        $row['expiry_status'] = inventoryExpiryStatus($expiry, $row['days_until_expiry'] ?? null);
        $row['nearest_usable_expiry_status'] = inventoryExpiryStatus($row['nearest_usable_expiry_date'] ?? null, $row['usable_days_until_expiry'] ?? null);
        $row['pos_status'] = $row['product_status'] === 'Active' && $row['has_pos_option'] === 1 && $row['usable_shelf_quantity'] > 0 ? 'Available' : 'Unavailable';
        return $row;
    }, $statement->fetchAll(PDO::FETCH_ASSOC));
    if ($rows) {
        $productIds = array_values(array_unique(array_map(static fn($row) => (string)$row['product_id'], $rows)));
        $placeholders = implode(',', array_fill(0, count($productIds), '?'));
        $batchStmt = $pdo->prepare(
            "SELECT pss.product_id,
                    pss.selling_stock_id,
                    pss.source_batch_id AS batch_id,
                    COALESCE(NULLIF(pi.batch_number,''), NULLIF(pss.batch_number,''), pss.source_batch_id) AS batch_number,
                    pss.batch_number AS internal_batch_number,
                    pss.expiration_date AS expiry_date,
                    DATEDIFF(pss.expiration_date, CURDATE()) AS days_until_expiry,
                    pss.quantity_remaining AS shelf_quantity
             FROM product_selling_stock pss
             LEFT JOIN product_inventory pi ON pi.inventory_id=pss.source_inventory_id
             WHERE pss.product_id IN ({$placeholders})
               AND pss.quantity_remaining > 0
             ORDER BY pss.expiration_date IS NULL, pss.expiration_date ASC, pss.created_at ASC, pss.selling_stock_id ASC"
        );
        $batchStmt->execute($productIds);
        $batchesByProduct = [];
        foreach ($batchStmt->fetchAll(PDO::FETCH_ASSOC) as $batch) {
            $batch['shelf_quantity'] = (int)$batch['shelf_quantity'];
            $batch['display_batch_number'] = shelfDisplayBatchNumber($batch['batch_number'] ?? '');
            $batch['expiry_status'] = inventoryExpiryStatus($batch['expiry_date'] ?? null, $batch['days_until_expiry'] ?? null);
            $batchesByProduct[(string)$batch['product_id']][] = $batch;
        }
        foreach ($rows as &$row) {
            $row['batches'] = $batchesByProduct[(string)$row['product_id']] ?? [];
        }
        unset($row);
    }
    echo json_encode([
        'status' => 'success',
        'data' => $rows,
        'stockThresholds' => fetchStockThresholds($pdo),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $error) {
    http_response_code(500);
    echo json_encode(['status'=>'error','message'=>'Unable to load Shelf Inventory.']);
}
