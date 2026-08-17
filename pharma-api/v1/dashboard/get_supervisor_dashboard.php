<?php
require_once '../../config/db_connection.php';
$allowedRoles = ['supervisor', 'ro-supervisor', 'ro_supervisor'];
require_once '../../config/require_auth.php';
require_once '../inventory/inventory_stock_summary.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Only GET requests are allowed.']);
    exit;
}

function supervisorRows(PDO $pdo, string $sql, array $params = []): array
{
    $statement = $pdo->prepare($sql);
    $statement->execute($params);
    return $statement->fetchAll(PDO::FETCH_ASSOC);
}

function supervisorOptionalSalesRows(PDO $pdo, string $sql, array $params = []): array
{
    try {
        return supervisorRows($pdo, $sql, $params);
    } catch (PDOException $error) {
        if ((string) $error->getCode() !== '42S02') {
            throw $error;
        }
        error_log('Supervisor dashboard sales context unavailable: ' . $error->getMessage());
        return [];
    }
}

function supervisorPeriod(): array
{
    $today = new DateTimeImmutable('today');
    $preset = strtolower(trim((string) ($_GET['preset'] ?? 'last_30_days')));
    if (!in_array($preset, ['today', 'last_7_days', 'last_30_days', 'this_month', 'custom'], true)) {
        throw new InvalidArgumentException('Invalid overview period.');
    }
    if ($preset === 'today') {
        $start = $end = $today;
    } elseif ($preset === 'last_7_days') {
        $start = $today->modify('-6 days'); $end = $today;
    } elseif ($preset === 'this_month') {
        $start = $today->modify('first day of this month'); $end = $today;
    } elseif ($preset === 'custom') {
        $startValue = trim((string) ($_GET['start_date'] ?? ''));
        $endValue = trim((string) ($_GET['end_date'] ?? ''));
        $start = DateTimeImmutable::createFromFormat('!Y-m-d', $startValue) ?: null;
        $end = DateTimeImmutable::createFromFormat('!Y-m-d', $endValue) ?: null;
        if (!$start || !$end || $start->format('Y-m-d') !== $startValue || $end->format('Y-m-d') !== $endValue) {
            throw new InvalidArgumentException('Enter a valid start and end date.');
        }
    } else {
        $start = $today->modify('-29 days'); $end = $today;
    }
    if ($start > $end) throw new InvalidArgumentException('Start date cannot be after end date.');
    if ($start->diff($end)->days > 3660) throw new InvalidArgumentException('Date range cannot exceed ten years.');
    return [
        'preset' => $preset,
        'start_date' => $start->format('Y-m-d'),
        'end_date' => $end->format('Y-m-d'),
        'end_exclusive' => $end->modify('+1 day')->format('Y-m-d'),
    ];
}

function supervisorSpecificationSql(string $alias = 'p'): string
{
    return "TRIM(CONCAT_WS(' · ',
        NULLIF(CONCAT_WS(' ', NULLIF(md.generic_name,''), COALESCE(NULLIF(CONCAT_WS(' ',md.strength_value,md.strength_unit),''),NULLIF(md.strength,''))), ''),
        NULLIF(CONCAT_WS(' ',gd.variant,gd.size,gd.net_weight,gd.unit),''),
        NULLIF(COALESCE(md.dosage_form,gd.package_type,md.package_type),'')))";
}

try {
    $timezone = (string) ($pdo->query('SELECT timezone FROM system_settings ORDER BY setting_id LIMIT 1')->fetchColumn() ?: 'Asia/Manila');
    try { $zone = new DateTimeZone($timezone); } catch (Throwable $error) { $timezone = 'Asia/Manila'; $zone = new DateTimeZone($timezone); }
    date_default_timezone_set($timezone);
    $pdo->exec('SET time_zone = ' . $pdo->quote((new DateTime('now', $zone))->format('P')));
    $period = supervisorPeriod();
    $params = [':start_date' => $period['start_date'], ':end_date' => $period['end_exclusive']];

    $stockSql = inventoryStockSummarySql();
    $specification = supervisorSpecificationSql();
    $inventory = supervisorRows($pdo, "SELECT stock.*, p.product_name, p.brand_name, {$specification} specification,
            COALESCE(pc.category_name, 'Uncategorized') category_name,
            EXISTS(SELECT 1 FROM inventory_batches eb WHERE eb.product_id=stock.product_id AND eb.batch_status='active'
                AND (eb.storage_qty+COALESCE((SELECT SUM(ps.quantity_remaining) FROM product_selling_stock ps WHERE ps.source_batch_id=eb.batch_id),0))>0
                AND eb.expiry_date<CURDATE()) has_expired,
            EXISTS(SELECT 1 FROM inventory_batches xb WHERE xb.product_id=stock.product_id AND xb.batch_status='active'
                AND (xb.storage_qty+COALESCE((SELECT SUM(ps.quantity_remaining) FROM product_selling_stock ps WHERE ps.source_batch_id=xb.batch_id),0))>0
                AND xb.expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)) has_expiring
        FROM ({$stockSql}) stock
        INNER JOIN product p ON p.product_id=stock.product_id
        LEFT JOIN product_categories pc ON pc.category_id=p.category_id
        LEFT JOIN medicine_details md ON md.product_id=p.product_id
        LEFT JOIN grocery_details gd ON gd.product_id=p.product_id
        WHERE p.status='Active'");

    $health = ['Healthy Stock'=>0, 'Low Stock'=>0, 'Out of Stock'=>0, 'Expiring Soon'=>0, 'Expired'=>0];
    $distribution = [];
    $attention = [];
    $priority = ['Out of Stock'=>1, 'Expired'=>2, 'Low Stock'=>3, 'Expiring Soon'=>4];
    foreach ($inventory as $row) {
        $onHand = (int) $row['total_quantity'];
        $issue = (int) $row['has_expired'] ? 'Expired'
            : ((int) $row['has_expiring'] ? 'Expiring Soon'
            : ((string) $row['stock_status'] === 'Out of Stock' ? 'Out of Stock'
            : ((string) $row['stock_status'] === 'Low Stock' ? 'Low Stock' : 'Healthy Stock')));
        $health[$issue]++;
        $category = (string) $row['category_name'];
        $distribution[$category] ??= ['category'=>$category, 'shelf'=>0, 'storage'=>0, 'on_hand'=>0];
        $distribution[$category]['shelf'] += (int) $row['shelf_quantity'];
        $distribution[$category]['storage'] += (int) $row['storage_quantity'];
        $distribution[$category]['on_hand'] += $onHand;
        if (isset($priority[$issue])) {
            $attention[] = [
                'product_id'=>(string)$row['product_id'], 'product_name'=>(string)$row['product_name'],
                'brand_name'=>(string)$row['brand_name'], 'specification'=>(string)$row['specification'],
                'shelf'=>(int)$row['shelf_quantity'], 'storage'=>(int)$row['storage_quantity'],
                'on_hand'=>$onHand, 'issue'=>$issue, '_priority'=>$priority[$issue],
            ];
        }
    }
    usort($attention, static fn($a, $b) => [$a['_priority'], $a['on_hand'], $a['product_name']] <=> [$b['_priority'], $b['on_hand'], $b['product_name']]);
    $attention = array_slice(array_map(static function ($row) { unset($row['_priority']); return $row; }, $attention), 0, 8);

    $received = supervisorRows($pdo, "SELECT DATE(received_date) movement_date, SUM(received_qty) quantity
        FROM inventory_batches WHERE received_date>=:start_date AND received_date<:end_date GROUP BY DATE(received_date)", $params);
    $released = supervisorOptionalSalesRows($pdo, "SELECT DATE(o.completed_at) movement_date, SUM(i.quantity) quantity
        FROM sales_orders o INNER JOIN sales_order_items i ON i.order_id=o.order_id
        WHERE o.status='completed' AND o.completed_at>=:start_date AND o.completed_at<:end_date GROUP BY DATE(o.completed_at)", $params);
    $receivedMap = array_column($received, 'quantity', 'movement_date');
    $releasedMap = array_column($released, 'quantity', 'movement_date');
    $movement = [];
    for ($cursor = new DateTimeImmutable($period['start_date']); $cursor <= new DateTimeImmutable($period['end_date']); $cursor = $cursor->modify('+1 day')) {
        $date = $cursor->format('Y-m-d');
        $movement[] = ['date'=>$date, 'label'=>$cursor->format('M j'), 'received'=>(int)($receivedMap[$date] ?? 0), 'released'=>(int)($releasedMap[$date] ?? 0)];
    }

    $fastMoving = supervisorOptionalSalesRows($pdo, "SELECT i.product_id, i.product_name, i.brand_name, i.specification, SUM(i.quantity) quantity_moved,
            COALESCE(MAX(current_stock.total_quantity),0) on_hand
        FROM sales_orders o INNER JOIN sales_order_items i ON i.order_id=o.order_id
        LEFT JOIN ({$stockSql}) current_stock ON current_stock.product_id=i.product_id
        WHERE o.status='completed' AND o.completed_at>=:start_date AND o.completed_at<:end_date
        GROUP BY i.product_id,i.product_name,i.brand_name,i.specification
        ORDER BY quantity_moved DESC,i.product_name LIMIT 5", $params);
    foreach ($fastMoving as &$row) { $row['quantity_moved'] = (int) $row['quantity_moved']; $row['on_hand'] = (int) $row['on_hand']; } unset($row);

    $expiryRows = supervisorRows($pdo, "SELECT CASE
            WHEN b.expiry_date<CURDATE() THEN 'Expired'
            WHEN DATEDIFF(b.expiry_date,CURDATE())<=30 THEN '0–30 Days'
            WHEN DATEDIFF(b.expiry_date,CURDATE())<=60 THEN '31–60 Days'
            WHEN DATEDIFF(b.expiry_date,CURDATE())<=90 THEN '61–90 Days'
            ELSE 'Safe / >90 Days' END label,
            SUM(b.storage_qty+COALESCE(selling.shelf_qty,0)) quantity
        FROM inventory_batches b
        LEFT JOIN (SELECT source_batch_id,SUM(quantity_remaining) shelf_qty FROM product_selling_stock WHERE source_batch_id IS NOT NULL GROUP BY source_batch_id) selling ON selling.source_batch_id=b.batch_id
        WHERE b.batch_status='active' AND b.expiry_date IS NOT NULL
          AND (b.storage_qty+COALESCE(selling.shelf_qty,0))>0
        GROUP BY label ORDER BY MIN(b.expiry_date)");
    $expiryMap = array_column($expiryRows, 'quantity', 'label');
    $expiryRisk = array_map(static fn($label) => ['label'=>$label, 'quantity'=>(int)($expiryMap[$label] ?? 0)], ['Expired','0–30 Days','31–60 Days','61–90 Days','Safe / >90 Days']);

    $prStatusRows = supervisorRows($pdo, "SELECT status,COUNT(*) count FROM purchase_requests
        WHERE request_date>=:start_date AND request_date<:end_date GROUP BY status", $params);
    $prMap = array_column($prStatusRows, 'count', 'status');
    $prStatuses = array_map(static fn($status) => ['status'=>$status, 'count'=>(int)($prMap[$status] ?? 0)], ['Pending Supervisor Approval','Approved','Revision Requested','Rejected']);
    $pending = supervisorRows($pdo, "SELECT pr.pr_id,pr.pr_number,pr.request_date,pr.submitted_at,pr.status,
            COALESCE(NULLIF(u.full_name,''),u.username,'Unknown') requested_by,COUNT(pri.pr_item_id) items,
            CASE WHEN SUM(COALESCE(request_stock.total_quantity,0)=0)>0 THEN 'Out of Stock'
                 WHEN SUM(COALESCE(request_stock.total_quantity,0) BETWEEN 1 AND " . INVENTORY_LOW_STOCK_THRESHOLD . ")>0 THEN 'Low Stock'
                 ELSE 'Normal' END stock_risk
        FROM purchase_requests pr INNER JOIN users u ON u.user_id=pr.requested_by
        LEFT JOIN purchase_request_items pri ON pri.pr_id=pr.pr_id
        LEFT JOIN ({$stockSql}) request_stock ON request_stock.product_id=pri.product_id
        WHERE pr.status='Pending Supervisor Approval' AND pr.request_date>=:start_date AND pr.request_date<:end_date
        GROUP BY pr.pr_id,pr.pr_number,pr.request_date,pr.submitted_at,pr.status,u.full_name,u.username
        ORDER BY pr.submitted_at DESC,pr.created_at DESC LIMIT 5", $params);
    foreach ($pending as &$row) $row['items'] = (int) $row['items']; unset($row);

    echo json_encode([
        'status'=>'success', 'period'=>$period,
        'inventory_health'=>array_map(static fn($label, $count) => compact('label','count'), array_keys($health), array_values($health)),
        'stock_distribution'=>array_values($distribution), 'inventory_movement'=>$movement,
        'fast_moving_products'=>$fastMoving, 'inventory_attention'=>$attention,
        'expiry_risk'=>$expiryRisk, 'pr_status'=>$prStatuses, 'pending_purchase_requests'=>$pending,
    ], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
} catch (InvalidArgumentException $error) {
    http_response_code(422); echo json_encode(['status'=>'error','message'=>$error->getMessage()]);
} catch (Throwable $error) {
    error_log('Supervisor dashboard error: ' . $error->getMessage());
    http_response_code(500); echo json_encode(['status'=>'error','message'=>'Unable to load the supervisor dashboard.']);
}
