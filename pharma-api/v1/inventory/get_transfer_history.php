<?php
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';

try {
    $stmt = $pdo->query("SELECT t.transfer_id, t.product_id, p.brand_name, p.product_name,
            pc.category_name,pt.type_name,md.generic_name,md.strength,md.strength_value,md.strength_unit,
            md.net_content_value,md.net_content_unit,md.dosage_form,
            COALESCE(md.package_type,gd.package_type,msd.package_type) package_type,
            gd.variant,gd.size,gd.net_weight,gd.unit,
            msd.variant medical_variant,msd.size medical_size,msd.material,msd.sterile_status,
            msd.package_type medical_package_type,msd.pack_content medical_pack_content,
            specs.normalized_specification,
            t.movement_type, t.selected_quantity, t.selected_unit, t.base_quantity, t.base_unit,
            t.source_location, t.destination_location, t.created_at,
            GROUP_CONCAT(CONCAT(COALESCE(a.batch_number,a.source_batch_id),' (',a.base_quantity,' ',t.base_unit,
                CASE WHEN a.expiry_date IS NULL THEN ')' ELSE CONCAT(', exp ',DATE_FORMAT(a.expiry_date,'%Y-%m-%d'),')') END)
                ORDER BY a.expiry_date IS NULL,a.expiry_date SEPARATOR '; ') allocations
        FROM inventory_transfers t
        INNER JOIN product p ON p.product_id=t.product_id
        LEFT JOIN product_categories pc ON pc.category_id=p.category_id
        LEFT JOIN product_types pt ON pt.type_id=p.type_id
        LEFT JOIN medicine_details md ON md.product_id=p.product_id
        LEFT JOIN grocery_details gd ON gd.product_id=p.product_id
        LEFT JOIN medical_supply_details msd ON msd.product_id=p.product_id
        LEFT JOIN (
            SELECT
                psv.product_id,
                GROUP_CONCAT(
                    COALESCE(
                        NULLIF(TRIM(psv.value_text), ''),
                        NULLIF(TRIM(CONCAT(
                            TRIM(TRAILING '.' FROM TRIM(TRAILING '0' FROM CAST(psv.value_number AS CHAR))),
                            CASE
                                WHEN COALESCE(NULLIF(pmu.unit_symbol, ''), pmu.unit_name) IS NULL THEN ''
                                ELSE CONCAT(' ', COALESCE(NULLIF(pmu.unit_symbol, ''), pmu.unit_name))
                            END
                        )), '')
                    )
                    ORDER BY COALESCE(pts.sort_order, 2147483647), ps.specification_name
                    SEPARATOR ' • '
                ) AS normalized_specification
            FROM product_specification_values psv
            INNER JOIN product AS specification_product ON specification_product.product_id = psv.product_id
            INNER JOIN product_specifications ps ON ps.specification_id = psv.specification_id
            LEFT JOIN product_type_specifications pts
                ON pts.type_id = specification_product.type_id
               AND pts.specification_id = psv.specification_id
            LEFT JOIN product_measurement_units pmu ON pmu.measurement_unit_id = psv.measurement_unit_id
            WHERE (NULLIF(TRIM(psv.value_text), '') IS NOT NULL OR psv.value_number IS NOT NULL)
              AND LOWER(TRIM(ps.specification_name)) <> 'medicine classification'
            GROUP BY psv.product_id
        ) specs ON specs.product_id = p.product_id
        LEFT JOIN inventory_transfer_allocations a ON a.transfer_id=t.transfer_id
        GROUP BY t.transfer_id,t.product_id,p.brand_name,p.product_name,pc.category_name,pt.type_name,
                 md.generic_name,md.strength,md.strength_value,md.strength_unit,md.net_content_value,md.net_content_unit,md.dosage_form,md.package_type,
                 gd.package_type,gd.variant,gd.size,gd.net_weight,gd.unit,
                 msd.variant,msd.size,msd.material,msd.sterile_status,msd.package_type,msd.pack_content,
                 specs.normalized_specification,
                 t.movement_type,t.selected_quantity,
                 t.selected_unit,t.base_quantity,t.base_unit,t.source_location,t.destination_location,t.created_at
        ORDER BY t.created_at DESC");
    echo json_encode(['status'=>'success','data'=>$stmt->fetchAll(PDO::FETCH_ASSOC)], JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    http_response_code(500); echo json_encode(['status'=>'error','message'=>'Unable to load transfer history.','error'=>$e->getMessage()]);
}
