<?php
$allowedRoles = ['super_admin','admin','manager','supervisor','inventory_manager','Admin','Supervisor','Inventory Manager','ro-super-admin','ro-admin','ro-manager','ro-supervisor','ro-inventory-manager'];
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once 'expiry_case_helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') expiryCaseReply(false, 'Only GET requests are allowed.', [], 405);

try {
    $statement = $pdo->query("SELECT c.*,
        CONCAT(IF(c.case_type='Return','RET-','DSP-'),LPAD(c.case_seq,4,'0')) AS case_number,
        p.product_name,p.brand_name,md.generic_name,pc.category_name,
        COALESCE(NULLIF(u.unit_symbol,''),u.unit_name,'units') AS base_unit,
        COALESCE(s.supplier_name,'') AS supplier_name,
        COALESCE(NULLIF(pi.batch_number,''),c.batch_id) AS batch_number,
        ib.expiry_date,ib.po_id,ib.po_item_id,
        COALESCE(actor.full_name,'Authorized user') AS created_by_name
        FROM inventory_resolution_cases c
        INNER JOIN inventory_batches ib ON ib.batch_id=c.batch_id
        INNER JOIN product p ON p.product_id=c.product_id
        LEFT JOIN medicine_details md ON md.product_id=p.product_id
        LEFT JOIN product_categories pc ON pc.category_id=p.category_id
        LEFT JOIN product_measurement_units u ON u.measurement_unit_id=p.inventory_unit_id
        LEFT JOIN suppliers s ON s.supplier_id=c.supplier_id
        LEFT JOIN product_inventory pi ON pi.inventory_id=ib.legacy_inventory_id
        LEFT JOIN users actor ON actor.user_id=c.created_by
        ORDER BY CASE WHEN c.status IN ('Replaced','Credited','Disposed') THEN 1 ELSE 0 END,
                 c.updated_at DESC,c.case_seq DESC");
    $cases = $statement->fetchAll(PDO::FETCH_ASSOC);
    $events = $pdo->query("SELECT e.case_id,e.status,e.description,e.reference_number,e.created_at,
            COALESCE(u.full_name,'Authorized user') actor_name
            FROM inventory_resolution_case_events e
            LEFT JOIN users u ON u.user_id=e.actor_id
            ORDER BY e.created_at DESC,e.event_id DESC")->fetchAll(PDO::FETCH_ASSOC);
    $byCase = [];
    foreach ($events as $event) $byCase[$event['case_id']][] = $event;
    foreach ($cases as &$case) {
        $case['shelf_qty'] = (int) $case['shelf_qty'];
        $case['storage_qty'] = (int) $case['storage_qty'];
        $case['received_qty'] = (int) $case['received_qty'];
        $case['unit_cost'] = (float) $case['unit_cost'];
        $case['events'] = $byCase[$case['case_id']] ?? [];
    }
    unset($case);
    expiryCaseReply(true, 'Cases loaded.', ['data'=>$cases]);
} catch (Throwable $error) {
    error_log('Load expiry cases failed: '.$error->getMessage());
    expiryCaseReply(false, 'Unable to load returns and disposals.', [], 500);
}
