<?php
$allowedRoles = ['super_admin','admin','manager','supervisor','Admin','ro-super-admin','ro-admin','ro-manager','ro-supervisor'];
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';

try {
    $statement = $pdo->query(
        "SELECT p.product_id,p.brand_name,p.product_name,p.barcode,p.status AS product_status,
                pc.category_name,pt.type_name,
                pmu.unit_name AS inventory_unit_name,
                COALESCE(NULLIF(pmu.unit_symbol,''),pmu.unit_name) AS inventory_unit_symbol,
                SUM(pss.quantity_remaining) AS shelf_quantity,
                MIN(CASE WHEN pss.quantity_remaining>0 THEN pss.expiration_date END) AS nearest_expiry_date,
                COUNT(DISTINCT pss.selling_stock_id) AS shelf_batch_count,
                COALESCE(MAX(so.pos_enabled),0) AS has_pos_option,
                COALESCE(MAX(so.default_selling_price),p.price) AS selling_price,
                md.generic_name,md.strength,md.strength_value,md.strength_unit,
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
                 WHERE psv.product_id=p.product_id) AS normalized_specification
         FROM product_selling_stock pss
         INNER JOIN product p ON p.product_id=pss.product_id
         LEFT JOIN product_categories pc ON pc.category_id=p.category_id
         LEFT JOIN product_types pt ON pt.type_id=p.type_id
         LEFT JOIN product_measurement_units pmu ON pmu.measurement_unit_id=p.inventory_unit_id
         LEFT JOIN medicine_details md ON md.product_id=p.product_id
         LEFT JOIN grocery_details gd ON gd.product_id=p.product_id
         LEFT JOIN medical_supply_details msd ON msd.product_id=p.product_id
         LEFT JOIN (
             SELECT product_id,
                    MAX(CASE WHEN is_active=1 AND pos_enabled=1 THEN 1 ELSE 0 END) pos_enabled,
                    MAX(CASE WHEN is_active=1 AND pos_enabled=1 AND is_default=1 THEN selling_price END) default_selling_price
             FROM product_selling_options GROUP BY product_id
         ) so ON so.product_id=p.product_id
         WHERE pss.quantity_remaining>0
         GROUP BY p.product_id,p.brand_name,p.product_name,p.barcode,p.status,
                  pc.category_name,pt.type_name,pmu.unit_name,pmu.unit_symbol,p.price,
                  md.generic_name,md.strength,md.strength_value,md.strength_unit,
                  md.net_content_value,md.net_content_unit,md.dosage_form,md.package_type,
                  gd.package_type,gd.variant,gd.size,gd.net_weight,gd.unit,
                  msd.variant,msd.size,msd.material,msd.sterile_status,msd.package_type,msd.pack_content
         ORDER BY p.product_name,p.brand_name"
    );
    $rows = array_map(static function(array $row): array {
        $expiry = $row['nearest_expiry_date'] ?? null;
        $row['shelf_quantity'] = (int)$row['shelf_quantity'];
        $row['shelf_batch_count'] = (int)$row['shelf_batch_count'];
        $row['has_pos_option'] = (int)$row['has_pos_option'];
        $row['selling_price'] = $row['selling_price'] === null ? null : round((float)$row['selling_price'], 2);
        $row['expiry_status'] = !$expiry ? 'N/A'
            : ($expiry < date('Y-m-d') ? 'Expired'
                : ($expiry <= date('Y-m-d', strtotime('+30 days')) ? 'Expiring Soon' : 'Safe'));
        $row['pos_status'] = $row['product_status'] === 'Active' && $row['has_pos_option'] === 1 ? 'Available' : 'Unavailable';
        return $row;
    }, $statement->fetchAll(PDO::FETCH_ASSOC));
    echo json_encode(['status'=>'success','data'=>$rows], JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
} catch (Throwable $error) {
    http_response_code(500);
    echo json_encode(['status'=>'error','message'=>'Unable to load Shelf Inventory.']);
}
