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
            t.movement_type, t.selected_quantity, t.selected_unit, t.base_quantity, t.base_unit,
            t.source_location, t.destination_location, t.created_at,
            COALESCE(u.full_name,u.username,'System') transferred_by,
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
        LEFT JOIN users u ON u.user_id=t.transferred_by
        LEFT JOIN inventory_transfer_allocations a ON a.transfer_id=t.transfer_id
        GROUP BY t.transfer_id,t.product_id,p.brand_name,p.product_name,pc.category_name,pt.type_name,
                 md.generic_name,md.strength,md.strength_value,md.strength_unit,md.net_content_value,md.net_content_unit,md.dosage_form,md.package_type,
                 gd.package_type,gd.variant,gd.size,gd.net_weight,gd.unit,
                 msd.variant,msd.size,msd.material,msd.sterile_status,msd.package_type,msd.pack_content,
                 t.movement_type,t.selected_quantity,
                 t.selected_unit,t.base_quantity,t.base_unit,t.source_location,t.destination_location,t.created_at,u.full_name,u.username
        ORDER BY t.created_at DESC");
    echo json_encode(['status'=>'success','data'=>$stmt->fetchAll(PDO::FETCH_ASSOC)], JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    http_response_code(500); echo json_encode(['status'=>'error','message'=>'Unable to load transfer history.','error'=>$e->getMessage()]);
}
