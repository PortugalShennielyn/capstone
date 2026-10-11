<?php

$allowedRoles = ['super_admin', 'admin', 'manager', 'supervisor', 'cashier', 'salesclerk', 'ro-super-admin', 'ro-admin', 'ro-manager', 'ro-supervisor', 'ro-cashier', 'ro-sales-clerk', 'ro_super_admin', 'ro_admin', 'ro_manager', 'ro_supervisor', 'ro_cashier', 'ro_sales_clerk'];
require_once __DIR__ . '/../../config/db_connection.php';
if (!defined('REPORTS_LIBRARY_ONLY')) {
    require_once __DIR__ . '/../../config/require_auth.php';
}
require_once __DIR__ . '/reports_helpers.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Only GET requests are allowed.']);
    exit;
}

function reportProductSpecificationSql(string $alias = 'p'): string
{
    return "TRIM(CONCAT_WS(' · ',
        NULLIF(CONCAT_WS(' ', NULLIF(md.generic_name,''), COALESCE(NULLIF(md.strength,''),NULLIF(CONCAT_WS(' ',md.strength_value,md.strength_unit),''))), ''),
        NULLIF(CONCAT_WS(' ',gd.variant,gd.size,gd.net_weight,gd.unit),''),
        NULLIF(COALESCE(md.dosage_form,gd.package_type,md.package_type),'')))";
}

function reportCard(string $title, $value, string $format, string $icon, string $tone, string $tooltip = ''): array
{
    return array_filter(compact('title', 'value', 'format', 'icon', 'tone', 'tooltip'), static fn($value) => $value !== '');
}

function reportSortArray(array $rows, array $filters): array
{
    $key=$filters['sort'];if($key===''||!$rows||!array_key_exists($key,$rows[0]))return $rows;
    $direction=$filters['direction']==='ASC'?1:-1;
    usort($rows,static function($a,$b)use($key,$direction){$left=$a[$key]??null;$right=$b[$key]??null;return $direction*(is_numeric($left)&&is_numeric($right)?((float)$left<=>(float)$right):strnatcasecmp((string)$left,(string)$right));});
    return $rows;
}

function salesReport(PDO $pdo, array $f, array $role): array
{
    [$where, $params] = reportSalesWhere($f, $role);
    $paid = reportPaidSalesSubquery();
    $itemScoped = reportHasItemFilters($f);
    $summaryParams = $params;
    if ($itemScoped) {
        $summaryScopeSql = reportSalesItemScopeSubquery($f, $summaryParams, 'summary_scope');
        $summaryItemJoin = "INNER JOIN ({$summaryScopeSql}) item_scope ON item_scope.order_id=o.order_id";
        $summaryShare = 'CASE WHEN o.subtotal>0 THEN item_scope.line_subtotal/o.subtotal ELSE 0 END';
        $summaryItemCount = 'item_scope.item_count';
        $summarySubtotal = 'item_scope.line_subtotal';
        $summaryCost = 'item_scope.cost_of_goods';
        $summaryAllocatedQuantity = 'item_scope.allocated_quantity';
        $summaryQuantity = 'item_scope.item_count';
        $summaryMissingCostQuantity = 'item_scope.missing_cost_quantity';
        $summaryMissingCostBasis = 'item_scope.missing_cost_line_subtotal';
    } else {
        $summaryItemJoin = 'LEFT JOIN (SELECT sales_item.order_id,SUM(sales_item.quantity) item_count,
                SUM(sales_item.quantity) item_quantity,
                SUM(CASE WHEN batch_cost.allocated_quantity >= sales_item.quantity AND batch_cost.missing_cost_quantity=0 THEN sales_item.quantity
                    WHEN known_cost.unit_cost IS NOT NULL THEN sales_item.quantity ELSE COALESCE(batch_cost.allocated_quantity,0) END) allocated_quantity,
                SUM(CASE WHEN batch_cost.allocated_quantity >= sales_item.quantity AND batch_cost.missing_cost_quantity=0 THEN batch_cost.cost_of_goods
                    WHEN known_cost.unit_cost IS NOT NULL THEN sales_item.quantity*known_cost.unit_cost ELSE COALESCE(batch_cost.cost_of_goods,0) END) cost_of_goods,
                SUM(CASE WHEN (batch_cost.allocated_quantity >= sales_item.quantity AND batch_cost.missing_cost_quantity=0) OR known_cost.unit_cost IS NOT NULL THEN 0
                    ELSE COALESCE(batch_cost.missing_cost_quantity,0)+GREATEST(sales_item.quantity-COALESCE(batch_cost.allocated_quantity,0),0) END) missing_cost_quantity,
                SUM(sales_item.line_total * CASE WHEN (batch_cost.allocated_quantity >= sales_item.quantity AND batch_cost.missing_cost_quantity=0)
                        OR known_cost.unit_cost IS NOT NULL THEN 0
                    ELSE LEAST(1,(COALESCE(batch_cost.missing_cost_quantity,0)+GREATEST(sales_item.quantity-COALESCE(batch_cost.allocated_quantity,0),0))/NULLIF(sales_item.quantity,0)) END) missing_cost_line_subtotal
            FROM sales_order_items sales_item
            LEFT JOIN (SELECT order_item_id,SUM(quantity) allocated_quantity,
                    SUM(CASE WHEN unit_cost IS NOT NULL AND unit_cost>0 THEN quantity*unit_cost ELSE 0 END) cost_of_goods,
                    SUM(CASE WHEN unit_cost IS NULL OR unit_cost<=0 THEN quantity ELSE 0 END) missing_cost_quantity
                FROM sales_order_item_batch_allocations GROUP BY order_item_id) batch_cost ON batch_cost.order_item_id=sales_item.order_item_id
            LEFT JOIN (SELECT product_id,MIN(unit_cost) unit_cost FROM inventory_batches GROUP BY product_id
                HAVING MIN(unit_cost)>0 AND MIN(unit_cost)=MAX(unit_cost)) known_cost ON known_cost.product_id=sales_item.product_id
            GROUP BY sales_item.order_id) items ON items.order_id=o.order_id';
        $summaryShare = '1';
        $summaryItemCount = 'COALESCE(items.item_count,0)';
        $summarySubtotal = 'o.subtotal';
        $summaryCost = 'COALESCE(items.cost_of_goods,0)';
        $summaryAllocatedQuantity = 'COALESCE(items.allocated_quantity,0)';
        $summaryQuantity = 'COALESCE(items.item_quantity,0)';
        $summaryMissingCostQuantity = 'COALESCE(items.missing_cost_quantity,0)';
        $summaryMissingCostBasis = 'COALESCE(items.missing_cost_line_subtotal,0)';
    }
    $vatAmountSql = 'CASE WHEN pay.payment_total>0 THEN o.vat*pay.final_amount/pay.payment_total ELSE o.vat END';
    $summaryMissingCostNetSales = "CASE WHEN o.subtotal>0 THEN GREATEST(pay.final_amount-({$vatAmountSql}),0)*{$summaryMissingCostBasis}/o.subtotal ELSE 0 END";
    $summary = reportRow($pdo, "SELECT
        COALESCE(SUM(pay.final_amount*{$summaryShare}),0) net_sales,
        COUNT(DISTINCT o.order_id) transactions,
        COALESCE(SUM({$summaryItemCount}),0) items_sold,
        COALESCE(SUM(pay.final_amount*{$summaryShare})/NULLIF(COUNT(DISTINCT o.order_id),0),0) average_transaction,
        COALESCE(SUM({$summarySubtotal}),0) subtotal,
        COALESCE(SUM((COALESCE(pay.sales_clerk_discount,o.discount,0)+COALESCE(pay.cashier_discount_amount,0))*{$summaryShare}),0) discounts,
        COALESCE(SUM(GREATEST(pay.payment_total-o.vat,0)*{$summaryShare}),0) vatable_sales,
        COALESCE(SUM(CASE WHEN pay.payment_total>0 THEN o.vat*pay.final_amount/pay.payment_total ELSE o.vat END*{$summaryShare}),0) vat,
        COALESCE(SUM({$summaryCost}),0) cost_of_goods,
        COALESCE(SUM({$summaryAllocatedQuantity}),0) costed_quantity,
        COALESCE(SUM({$summaryQuantity}),0) total_quantity,
        COALESCE(SUM({$summaryMissingCostQuantity}),0) missing_cost_quantity,
        COALESCE(SUM({$summaryMissingCostNetSales}),0) missing_cost_net_sales,
        COALESCE(SUM(pay.refund_amount*{$summaryShare}),0) refunds
        FROM sales_orders o INNER JOIN ({$paid}) pay ON pay.order_id=o.order_id
        {$summaryItemJoin}
        WHERE {$where}", $summaryParams);

    $comparisonPeriod = null;
    $previousSummary = [];
    $previousPaymentValues = [];
    if (in_array($f['report_view'] ?? '', ['', 'Sales Summary', 'Management Overview'], true)) {
    $periodStart = new DateTimeImmutable($f['start_date']);
    $periodDays = $periodStart->diff(new DateTimeImmutable($f['end_date']))->days + 1;
    $previousStart = $periodStart->modify('-'.$periodDays.' days');
    $previousEnd = $periodStart->modify('-1 day');
    $previousFilters = $f;
    $previousFilters['start_date'] = $previousStart->format('Y-m-d');
    $previousFilters['end_date'] = $previousEnd->format('Y-m-d');
    $previousFilters['date_end_exclusive'] = $periodStart->format('Y-m-d');
    [$previousWhere, $previousParams] = reportSalesWhere($previousFilters, $role);
    $previousBaseParams = $previousParams;
    if ($itemScoped) {
        $previousScopeSql = reportSalesItemScopeSubquery($previousFilters, $previousParams, 'previous_summary_scope');
        $previousItemJoin = "INNER JOIN ({$previousScopeSql}) item_scope ON item_scope.order_id=o.order_id";
        $previousShare = 'CASE WHEN o.subtotal>0 THEN item_scope.line_subtotal/o.subtotal ELSE 0 END';
        $previousItemCount = 'item_scope.item_count';
        $previousSubtotal = 'item_scope.line_subtotal';
    } else {
        $previousItemJoin = 'LEFT JOIN (SELECT order_id,SUM(quantity) item_count FROM sales_order_items GROUP BY order_id) items ON items.order_id=o.order_id';
        $previousShare = '1';
        $previousItemCount = 'COALESCE(items.item_count,0)';
        $previousSubtotal = 'o.subtotal';
    }
    $previousSummary = reportRow($pdo, "SELECT
        COALESCE(SUM(pay.final_amount*{$previousShare}),0) net_sales,
        COUNT(DISTINCT o.order_id) transactions,
        COALESCE(SUM({$previousItemCount}),0) items_sold,
        COALESCE(SUM(pay.final_amount*{$previousShare})/NULLIF(COUNT(DISTINCT o.order_id),0),0) average_transaction,
        COALESCE(SUM((COALESCE(pay.sales_clerk_discount,o.discount,0)+COALESCE(pay.cashier_discount_amount,0))*{$previousShare}),0) discounts,
        COALESCE(SUM(GREATEST(pay.payment_total-o.vat,0)*{$previousShare}),0) vatable_sales,
        COALESCE(SUM(CASE WHEN pay.payment_total>0 THEN o.vat*pay.final_amount/pay.payment_total ELSE o.vat END*{$previousShare}),0) vat
        FROM sales_orders o INNER JOIN ({$paid}) pay ON pay.order_id=o.order_id
        {$previousItemJoin} WHERE {$previousWhere}", $previousParams);
    $previousPaymentParams = $previousBaseParams;
    $previousPaymentScope = '';
    $previousPaymentShare = '1';
    if ($itemScoped) {
        $previousPaymentScopeSql = reportSalesItemScopeSubquery($previousFilters, $previousPaymentParams, 'previous_payment_scope');
        $previousPaymentScope = "INNER JOIN ({$previousPaymentScopeSql}) payment_scope ON payment_scope.order_id=o.order_id";
        $previousPaymentShare = 'CASE WHEN o.subtotal>0 THEN payment_scope.line_subtotal/o.subtotal ELSE 0 END';
    }
    $previousPayments = reportRows($pdo, "SELECT UPPER(pay.payment_method) label,
        ROUND(SUM(pay.final_amount*{$previousPaymentShare}),2) value
        FROM sales_orders o INNER JOIN ({$paid}) pay ON pay.order_id=o.order_id {$previousPaymentScope}
        WHERE {$previousWhere} GROUP BY pay.payment_method", $previousPaymentParams);
    $previousPaymentValues = array_column($previousPayments, 'value', 'label');
    $comparisonPeriod = ['start'=>$previousStart->format('Y-m-d'),'end'=>$previousEnd->format('Y-m-d'),'days'=>$periodDays];
    }

    $group = in_array($f['group_by'], ['day','week','month','product','brand','category','product_type','cashier','sales_clerk','payment_method'], true) ? $f['group_by'] : 'day';
    $trendExpressions = [
        'day' => ["DATE(o.completed_at)", "DATE_FORMAT(DATE(o.completed_at),'%b %e')"],
        'week' => ["YEARWEEK(o.completed_at,3)", "CONCAT('Week ',WEEK(o.completed_at,3),', ',YEAR(o.completed_at))"],
        'month' => ["DATE_FORMAT(o.completed_at,'%Y-%m')", "DATE_FORMAT(o.completed_at,'%b %Y')"],
    ];
    if (isset($trendExpressions[$group])) {
        [$groupSql, $labelSql] = $trendExpressions[$group];
        $groupParams = $params;
        $groupShare = '1';
        $groupScopeJoin = '';
        if ($itemScoped) {
            $groupScopeSql = reportSalesItemScopeSubquery($f, $groupParams, 'trend_scope');
            $groupScopeJoin = "INNER JOIN ({$groupScopeSql}) item_scope ON item_scope.order_id=o.order_id";
            $groupShare = 'CASE WHEN o.subtotal>0 THEN item_scope.line_subtotal/o.subtotal ELSE 0 END';
        }
        $groupMetricJoin = $itemScoped ? $groupScopeJoin : $summaryItemJoin;
        $groupVat = "CASE WHEN pay.payment_total>0 THEN o.vat*pay.final_amount/pay.payment_total ELSE o.vat END";
        $groupRows = reportRows($pdo, "SELECT {$labelSql} label,MIN(DATE(o.completed_at)) raw_date,
            ROUND(SUM(pay.final_amount*{$groupShare}),2) value,
            ROUND(SUM({$groupVat}*{$groupShare}),2) vat,
            ROUND(SUM({$summaryCost}),2) cost_of_goods,
            SUM({$summaryMissingCostQuantity}) missing_cost_quantity,
            SUM({$summaryMissingCostNetSales}) missing_cost_sales,
            COUNT(DISTINCT o.order_id) secondary
            FROM sales_orders o INNER JOIN ({$paid}) pay ON pay.order_id=o.order_id {$groupMetricJoin} WHERE {$where}
            GROUP BY {$groupSql},{$labelSql} ORDER BY {$groupSql}", $groupParams);
        if ($role['management']) {
            $trendMissingQuantity = array_sum(array_map(static fn($row): float => (float)($row['missing_cost_quantity']??0), $groupRows));
            $trendCostRatio = $trendMissingQuantity > 0 ? reportKnownCostToSalesRatio($pdo) : null;
            foreach ($groupRows as &$groupRow) {
                $hasCostBasis = (float)($groupRow['missing_cost_quantity']??0) <= 0 || $trendCostRatio !== null;
                $groupRow['gross_profit'] = $hasCostBasis
                    ? round((float)$groupRow['value']-(float)$groupRow['vat']-(float)$groupRow['cost_of_goods']-(float)$groupRow['missing_cost_sales']*(float)($trendCostRatio??0),2)
                    : null;
            }
            unset($groupRow);
        }
        $groupChart = ['id'=>'sales-trend','title'=>'Net sales over time','type'=>'line','tone'=>'sales','rows'=>$groupRows];
    } elseif (in_array($group, ['cashier','sales_clerk','payment_method'], true)) {
        $groupSql = match ($group) {
            'cashier' => "COALESCE(NULLIF(u.full_name,''),u.username,'Unassigned')",
            'sales_clerk' => "COALESCE(NULLIF(u.full_name,''),u.username,'Unassigned')",
            default => 'UPPER(pay.payment_method)',
        };
        $join = $group === 'cashier' ? 'LEFT JOIN users u ON u.user_id=COALESCE(o.assigned_cashier_id,pay.cashier_id)'
            : ($group === 'sales_clerk' ? 'LEFT JOIN users u ON u.user_id=o.sales_clerk_id' : '');
        $groupParams = $params;
        $groupShare = '1';
        $groupScopeJoin = '';
        if ($itemScoped) {
            $groupScopeSql = reportSalesItemScopeSubquery($f, $groupParams, 'group_scope');
            $groupScopeJoin = "INNER JOIN ({$groupScopeSql}) item_scope ON item_scope.order_id=o.order_id";
            $groupShare = 'CASE WHEN o.subtotal>0 THEN item_scope.line_subtotal/o.subtotal ELSE 0 END';
        }
        $groupRows = reportRows($pdo, "SELECT {$groupSql} label,ROUND(SUM(pay.final_amount*{$groupShare}),2) value,COUNT(DISTINCT o.order_id) secondary
            FROM sales_orders o INNER JOIN ({$paid}) pay ON pay.order_id=o.order_id {$groupScopeJoin} {$join} WHERE {$where}
            GROUP BY {$groupSql} ORDER BY value DESC LIMIT 10", $groupParams);
        $groupChart = ['id'=>'sales-group','title'=>'Net sales by '.str_replace('_',' ',$group),'type'=>'bar','orientation'=>'horizontal','tone'=>'sales','rows'=>$groupRows];
    } else {
        $groupSql = match ($group) {
            'product' => "CONCAT(p.brand_name,' — ',p.product_name)",
            'brand' => "COALESCE(NULLIF(p.brand_name,''),'No brand')",
            'product_type' => "COALESCE(pt.type_name,'Unspecified')",
            default => "COALESCE(pc.category_name,'Uncategorized')",
        };
        $groupParams = $params;
        $productFilter = reportProductFilterSql($f, $groupParams);
        $groupRows = reportRows($pdo, "SELECT {$groupSql} label,
            ROUND(SUM(CASE WHEN o.subtotal>0 THEN i.line_total/o.subtotal*pay.final_amount ELSE 0 END),2) value,
            SUM(i.quantity) secondary
            FROM sales_orders o INNER JOIN ({$paid}) pay ON pay.order_id=o.order_id
            INNER JOIN sales_order_items i ON i.order_id=o.order_id INNER JOIN product p ON p.product_id=i.product_id
            LEFT JOIN product_categories pc ON pc.category_id=p.category_id LEFT JOIN product_types pt ON pt.type_id=p.type_id
            WHERE {$where}{$productFilter} GROUP BY {$groupSql} ORDER BY value DESC LIMIT 10", $groupParams);
        $groupChart = ['id'=>'sales-group','title'=>'Allocated net sales by '.str_replace('_',' ',$group),'type'=>'bar','orientation'=>'horizontal','tone'=>'sales','rows'=>$groupRows];
    }

    $topParams = $params;
    $topFilter = reportProductFilterSql($f, $topParams);
    $topProducts = reportRows($pdo, "SELECT CONCAT(p.brand_name,' — ',p.product_name) label,SUM(i.quantity) value
        FROM sales_orders o INNER JOIN ({$paid}) pay ON pay.order_id=o.order_id INNER JOIN sales_order_items i ON i.order_id=o.order_id
        INNER JOIN product p ON p.product_id=i.product_id WHERE {$where}{$topFilter}
        GROUP BY p.product_id,p.brand_name,p.product_name ORDER BY value DESC LIMIT 5", $topParams);
    $paymentParams = $params;
    $paymentShare = '1';
    $paymentScopeJoin = '';
    if ($itemScoped) {
        $paymentScopeSql = reportSalesItemScopeSubquery($f, $paymentParams, 'payment_scope');
        $paymentScopeJoin = "INNER JOIN ({$paymentScopeSql}) item_scope ON item_scope.order_id=o.order_id";
        $paymentShare = 'CASE WHEN o.subtotal>0 THEN item_scope.line_subtotal/o.subtotal ELSE 0 END';
    }
    $payment = reportRows($pdo, "SELECT UPPER(pay.payment_method) label,ROUND(SUM(pay.final_amount*{$paymentShare}),2) value,COUNT(DISTINCT o.order_id) secondary
        FROM sales_orders o INNER JOIN ({$paid}) pay ON pay.order_id=o.order_id {$paymentScopeJoin} WHERE {$where}
        GROUP BY pay.payment_method ORDER BY value DESC", $paymentParams);

    $rowWhere = $where;
    $rowParams = $params;
    if ($f['search'] !== '') {
        $rowWhere .= ' AND (o.order_no LIKE :order_search OR r.receipt_no LIKE :receipt_search OR o.customer_name LIKE :customer_search)';
        $rowParams[':order_search'] = $rowParams[':receipt_search'] = $rowParams[':customer_search'] = '%' . $f['search'] . '%';
    }
    $countParams = $rowParams;
    $rowShare = '1';
    if ($itemScoped) {
        $rowScopeSql = reportSalesItemScopeSubquery($f, $rowParams, 'row_scope');
        $rowItemJoin = "INNER JOIN ({$rowScopeSql}) item_scope ON item_scope.order_id=o.order_id";
        $rowShare = 'CASE WHEN o.subtotal>0 THEN item_scope.line_subtotal/o.subtotal ELSE 0 END';
        $rowItemCount = 'item_scope.item_count';
        $rowSubtotal = 'item_scope.line_subtotal';
    } else {
        $rowItemJoin = 'LEFT JOIN (SELECT order_id,SUM(quantity) item_count FROM sales_order_items GROUP BY order_id) items ON items.order_id=o.order_id';
        $rowItemCount = 'COALESCE(items.item_count,0)';
        $rowSubtotal = 'o.subtotal';
    }
    $count = reportRow($pdo, "SELECT COUNT(DISTINCT o.order_id) total FROM sales_orders o INNER JOIN ({$paid}) pay ON pay.order_id=o.order_id LEFT JOIN sales_receipts r ON r.order_id=o.order_id WHERE {$rowWhere}", $countParams);
    $sortMap = ['report_date'=>'o.completed_at','reference'=>'reference','cashier'=>'cashier','sales_clerk'=>'sales_clerk','final_total'=>'final_total','item_count'=>'item_count','subtotal'=>'subtotal','discount'=>'discount','vatable_sales'=>'vatable_sales','vat'=>'vat','payment_method'=>'payment_method','status'=>'status'];
    $sort = $sortMap[$f['sort']] ?? 'o.completed_at';
    $rowParams[':limit']=$f['page_size']; $rowParams[':offset']=$f['offset'];
    $rows = reportRows($pdo, "SELECT DATE_FORMAT(o.completed_at,'%Y-%m-%d %H:%i') report_date,o.order_id,
        COALESCE(r.receipt_no,o.order_no) reference,COALESCE(NULLIF(ca.full_name,''),ca.username,'Unassigned') cashier,
        COALESCE(NULLIF(sc.full_name,''),sc.username,'Unassigned') sales_clerk,{$rowItemCount} item_count,
        {$rowSubtotal} subtotal,(COALESCE(pay.sales_clerk_discount,o.discount,0)+COALESCE(pay.cashier_discount_amount,0))*{$rowShare} discount,
        GREATEST(pay.payment_total-o.vat,0)*{$rowShare} vatable_sales,CASE WHEN pay.payment_total>0 THEN o.vat*pay.final_amount/pay.payment_total ELSE o.vat END*{$rowShare} vat,
        pay.refund_amount*{$rowShare} refund_reversal,pay.final_amount*{$rowShare} final_total,UPPER(pay.payment_method) payment_method,'Completed' status
        FROM sales_orders o INNER JOIN ({$paid}) pay ON pay.order_id=o.order_id
        {$rowItemJoin}
        LEFT JOIN sales_receipts r ON r.order_id=o.order_id LEFT JOIN users ca ON ca.user_id=COALESCE(o.assigned_cashier_id,pay.cashier_id)
        LEFT JOIN users sc ON sc.user_id=o.sales_clerk_id WHERE {$rowWhere}
        ORDER BY {$sort} {$f['direction']} LIMIT :limit OFFSET :offset", $rowParams);

    $charts = [$groupChart];
    if ($group !== 'product') $charts[] = ['id'=>'top-products','title'=>'Top five products by units sold','type'=>'bar','orientation'=>'horizontal','tone'=>'inventory','rows'=>$topProducts];
    $workflowChart = reportMyOrderStatusChart($pdo, $f, $role);
    if ($workflowChart !== null) $charts[] = $workflowChart;
    $cashierReport = !$role['management'] && $role['cashier'];
    $paymentSales = array_column($payment, 'value', 'label');
    if ($cashierReport) {
      $sortMap = ['transaction_id'=>'o.order_no','date_time'=>'o.completed_at','items'=>$itemScoped?'item_scope.item_summary':'items.item_summary','total_amount'=>'total_amount','discount'=>'discount','vat'=>'vat','payment_method'=>'payment_method','status'=>'status'];
      $sort = $sortMap[$f['sort']] ?? 'o.completed_at';
      $cashierItemJoin = $itemScoped
        ? $rowItemJoin
        : "LEFT JOIN (SELECT order_id,GROUP_CONCAT(CONCAT(product_name,' (x',quantity,')') ORDER BY order_item_id SEPARATOR ', ') item_summary FROM sales_order_items GROUP BY order_id) items ON items.order_id=o.order_id";
      $cashierItems = $itemScoped ? "COALESCE(item_scope.item_summary,'')" : "COALESCE(items.item_summary,'')";
      $rows = reportRows($pdo, "SELECT o.order_no transaction_id,DATE_FORMAT(o.completed_at,'%Y-%m-%d %H:%i') date_time,
        {$cashierItems} items,pay.final_amount*{$rowShare} total_amount,
        (COALESCE(pay.sales_clerk_discount,o.discount,0)+COALESCE(pay.cashier_discount_amount,0))*{$rowShare} discount,
        CASE WHEN pay.payment_total>0 THEN o.vat*pay.final_amount/pay.payment_total ELSE o.vat END*{$rowShare} vat,UPPER(pay.payment_method) payment_method,o.status status
        FROM sales_orders o INNER JOIN ({$paid}) pay ON pay.order_id=o.order_id
        {$cashierItemJoin} LEFT JOIN sales_receipts r ON r.order_id=o.order_id
        WHERE {$rowWhere} ORDER BY {$sort} {$f['direction']} LIMIT :limit OFFSET :offset", $rowParams);
      $columns = ['transaction_id'=>'Transaction ID','date_time'=>'Date & Time','items'=>'Items','total_amount'=>'Total Amount','discount'=>'Discount','vat'=>'VAT','payment_method'=>'Payment Method','status'=>'Status'];
      $numericColumns = [];
      $currencyColumns = ['total_amount','discount','vat'];
      $summaryCards = [
        reportCard('Net Sales',(float)$summary['net_sales'],'currency','fa-peso-sign','blue'),
        reportCard('Completed Transactions',(int)$summary['transactions'],'number','fa-receipt','blue'),
        reportCard('Items Sold',(int)$summary['items_sold'],'number','fa-box','teal'),
        reportCard('Cash Sales',(float)($paymentSales['CASH']??0),'currency','fa-money-bill-wave','green'),
        reportCard('GCash Sales',(float)($paymentSales['GCASH']??0),'currency','fa-mobile-screen-button','blue'),
        reportCard('Discounts',(float)$summary['discounts'],'currency','fa-tags','amber'),
        reportCard('Total VAT Collected',(float)$summary['vat'],'currency','fa-percent','teal','VAT recorded on completed paid sales for the selected period and filters.'),
        reportCard('Average Transaction',(float)$summary['average_transaction'],'currency','fa-chart-line','purple'),
      ];
    } else {
      $columns=['report_date'=>'Date','reference'=>'Receipt / Transaction','cashier'=>'Cashier','sales_clerk'=>'Sales Clerk','item_count'=>'Items','subtotal'=>'Gross / Subtotal','discount'=>'Discount','vatable_sales'=>'VATable Sales','vat'=>'VAT','refund_reversal'=>'Refund / Reversal','final_total'=>'Final Sales','payment_method'=>'Payment Method','status'=>'Status'];
      $numericColumns=['item_count'];
      $currencyColumns=['subtotal','discount','vatable_sales','vat','refund_reversal','final_total'];
      $summaryCards=[
        reportCard('Net Sales',(float)$summary['net_sales'],'currency','fa-peso-sign','blue','Final completed amount paid, inclusive of calculated VAT and after discounts.'),
        reportCard('Completed Transactions',(int)$summary['transactions'],'number','fa-receipt','blue'),
        reportCard('Items Sold',(int)$summary['items_sold'],'number','fa-box','teal'),
        reportCard('Average Transaction',(float)$summary['average_transaction'],'currency','fa-chart-line','blue'),
        reportCard('Discounts',(float)$summary['discounts'],'currency','fa-tags','amber'),
        reportCard('VATable Sales',(float)$summary['vatable_sales'],'currency','fa-file-invoice-dollar','teal'),
        reportCard('Total VAT Collected',(float)$summary['vat'],'currency','fa-percent','blue','VAT recorded on completed paid sales for the selected period and filters.'),
      ];
    }
    if ($role['management']) {
        $hasSales = (int)($summary['transactions'] ?? 0) > 0;
        $missingCostQuantity = max(0, (int)($summary['missing_cost_quantity'] ?? 0));
        $costCoverageComplete = (int)($summary['costed_quantity'] ?? 0) >= (int)($summary['total_quantity'] ?? 0)
            && (int)($summary['missing_cost_quantity'] ?? 0) === 0;
        $knownCostRatio = $missingCostQuantity > 0 ? reportKnownCostToSalesRatio($pdo) : null;
        $canEstimateMissingCost = $missingCostQuantity > 0 && $knownCostRatio !== null;
        $estimatedMissingCost = $canEstimateMissingCost
            ? (float)($summary['missing_cost_net_sales'] ?? 0) * $knownCostRatio
            : 0.0;
        $profitValue = !$hasSales ? 0 : (($costCoverageComplete || $canEstimateMissingCost)
            ? round((float)$summary['net_sales'] - (float)$summary['vat'] - (float)$summary['cost_of_goods'] - $estimatedMissingCost, 2)
            : 'Incomplete history');
        $profitTitle = $canEstimateMissingCost ? 'Estimated Gross Profit' : 'Gross Profit';
        $profitTooltip = $canEstimateMissingCost
            ? 'Selected-period profit uses recorded costs where available. Costs for ' . number_format($missingCostQuantity) . ' uncosted units are estimated using the all-time cost-to-sales ratio of ' . number_format($knownCostRatio * 100, 1) . '% from sales with reliable costs.'
            : ($costCoverageComplete
                ? 'Selected-period completed net sales excluding VAT, less recorded or unambiguously reconstructed batch costs.'
                : 'The selected period includes ' . number_format($missingCostQuantity) . ' sold units without costs, and there are no reliable costed sales to calculate an estimate.');
        $summaryCards[] = reportCard(
            $profitTitle, $profitValue, is_numeric($profitValue) ? 'currency' : 'text', 'fa-chart-line', 'green',
            $profitTooltip
        );
    }
    $previousValues = [
        'Net Sales'=>(float)($previousSummary['net_sales']??0),
        'Completed Transactions'=>(float)($previousSummary['transactions']??0),
        'Transactions'=>(float)($previousSummary['transactions']??0),
        'Items Sold'=>(float)($previousSummary['items_sold']??0),
        'Average Transaction'=>(float)($previousSummary['average_transaction']??0),
        'Discounts'=>(float)($previousSummary['discounts']??0),
        'VATable Sales'=>(float)($previousSummary['vatable_sales']??0),
        'Total VAT Collected'=>(float)($previousSummary['vat']??0),
        'Cash Sales'=>(float)($previousPaymentValues['CASH']??0),
        'GCash Sales'=>(float)($previousPaymentValues['GCASH']??0),
    ];
    if ($comparisonPeriod !== null) {
        foreach ($summaryCards as &$card) {
            $previousValue = $previousValues[$card['title']] ?? null;
            $card['comparison'] = $previousValue !== null && $previousValue > 0
                ? ['percent'=>round(100*((float)$card['value']-$previousValue)/$previousValue,1),'previous_value'=>$previousValue]
                : null;
        }
        unset($card);
    }
    $notes = [
        'Net Sales = completed paid final amounts − recorded refunded amounts. Cancelled, unpaid, and incomplete transactions are excluded.',
        'Gross / Subtotal is the sum of VAT-inclusive item prices. Discount is the stored sales-clerk discount plus cashier discount. VATable Sales and VAT use the saved completed-order snapshot; VAT is extracted from, not added to, the final price. Refund / Reversal is the recorded refunded final amount.',
        'Product/category net sales are allocated proportionally from each transaction’s final amount using item line subtotal ÷ order subtotal. Transactions are aggregated before item joins to prevent duplicate totals.',
        'Total VAT Collected is the saved VAT from completed paid sales in the selected date range and filters, reduced proportionally for recorded refunds; it covers the sold items in those transactions.',
    ];
    if ($role['management']) $notes[] = 'Gross Profit = completed net sales after recorded refunds, excluding VAT, minus actual batch costs. When checkout allocations are missing, costs are reconstructed only if every recorded batch for that product has the same positive unit cost. Remaining unknown costs are estimated using the all-time cost-to-sales ratio from sales with reliable cost records and the card is labeled Estimated Gross Profit.';
    if ($workflowChart !== null) $notes[] = 'My orders by status counts orders created in the selected date range and assigned to your account.';
    $actions = [];
    if (!empty($role['cashier'])) $actions[] = ['title'=>'Shift reconciliation','description'=>'Review recorded payments and reconcile your cashier shift.','href'=>'cashier_shift_summary.html','label'=>'Open shift summary','tone'=>'teal'];
    if (!empty($role['sales_clerk'])) $actions[] = ['title'=>'Order follow-up','description'=>'Review your open, waiting, and completed sales orders.','href'=>'sales_clerk_orders.html','label'=>'Open order queue','tone'=>'indigo'];
    return [
      'summary'=>$summaryCards,
        'charts'=>$charts,
        'insights'=>[['title'=>'Payment methods','tone'=>'sales','rows'=>$payment,'format'=>'currency']],
        'comparison_period'=>$comparisonPeriod,
        'actions'=>$actions,
        'columns'=>$columns,
        'numeric_columns'=>$numericColumns,'currency_columns'=>$currencyColumns,'rows'=>$rows,
        'pagination'=>reportPagination((int)($count['total']??0),$f),
        'notes'=>$notes,
    ];
}

function inventoryBaseSql(array $f, array &$params): string
{
    $productFilter=reportProductFilterSql($f,$params);
    if($f['supplier_id']!==''){$params[':supplier_id']=$f['supplier_id'];$productFilter.=' AND b.supplier_id=:supplier_id';}
    $spec=reportProductSpecificationSql();
    $shelf='COALESCE(selling.shelf_qty,0)';
    $storage='GREATEST(b.storage_qty-COALESCE(b.expiry_quarantined_storage_qty,0),0)';
    $stock="({$shelf}+{$storage})";
    return "SELECT p.product_id,p.brand_name,p.product_name,{$spec} specification,COALESCE(pc.category_name,'Uncategorized') category,
        COALESCE(pt.type_name,'Unspecified') product_type,
        COALESCE(SUM(CASE WHEN b.batch_status='active' AND (b.expiry_date IS NULL OR b.expiry_date>=CURDATE()) THEN {$shelf} ELSE 0 END),0) shelf_stock,
        COALESCE(SUM(CASE WHEN b.batch_status='active' AND (b.expiry_date IS NULL OR b.expiry_date>=CURDATE()) THEN {$storage} ELSE 0 END),0) storage_stock,
        COALESCE(SUM(CASE WHEN b.batch_status='active' AND (b.expiry_date IS NULL OR b.expiry_date>=CURDATE()) THEN {$stock}*COALESCE(b.unit_cost,0) ELSE 0 END),0) inventory_value,
        10 reorder_level,
        CASE WHEN COALESCE(SUM(CASE WHEN b.batch_status='active' AND (b.expiry_date IS NULL OR b.expiry_date>=CURDATE()) THEN {$stock} ELSE 0 END),0)<0 THEN 'Negative Stock — Data Issue'
             WHEN COALESCE(SUM(CASE WHEN b.batch_status='active' AND (b.expiry_date IS NULL OR b.expiry_date>=CURDATE()) THEN {$stock} ELSE 0 END),0)=0 THEN 'Out of Stock'
             WHEN COALESCE(SUM(CASE WHEN b.batch_status='active' AND (b.expiry_date IS NULL OR b.expiry_date>=CURDATE()) THEN {$stock} ELSE 0 END),0)<=10 THEN 'Low Stock' ELSE 'Healthy' END stock_status,
        CASE WHEN COALESCE(SUM(CASE WHEN b.batch_status='active' AND (b.expiry_date IS NULL OR b.expiry_date>=CURDATE()) THEN {$stock} ELSE 0 END),0)<>0
             THEN SUM(CASE WHEN b.batch_status='active' AND (b.expiry_date IS NULL OR b.expiry_date>=CURDATE()) THEN {$stock}*COALESCE(b.unit_cost,0) ELSE 0 END)/
                  SUM(CASE WHEN b.batch_status='active' AND (b.expiry_date IS NULL OR b.expiry_date>=CURDATE()) THEN {$stock} ELSE 0 END) ELSE 0 END unit_cost
        FROM product p LEFT JOIN product_categories pc ON pc.category_id=p.category_id LEFT JOIN product_types pt ON pt.type_id=p.type_id
        LEFT JOIN medicine_details md ON md.product_id=p.product_id LEFT JOIN grocery_details gd ON gd.product_id=p.product_id
        LEFT JOIN inventory_batches b ON b.product_id=p.product_id
        LEFT JOIN (SELECT source_batch_id,SUM(GREATEST(quantity_remaining-expiry_quarantined_qty,0)) shelf_qty FROM product_selling_stock WHERE source_batch_id IS NOT NULL GROUP BY source_batch_id) selling ON selling.source_batch_id=b.batch_id
        WHERE 1=1{$productFilter}
        GROUP BY p.product_id,p.brand_name,p.product_name,pc.category_name,pt.type_name,md.generic_name,md.strength_value,md.strength_unit,md.strength,md.dosage_form,md.package_type,gd.variant,gd.size,gd.net_weight,gd.unit,gd.package_type";
}
function inventoryReport(PDO $pdo,array $f): array
{
    $params=[];$base=inventoryBaseSql($f,$params);$statusMap=['healthy'=>'Healthy','low'=>'Low Stock','out'=>'Out of Stock','negative'=>'Negative Stock — Data Issue'];
    $statusWhere=isset($statusMap[$f['stock_status']])?' WHERE stock_status=:stock_status':'';if($statusWhere)$params[':stock_status']=$statusMap[$f['stock_status']];
    $all=reportRows($pdo,"SELECT *,(shelf_stock+storage_stock) on_hand FROM ({$base}) inventory{$statusWhere}",$params);
    $s=['on_hand'=>0,'shelf'=>0,'storage'=>0,'low'=>0,'out'=>0,'value'=>0];$cat=[];$health=[];
    foreach($all as &$r){foreach(['shelf_stock','storage_stock','on_hand'] as $k)$r[$k]=(int)$r[$k];foreach(['unit_cost','inventory_value'] as $k)$r[$k]=(float)$r[$k];
        $s['on_hand']+=$r['on_hand'];$s['shelf']+=$r['shelf_stock'];$s['storage']+=$r['storage_stock'];$s['value']+=$r['inventory_value'];
        if($r['stock_status']==='Low Stock')$s['low']++;if($r['stock_status']==='Out of Stock')$s['out']++;
        $cat[$r['category']]=($cat[$r['category']]??0)+$r['on_hand'];$health[$r['stock_status']]=($health[$r['stock_status']]??0)+1;
    }unset($r);arsort($cat);
    $toRows=static fn($values)=>array_map(static fn($label,$value)=>compact('label','value'),array_keys($values),array_values($values));
    $all=reportSortArray($all,$f);
    return ['summary'=>[
        reportCard('Total On Hand',$s['on_hand'],'number','fa-boxes-stacked','teal'),reportCard('Shelf Stock',$s['shelf'],'number','fa-store','teal'),
        reportCard('Storage Stock',$s['storage'],'number','fa-warehouse','teal'),reportCard('Low-Stock Products',$s['low'],'number','fa-triangle-exclamation','amber'),
        reportCard('Out-of-Stock Products',$s['out'],'number','fa-box-open','red'),reportCard('Inventory Cost',$s['value'],'currency','fa-coins','teal')],
        'charts'=>[
            ['id'=>'inventory-category','title'=>'On-hand stock by category','type'=>'bar','orientation'=>'horizontal','tone'=>'inventory','rows'=>$toRows($cat)],
            ['id'=>'stock-health','title'=>'Stock-health distribution','type'=>'doughnut','tone'=>'status','rows'=>$toRows($health)]],
        'columns'=>['brand_name'=>'Brand','product_name'=>'Product','specification'=>'Specification','category'=>'Category','product_type'=>'Product Type','shelf_stock'=>'Shelf Stock','storage_stock'=>'Storage Stock','on_hand'=>'On Hand','reorder_level'=>'Reorder Level','stock_status'=>'Stock Status','unit_cost'=>'Unit Cost','inventory_value'=>'Inventory Value'],
        'numeric_columns'=>['shelf_stock','storage_stock','on_hand','reorder_level'],'currency_columns'=>['unit_cost','inventory_value'],
        'rows'=>array_slice($all,$f['offset'],$f['page_size']),'pagination'=>reportPagination(count($all),$f),
        'notes'=>['On Hand = active, unexpired shelf stock + storage stock. Damaged, returned, depleted, and expired quantities are excluded.','Inventory Cost = sum of each sellable batch quantity × inventory_batches.unit_cost. The existing system has no product reorder-level field, so the established report threshold of 10 units is displayed.']];
}

function supervisorInventoryPayload(array $report): array
{
    $report['summary'] = array_values(array_filter($report['summary'] ?? [], static fn(array $card): bool => ($card['title'] ?? '') !== 'Inventory Cost'));
    unset($report['columns']['unit_cost'], $report['columns']['inventory_value']);
    $report['currency_columns'] = array_values(array_diff($report['currency_columns'] ?? [], ['unit_cost', 'inventory_value']));
    if (isset($report['rows']) && is_array($report['rows'])) {
        foreach ($report['rows'] as &$row) {
            unset($row['unit_cost'], $row['inventory_value']);
        }
        unset($row);
    }
    $report['notes'] = [
        'On Hand = active, unexpired Shelf stock + Storage stock. Damaged, returned, depleted, and expired quantities are excluded.',
        'Cost and valuation figures are restricted for this role.'
    ];
    return $report;
}
function supervisorInventoryReport(PDO $pdo, array $filters): array
{
    return supervisorInventoryPayload(inventoryReport($pdo, $filters));
}
function purchaseAggregateSql(): string
{
    return "LEFT JOIN (SELECT po_id,COUNT(*) items,SUM(COALESCE(NULLIF(inventory_qty_ordered,0),quantity)) ordered_qty,SUM(line_total) item_total FROM purchase_order_items GROUP BY po_id) item ON item.po_id=po.po_id
      LEFT JOIN (SELECT pr.po_id,MAX(pr.received_date) received_date,SUM(pri.received_quantity) received_qty,SUM(pri.damaged_quantity) damaged_qty FROM purchase_order_receiving pr JOIN purchase_order_receiving_item_summary pri ON pri.receiving_id=pr.receiving_id GROUP BY pr.po_id) rec ON rec.po_id=po.po_id
      LEFT JOIN (SELECT por.po_id,
        SUM(CASE WHEN por.disposition='Return to Supplier' THEN por.return_quantity ELSE 0 END) returned_qty,
        SUM(CASE WHEN por.disposition IN ('Dispose','Quarantine') THEN por.action_base_quantity ELSE 0 END) rejected_qty
        FROM supplier_claim_legacy_projection por GROUP BY por.po_id) ret ON ret.po_id=po.po_id
      LEFT JOIN (SELECT po_id,SUM(amount) amount_paid FROM purchase_order_payments GROUP BY po_id) pay ON pay.po_id=po.po_id";
}

function purchasesReport(PDO $pdo,array $f): array
{
    $where=['po.created_at>=:start_date','po.created_at<:end_date'];$params=[':start_date'=>$f['start_date'],':end_date'=>$f['date_end_exclusive']];
    if($f['supplier_id']!==''){$where[]='po.supplier_id=:supplier_id';$params[':supplier_id']=$f['supplier_id'];}
    if($f['po_status']!==''){$where[]='LOWER(po.status)=LOWER(:po_status)';$params[':po_status']=$f['po_status'];}
        if($f['payment_state']==='outstanding'){$where[]="po.status='Delivered' AND GREATEST(po.final_payment-COALESCE(pay.amount_paid,0),0)>0";}
    if($f['search']!==''){$where[]='(po.po_number LIKE :po_search OR s.supplier_name LIKE :supplier_search)';$params[':po_search']=$params[':supplier_search']='%'.$f['search'].'%';}
    $whereSql=implode(' AND ',$where);$joins=purchaseAggregateSql();
    $poSalesJoin = "LEFT JOIN (
        SELECT allocation.po_id,SUM(allocation.quantity) tracked_units_sold,
          SUM(CASE WHEN allocation.unit_cost IS NOT NULL AND allocation.unit_cost>0 THEN allocation.quantity*allocation.unit_cost ELSE 0 END) tracked_cost_of_goods,
          SUM(CASE WHEN allocation.unit_cost IS NULL OR allocation.unit_cost<=0 THEN allocation.quantity ELSE 0 END) missing_cost_quantity,
          SUM(CASE WHEN orders.subtotal>0 AND items.quantity>0
              THEN GREATEST(payments.final_amount-CASE WHEN payments.payment_total>0 THEN orders.vat*payments.final_amount/payments.payment_total ELSE orders.vat END,0)
                *(items.line_total/orders.subtotal)*(allocation.quantity/items.quantity) ELSE 0 END) tracked_net_sales,
          COUNT(*) allocation_count
        FROM sales_order_item_batch_allocations allocation
        INNER JOIN sales_order_items items ON items.order_item_id=allocation.order_item_id
        INNER JOIN sales_orders orders ON orders.order_id=allocation.order_id AND orders.status='completed'
        INNER JOIN (".reportPaidSalesSubquery().") payments ON payments.order_id=orders.order_id
        WHERE allocation.po_id IS NOT NULL
        GROUP BY allocation.po_id
    ) po_sales ON po_sales.po_id=po.po_id";
    $summary=reportRow($pdo,"SELECT COUNT(*) total_orders,
      COALESCE(SUM(CASE WHEN po.status IN ('Draft','Pending') THEN COALESCE(po.total_amount,0) ELSE 0 END),0) open_commitments,
            COALESCE(SUM(CASE WHEN po.status='Delivered' THEN COALESCE(po.total_amount,0) ELSE 0 END),0) received_cost,
            COALESCE(SUM(CASE WHEN po.status='Delivered' THEN COALESCE(NULLIF(po.final_payment,0),po.total_amount,0) ELSE 0 END),0) accepted_cost,
            COALESCE(SUM(CASE WHEN po.status='Delivered' THEN po.final_payment ELSE 0 END),0) final_payable,
            COALESCE(SUM(CASE WHEN po.status='Delivered' THEN COALESCE(pay.amount_paid,0) ELSE 0 END),0) amount_paid,
            COALESCE(SUM(CASE WHEN po.status='Delivered' THEN GREATEST(po.final_payment-COALESCE(pay.amount_paid,0),0) ELSE 0 END),0) outstanding,
            COALESCE(SUM(CASE WHEN po.status='Delivered' THEN GREATEST(COALESCE(po.total_amount,0)-po.final_payment,0) ELSE 0 END),0) return_damage_value,
      COALESCE(SUM(CASE WHEN po.status='Cancelled' THEN COALESCE(po.total_amount,0) ELSE 0 END),0) cancelled_value
      FROM purchase_orders po JOIN suppliers s ON s.supplier_id=po.supplier_id {$joins} WHERE {$whereSql}",$params);
    $statuses=reportRows($pdo,"SELECT po.status label,COUNT(*) value FROM purchase_orders po JOIN suppliers s ON s.supplier_id=po.supplier_id {$joins} WHERE {$whereSql} GROUP BY po.status ORDER BY value DESC",$params);
    $supplierPerformance=reportRows($pdo,"SELECT s.supplier_name,
      COUNT(*) completed_deliveries,
      ROUND(100*SUM(rec.received_date<=po.expected_delivery_date)/NULLIF(SUM(po.expected_delivery_date IS NOT NULL),0),1) on_time_rate,
      ROUND(100*SUM(LEAST(COALESCE(rec.received_qty,0),COALESCE(item.ordered_qty,0)))/NULLIF(SUM(item.ordered_qty),0),1) fulfillment_rate,
      ROUND(100*SUM(GREATEST(COALESCE(rec.received_qty,0)-COALESCE(ret.returned_qty,0)-COALESCE(ret.rejected_qty,0),0))/NULLIF(SUM(rec.received_qty),0),1) accepted_rate,
      ROUND(100*SUM(COALESCE(ret.returned_qty,0)+COALESCE(ret.rejected_qty,0))/NULLIF(SUM(rec.received_qty),0),1) return_damage_rate,
      ROUND(AVG(GREATEST(DATEDIFF(rec.received_date,po.expected_delivery_date),0)),1) average_delay_days,
      ROUND(SUM(COALESCE(NULLIF(po.final_payment,0),po.total_amount,0)),2) accepted_value
      FROM purchase_orders po JOIN suppliers s ON s.supplier_id=po.supplier_id {$joins}
            WHERE {$whereSql} AND po.status='Delivered'
      GROUP BY s.supplier_id,s.supplier_name ORDER BY accepted_value DESC",$params);
    $count=reportRow($pdo,"SELECT COUNT(*) total FROM purchase_orders po JOIN suppliers s ON s.supplier_id=po.supplier_id {$joins} WHERE {$whereSql}",$params);
    $sortMap=['po_number'=>'po.po_number','order_date'=>'po.created_at','supplier_name'=>'s.supplier_name','ordered_qty'=>'ordered_qty','received_qty'=>'received_qty','accepted_qty'=>'accepted_qty','returned_qty'=>'returned_qty','damaged_qty'=>'damaged_qty','original_total'=>'po.total_amount','accepted_value'=>'accepted_value','final_payable'=>'po.final_payment','amount_paid'=>'amount_paid','remaining_balance'=>'remaining_balance','tracked_units_sold'=>'tracked_units_sold','tracked_net_sales'=>'tracked_net_sales','tracked_gross_profit'=>'tracked_gross_profit','delivery_status'=>'po.status','payment_status'=>'payment_status'];
    $sort=$sortMap[$f['sort']]??'po.created_at';$params[':limit']=$f['page_size'];$params[':offset']=$f['offset'];
    $rows=reportRows($pdo,"SELECT po.po_number,DATE(po.created_at) order_date,s.supplier_name,COALESCE(item.ordered_qty,0) ordered_qty,
      COALESCE(rec.received_qty,0) received_qty,GREATEST(COALESCE(rec.received_qty,0)-COALESCE(ret.returned_qty,0)-COALESCE(ret.rejected_qty,0),0) accepted_qty,
      COALESCE(ret.returned_qty,0) returned_qty,COALESCE(rec.damaged_qty,0) damaged_qty,po.total_amount original_total,
      CASE WHEN po.status='Delivered' THEN COALESCE(NULLIF(po.final_payment,0),po.total_amount,0) ELSE 0 END accepted_value,
                CASE WHEN po.status='Delivered' THEN po.final_payment ELSE 0 END final_payable,
      COALESCE(pay.amount_paid,0) amount_paid,
                CASE WHEN po.status='Delivered' THEN GREATEST(po.final_payment-COALESCE(pay.amount_paid,0),0) ELSE 0 END remaining_balance,
                COALESCE(po_sales.tracked_units_sold,0) tracked_units_sold,
                COALESCE(po_sales.tracked_net_sales,0) tracked_net_sales,
                COALESCE(po_sales.tracked_cost_of_goods,0) tracked_cost_of_goods,
                CASE WHEN COALESCE(po_sales.allocation_count,0)=0 OR COALESCE(po_sales.missing_cost_quantity,0)>0 THEN NULL
                     ELSE ROUND(COALESCE(po_sales.tracked_net_sales,0)-COALESCE(po_sales.tracked_cost_of_goods,0),2) END tracked_gross_profit,
                po.status delivery_status,CASE WHEN po.status='Cancelled' THEN 'Cancelled' WHEN po.status<>'Delivered' THEN 'Not Yet Payable' ELSE po.payment_status END payment_status
      FROM purchase_orders po JOIN suppliers s ON s.supplier_id=po.supplier_id {$joins} {$poSalesJoin} WHERE {$whereSql}
      ORDER BY {$sort} {$f['direction']} LIMIT :limit OFFSET :offset",$params);
    $supplierInsight=['title'=>'Supplier delivery performance','tone'=>'purchases','columns'=>['supplier_name'=>'Supplier','completed_deliveries'=>'Completed Deliveries','on_time_rate'=>'On-Time %','fulfillment_rate'=>'Fulfillment %','accepted_rate'=>'Accepted %','return_damage_rate'=>'Return / Damage %','average_delay_days'=>'Avg Delay (Days)','accepted_value'=>'Accepted Value'],'rows'=>$supplierPerformance,'currency_columns'=>['accepted_value'],'numeric_columns'=>['completed_deliveries','on_time_rate','fulfillment_rate','accepted_rate','return_damage_rate','average_delay_days']];
    return ['summary'=>[
        reportCard('Open Purchase Commitments',(float)$summary['open_commitments'],'currency','fa-hourglass-half','indigo'),
        reportCard('Received Purchase Cost',(float)$summary['received_cost'],'currency','fa-truck-ramp-box','indigo'),
        reportCard('Accepted Purchase Cost',(float)$summary['accepted_cost'],'currency','fa-box-circle-check','green'),
        reportCard('Final Payable',(float)$summary['final_payable'],'currency','fa-file-invoice-dollar','indigo'),
        reportCard('Amount Paid',(float)$summary['amount_paid'],'currency','fa-circle-check','green'),
        reportCard('Outstanding Payables',(float)$summary['outstanding'],'currency','fa-wallet','amber'),
        reportCard('Return / Damage Value',(float)$summary['return_damage_value'],'currency','fa-rotate-left','red'),
        reportCard('Cancelled PO Value',(float)$summary['cancelled_value'],'currency','fa-ban','gray')],
        'charts'=>[['id'=>'po-status','title'=>'Purchase orders by status','type'=>'doughnut','tone'=>'status','rows'=>$statuses]],
        'table_insights'=>[$supplierInsight],
        'columns'=>['po_number'=>'PO Number','order_date'=>'Order Date','supplier_name'=>'Supplier','ordered_qty'=>'Ordered Qty','received_qty'=>'Received Qty','accepted_qty'=>'Accepted Qty','returned_qty'=>'Returned Qty','damaged_qty'=>'Damaged Qty','original_total'=>'Original Total','accepted_value'=>'Accepted Value','final_payable'=>'Final Payable','amount_paid'=>'Amount Paid','remaining_balance'=>'Remaining Balance','tracked_units_sold'=>'Units Sold from PO (tracked)','tracked_net_sales'=>'Net Sales from PO (tracked)','tracked_cost_of_goods'=>'Cost of Goods Sold (tracked)','tracked_gross_profit'=>'Gross Profit from PO (tracked)','delivery_status'=>'Delivery Status','payment_status'=>'Payment Status'],
        'numeric_columns'=>['ordered_qty','received_qty','accepted_qty','returned_qty','damaged_qty','tracked_units_sold'],'currency_columns'=>['original_total','accepted_value','final_payable','amount_paid','remaining_balance','tracked_net_sales','tracked_cost_of_goods','tracked_gross_profit'],
        'rows'=>$rows,'pagination'=>reportPagination((int)($count['total']??0),$f),
        'notes'=>[
            'Draft and Pending POs do not have a monetary commitment until the actual supplier receipt total is entered at arrival.',
            'Original PO value uses purchase_orders.total_amount only. It never falls back to supplier reference costs or item line totals. For delivered POs, purchase_orders.final_payment remains the authoritative adjusted payable when present.',
            'Accepted Qty = received quantity − quantities returned for credit/replacement − rejected quantities. Accepted Value uses the adjusted PO payable without allocating the overall receipt total across items.',
            'Supplier performance includes only Delivered POs. On-time = received by expected date; fulfillment = received ÷ ordered; accepted = accepted ÷ received; return/damage = returned or rejected ÷ received; delay counts days after expected delivery.',
            'Amount Paid is retained in the response and detail table; Final Payable and Outstanding Payables are emphasized as management liabilities.'
            ,'PO gross profit compares tracked net sales excluding VAT with the actual batch costs for units sold from that PO. It includes only sales captured after batch allocation tracking was added; a blank gross-profit cell means there are no tracked sales or a cost is incomplete.'
        ]];
}

function expiryReport(PDO $pdo,array $f): array
{
    $params=[':expiry_end'=>date('Y-m-d',strtotime('+'.$f['expiry_days'].' days'))];$extra=reportProductFilterSql($f,$params);
    if($f['supplier_id']!==''){$extra.=' AND b.supplier_id=:supplier_id';$params[':supplier_id']=$f['supplier_id'];}
    $spec=reportProductSpecificationSql();$shelf='COALESCE(selling.shelf_qty,0)';$storage='GREATEST(b.storage_qty-COALESCE(b.expiry_quarantined_storage_qty,0),0)';$remaining="({$storage}+{$shelf})";
    $base="FROM inventory_batches b JOIN product p ON p.product_id=b.product_id LEFT JOIN product_categories pc ON pc.category_id=p.category_id
      LEFT JOIN medicine_details md ON md.product_id=p.product_id LEFT JOIN grocery_details gd ON gd.product_id=p.product_id LEFT JOIN suppliers s ON s.supplier_id=b.supplier_id
      LEFT JOIN (SELECT source_batch_id,SUM(GREATEST(quantity_remaining-expiry_quarantined_qty,0)) shelf_qty FROM product_selling_stock WHERE source_batch_id IS NOT NULL GROUP BY source_batch_id) selling ON selling.source_batch_id=b.batch_id
      WHERE b.expiry_date IS NOT NULL AND b.batch_status<>'depleted'
      AND {$remaining}>0 AND b.expiry_date<=:expiry_end{$extra}";
    $s=reportRow($pdo,"SELECT COALESCE(SUM(b.expiry_date<CURDATE()),0) expired_batches,COALESCE(SUM(b.expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(),INTERVAL 7 DAY)),0) expiring_7,
      COALESCE(SUM(b.expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(),INTERVAL 30 DAY)),0) expiring_30,COALESCE(SUM({$remaining}),0) quantity_risk,
      COALESCE(SUM({$remaining}*COALESCE(b.unit_cost,0)),0) cost_risk {$base}",$params);
    $windows=reportRows($pdo,"SELECT CASE WHEN b.expiry_date<CURDATE() THEN 'Expired' WHEN DATEDIFF(b.expiry_date,CURDATE())<=7 THEN '0–7 days' WHEN DATEDIFF(b.expiry_date,CURDATE())<=30 THEN '8–30 days' ELSE '31+ days' END label,SUM({$remaining}) value {$base} GROUP BY label ORDER BY MIN(b.expiry_date)",$params);
    $costs=reportRows($pdo,"SELECT COALESCE(pc.category_name,'Uncategorized') label,ROUND(SUM({$remaining}*COALESCE(b.unit_cost,0)),2) value {$base} GROUP BY pc.category_id,pc.category_name ORDER BY value DESC",$params);
    $count=reportRow($pdo,"SELECT COUNT(*) total {$base}",$params);$params[':limit']=$f['page_size'];$params[':offset']=$f['offset'];
    $sortMap=['product_name'=>'p.product_name','brand_name'=>'p.brand_name','expiry_date'=>'b.expiry_date','days_remaining'=>'days_remaining','quantity_at_risk'=>'quantity_at_risk','cost_at_risk'=>'cost_at_risk','expiry_status'=>'expiry_status'];$sort=$sortMap[$f['sort']]??'b.expiry_date';
    $rows=reportRows($pdo,"SELECT p.product_name,p.brand_name,{$spec} specification,COALESCE(b.legacy_inventory_id,b.batch_id) batch_reference,
      COALESCE(s.supplier_name,'Unknown') supplier,b.expiry_date,DATEDIFF(b.expiry_date,CURDATE()) days_remaining,{$shelf} shelf_qty,{$storage} storage_qty,
      {$remaining} quantity_at_risk,{$remaining}*COALESCE(b.unit_cost,0) cost_at_risk,
      CASE WHEN b.expiry_date<CURDATE() THEN 'Expired' WHEN DATEDIFF(b.expiry_date,CURDATE())<=7 THEN 'Critical' WHEN DATEDIFF(b.expiry_date,CURDATE())<=30 THEN 'Expiring Soon' ELSE 'Watch' END expiry_status
      {$base} ORDER BY {$sort} {$f['direction']} LIMIT :limit OFFSET :offset",$params);
    return ['summary'=>[
        reportCard('Expired Batches',(int)$s['expired_batches'],'number','fa-ban','red'),reportCard('Expiring in 7 Days',(int)$s['expiring_7'],'number','fa-triangle-exclamation','red'),
        reportCard('Expiring in 30 Days',(int)$s['expiring_30'],'number','fa-calendar-xmark','amber'),reportCard('Quantity at Risk',(int)$s['quantity_risk'],'number','fa-cubes','amber'),
        reportCard('Cost at Risk',(float)$s['cost_risk'],'currency','fa-coins','red')],
        'charts'=>[['id'=>'expiry-window','title'=>'Quantity at risk by expiry window','type'=>'bar','tone'=>'expiry','rows'=>$windows],['id'=>'expiry-cost','title'=>'Cost at risk by category','type'=>'bar','orientation'=>'horizontal','tone'=>'expiry','rows'=>$costs]],
        'empty_message'=>'No active batches expire within the selected period.',
        'columns'=>['product_name'=>'Product','brand_name'=>'Brand','specification'=>'Specification','batch_reference'=>'Batch / Receiving Reference','supplier'=>'Supplier','expiry_date'=>'Expiry Date','days_remaining'=>'Days Remaining','shelf_qty'=>'Shelf Qty','storage_qty'=>'Storage Qty','quantity_at_risk'=>'Qty at Risk','cost_at_risk'=>'Cost at Risk','expiry_status'=>'Expiry Status'],
        'numeric_columns'=>['days_remaining','shelf_qty','storage_qty','quantity_at_risk'],'currency_columns'=>['cost_at_risk'],'rows'=>$rows,'pagination'=>reportPagination((int)($count['total']??0),$f),
        'notes'=>['Only non-depleted batches with sellable Storage or Shelf quantity are included; quantities reserved for expiry resolution are excluded.','Cost at Risk = remaining batch units × inventory_batches.unit_cost.']];
}
function supervisorExpiryPayload(array $report): array
{
    $report['summary'] = array_values(array_filter($report['summary'] ?? [], static fn(array $card): bool => ($card['title'] ?? '') !== 'Cost at Risk'));
    $report['charts'] = array_values(array_filter($report['charts'] ?? [], static fn(array $chart): bool => ($chart['id'] ?? '') !== 'expiry-cost'));
    unset($report['columns']['cost_at_risk']);
    $report['currency_columns'] = array_values(array_diff($report['currency_columns'] ?? [], ['cost_at_risk']));
    if (isset($report['rows']) && is_array($report['rows'])) {
        foreach ($report['rows'] as &$row) {
            unset($row['cost_at_risk']);
        }
        unset($row);
    }
    $report['notes'] = [
        'Expiry quantities include sellable Shelf and Storage stock for non-depleted batches; stock reserved for expiry resolution is excluded.',
        'Cost-at-risk figures are restricted for this role.'
    ];
    return $report;
}
function supervisorExpiryReport(PDO $pdo, array $filters): array
{
    return supervisorExpiryPayload(expiryReport($pdo, $filters));
}
function productReport(PDO $pdo,array $f,array $role): array
{
    [$where,$params]=reportSalesWhere($f,$role);$paid=reportPaidSalesSubquery();$productParams=$params;$filter=reportProductFilterSql($f,$productParams);$spec=reportProductSpecificationSql();
    if(($f['rx_filter']??'')!==''){$filter.=" AND EXISTS (SELECT 1 FROM product_specification_values class_value INNER JOIN product_specifications class_spec ON class_spec.specification_id=class_value.specification_id WHERE class_value.product_id=p.product_id AND LOWER(TRIM(class_spec.specification_name))='medicine classification' AND ".($f['rx_filter']==='rx'?"LOWER(TRIM(class_value.value_text))='prescription (rx)'":"LOWER(TRIM(class_value.value_text))<>'prescription (rx)'").")";}
    $sales=reportRows($pdo,"SELECT p.product_id,p.brand_name,p.product_name,{$spec} specification,COALESCE(pc.category_name,'Uncategorized') category,
      COALESCE(SUM(i.quantity),0) sold_qty,COALESCE(SUM(CASE WHEN o.subtotal>0 THEN i.line_total/o.subtotal*pay.final_amount ELSE 0 END),0) revenue,MAX(o.completed_at) last_sale
      FROM product p LEFT JOIN product_categories pc ON pc.category_id=p.category_id LEFT JOIN medicine_details md ON md.product_id=p.product_id LEFT JOIN grocery_details gd ON gd.product_id=p.product_id
      LEFT JOIN (sales_order_items i INNER JOIN sales_orders o ON o.order_id=i.order_id INNER JOIN ({$paid}) pay ON pay.order_id=o.order_id AND {$where}) ON i.product_id=p.product_id
      WHERE 1=1{$filter} GROUP BY p.product_id,p.brand_name,p.product_name,pc.category_name,md.generic_name,md.strength_value,md.strength_unit,md.strength,md.dosage_form,md.package_type,gd.variant,gd.size,gd.net_weight,gd.unit,gd.package_type",$productParams);
    $inv=reportRows($pdo,"SELECT b.product_id,SUM(CASE WHEN b.batch_status='active' AND (b.expiry_date IS NULL OR b.expiry_date>=CURDATE()) THEN GREATEST(b.storage_qty-COALESCE(b.expiry_quarantined_storage_qty,0),0)+COALESCE(selling.shelf_qty,0) ELSE 0 END) on_hand FROM inventory_batches b LEFT JOIN (SELECT source_batch_id,SUM(GREATEST(quantity_remaining-expiry_quarantined_qty,0)) shelf_qty FROM product_selling_stock WHERE source_batch_id IS NOT NULL GROUP BY source_batch_id) selling ON selling.source_batch_id=b.batch_id GROUP BY b.product_id");
    $map=[];foreach($inv as $r)$map[$r['product_id']]=(int)$r['on_hand'];$selling=array_filter($sales,fn($r)=>(int)$r['sold_qty']>0);$avgSales=count($selling)?array_sum(array_column($selling,'sold_qty'))/count($selling):0;
    $stocked=array_filter($sales,fn($r)=>($map[$r['product_id']]??0)>0);$avgStock=count($stocked)?array_sum(array_map(fn($r)=>$map[$r['product_id']]??0,$stocked))/count($stocked):0;
    foreach($sales as &$r){$r['sold_qty']=(int)$r['sold_qty'];$r['revenue']=(float)$r['revenue'];$r['on_hand']=$map[$r['product_id']]??0;$r['sell_through_rate']=$r['sold_qty']+$r['on_hand']>0?round(100*$r['sold_qty']/($r['sold_qty']+$r['on_hand']),1):0;$r['days_since_last_sale']=$r['last_sale']!==null?(int)((new DateTime($r['last_sale']))->diff(new DateTime())->days):null;
      if($r['on_hand']>0&&$r['sold_qty']===0)$r['performance_status']='No Sales';elseif($r['on_hand']>=$avgStock&&$r['sold_qty']<=$avgSales*.25)$r['performance_status']='High Stock / Low Sales';elseif($r['sold_qty']>0&&$r['sold_qty']<=$avgSales*.25)$r['performance_status']='Slow Moving';elseif(count($selling)>1&&$r['sold_qty']>=$avgSales)$r['performance_status']='Fast Moving';else $r['performance_status']='Steady';}unset($r);
    usort($sales,fn($a,$b)=>$b['revenue']<=>$a['revenue']);$topQty=$sales;$topRevenue=$sales;usort($topQty,fn($a,$b)=>$b['sold_qty']<=>$a['sold_qty']);
    $chart=static fn($rows,$field)=>array_map(fn($r)=>['label'=>$r['brand_name'].' — '.$r['product_name'],'value'=>$r[$field]],array_slice(array_values(array_filter($rows,fn($r)=>$r[$field]>0)),0,5));
    $s=['sold'=>array_sum(array_column($sales,'sold_qty')),'revenue'=>array_sum(array_column($sales,'revenue')),'no'=>count(array_filter($sales,fn($r)=>$r['performance_status']==='No Sales')),'slow'=>count(array_filter($sales,fn($r)=>$r['performance_status']==='Slow Moving')),'high'=>count(array_filter($sales,fn($r)=>$r['performance_status']==='High Stock / Low Sales')),'fast'=>count(array_filter($sales,fn($r)=>$r['performance_status']==='Fast Moving'))];
    $sales=reportSortArray($sales,$f);
    return ['summary'=>[
        reportCard('Units Sold',$s['sold'],'number','fa-box','teal'),reportCard('Product Revenue',$s['revenue'],'currency','fa-chart-column','blue'),
        reportCard('Products with No Sales',$s['no'],'number','fa-circle-minus','gray'),reportCard('Slow-Moving Products',$s['slow'],'number','fa-gauge-low','amber'),reportCard('High Stock / Low Sales',$s['high'],'number','fa-boxes-stacked','red'),reportCard('Fast-Moving Products',$s['fast'],'number','fa-gauge-high','green')],
        'charts'=>[['id'=>'top-qty','title'=>'Top five products by sold quantity','type'=>'bar','orientation'=>'horizontal','tone'=>'inventory','rows'=>$chart($topQty,'sold_qty')],['id'=>'top-revenue','title'=>'Top five products by revenue','type'=>'bar','orientation'=>'horizontal','tone'=>'sales','rows'=>$chart($topRevenue,'revenue')]],
        'columns'=>['brand_name'=>'Brand','product_name'=>'Product','specification'=>'Specification','category'=>'Category','sold_qty'=>'Sold Qty','revenue'=>'Revenue','on_hand'=>'On Hand','sell_through_rate'=>'Sell-Through Rate','days_since_last_sale'=>'Days Since Last Sale','performance_status'=>'Performance Status'],
        'numeric_columns'=>['sold_qty','on_hand','sell_through_rate','days_since_last_sale'],'currency_columns'=>['revenue'],'rows'=>array_slice($sales,$f['offset'],$f['page_size']),'pagination'=>reportPagination(count($sales),$f),
        'notes'=>['Revenue allocates each completed transaction’s final paid amount proportionally to product line subtotal.','Sell-Through Rate = sold quantity ÷ (sold quantity + current on-hand) × 100.','Slow Moving = positive sold quantity at or below 25% of the selling-product average. Fast Moving requires more than one selling product and sold quantity at or above that average. Thresholds recalculate for the selected period.']];
}

function supervisorProductReport(PDO $pdo, array $f, array $role): array
{
    $report = productReport($pdo, $f, $role);
    $report['summary'] = array_values(array_filter($report['summary'], static fn($card) => $card['title'] !== 'Product Revenue'));
    $report['charts'] = array_values(array_filter($report['charts'], static fn($chart) => $chart['id'] !== 'top-revenue'));
    unset($report['columns']['revenue']);
    $report['currency_columns'] = [];
    foreach ($report['rows'] as &$row) unset($row['revenue']);
    unset($row);
    $report['notes'] = [
        'Product performance is based on quantities sold during the selected period and current on-hand inventory.',
        'Sell-Through Rate = sold quantity ÷ (sold quantity + current on-hand) × 100. Financial sales values are not included for Inventory Supervisor accounts.'
    ];
    return $report;
}

function staffReport(PDO $pdo,array $f,array $role): array
{
    [$where,$params]=reportSalesWhere($f,$role);$paid=reportPaidSalesSubquery();
    $query=static function(PDO $pdo,string $where,array $params,string $paid,string $group,string $label):array{
      $rows=reportRows($pdo,"SELECT {$group} user_id,COALESCE(NULLIF(u.full_name,''),u.username,'Unassigned') staff_name,
        COUNT(DISTINCT o.order_id) completed_transactions,COALESCE(SUM(items.item_count),0) items_processed,SUM(pay.final_amount) net_sales,
        AVG(pay.final_amount) average_transaction,SUM(COALESCE(pay.sales_clerk_discount,o.discount,0)+COALESCE(pay.cashier_discount_amount,0)) discounts,MAX(o.completed_at) last_activity
        FROM sales_orders o INNER JOIN ({$paid}) pay ON pay.order_id=o.order_id LEFT JOIN users u ON u.user_id={$group}
        LEFT JOIN (SELECT order_id,SUM(quantity) item_count FROM sales_order_items GROUP BY order_id) items ON items.order_id=o.order_id
        WHERE {$where} AND {$group} IS NOT NULL GROUP BY {$group},u.full_name,u.username ORDER BY net_sales DESC",$params);
      foreach($rows as &$r)$r=['staff_role'=>$label]+$r;unset($r);return $rows;};
    $cashiers=($role['management']||$role['cashier'])?$query($pdo,$where,$params,$paid,'COALESCE(o.assigned_cashier_id,pay.cashier_id)','Cashier'):[];
    $clerks=($role['management']||$role['sales_clerk'])?$query($pdo,$where,$params,$paid,'o.sales_clerk_id','Sales Clerk'):[];$rows=array_merge($cashiers,$clerks);usort($rows,fn($a,$b)=>(float)$b['net_sales']<=>(float)$a['net_sales']);
    $overall=reportRow($pdo,"SELECT COUNT(DISTINCT o.order_id) transactions,SUM(pay.final_amount) net_sales,SUM(COALESCE(pay.sales_clerk_discount,o.discount,0)+COALESCE(pay.cashier_discount_amount,0)) discounts FROM sales_orders o INNER JOIN ({$paid}) pay ON pay.order_id=o.order_id WHERE {$where}",$params);
    $chart=static fn($r,$field)=>array_map(fn($x)=>['label'=>$x['staff_name'],'value'=>$x[$field]],$r);
    $rows=reportSortArray($rows,$f);
    return ['summary'=>[
      reportCard('Active Staff in Period',count($rows),'number','fa-users','indigo'),reportCard('Completed Transactions',(int)($overall['transactions']??0),'number','fa-receipt','blue'),
      reportCard('Net Sales Processed',(float)($overall['net_sales']??0),'currency','fa-peso-sign','blue'),reportCard('Average Transaction',($overall['transactions']??0)?(float)$overall['net_sales']/(int)$overall['transactions']:0,'currency','fa-chart-line','blue'),
      reportCard('Discounts Processed',(float)($overall['discounts']??0),'currency','fa-tags','amber')],
      'charts'=>[['id'=>'cashier-transactions','title'=>'Completed transactions by cashier','type'=>'bar','orientation'=>'horizontal','tone'=>'purchases','rows'=>$chart($cashiers,'completed_transactions')],['id'=>'staff-sales','title'=>'Net sales processed by staff','type'=>'bar','orientation'=>'horizontal','tone'=>'sales','rows'=>$chart($rows,'net_sales')]],
      'columns'=>['staff_name'=>'Staff','staff_role'=>'Role','completed_transactions'=>'Completed Transactions','items_processed'=>'Items Processed','net_sales'=>'Net Sales','average_transaction'=>'Average Transaction','discounts'=>'Discounts','last_activity'=>'Last Activity'],
      'numeric_columns'=>['completed_transactions','items_processed'],'currency_columns'=>['net_sales','average_transaction','discounts'],'rows'=>array_slice($rows,$f['offset'],$f['page_size']),'pagination'=>reportPagination(count($rows),$f),
      'notes'=>['Staff metrics include completed orders with paid payment records only. Active Staff means a cashier or sales clerk with at least one qualifying transaction in the period.','Non-management users are restricted to their own activity by the backend.']];
}

function supervisorPurchaseRequestReport(PDO $pdo, array $f): array
{
    $params = [':start_date'=>$f['start_date'], ':end_date'=>$f['date_end_exclusive']];
    $statusRows = reportRows($pdo, "SELECT status label,COUNT(*) value FROM purchase_requests WHERE request_date>=:start_date AND request_date<:end_date GROUP BY status ORDER BY value DESC", $params);
    $summaryMap = array_column($statusRows, 'value', 'label');
    $pendingAging = reportRow($pdo, "SELECT COUNT(*) total FROM purchase_requests WHERE status='Pending Supervisor Approval' AND request_date<DATE_SUB(CURDATE(),INTERVAL 2 DAY)");
    $count = reportRow($pdo, "SELECT COUNT(*) total FROM purchase_requests WHERE request_date>=:start_date AND request_date<:end_date", $params);
    $params[':limit']=$f['page_size']; $params[':offset']=$f['offset'];
    $rows = reportRows($pdo, "SELECT pr.pr_number,pr.request_date,COALESCE(NULLIF(u.full_name,''),u.username,'Unknown') requested_by,
        COUNT(pri.pr_item_id) item_count,COALESCE(SUM(pri.requested_qty),0) requested_quantity,pr.status,
        CASE WHEN pr.status='Pending Supervisor Approval' THEN DATEDIFF(CURDATE(),pr.request_date) ELSE NULL END days_waiting,
        COALESCE(NULLIF(su.full_name,''),su.username,'—') reviewed_by,pr.decided_at
        FROM purchase_requests pr INNER JOIN users u ON u.user_id=pr.requested_by
        LEFT JOIN users su ON su.user_id=pr.supervisor_user_id LEFT JOIN purchase_request_items pri ON pri.pr_id=pr.pr_id
        WHERE pr.request_date>=:start_date AND pr.request_date<:end_date
        GROUP BY pr.pr_id,pr.pr_number,pr.request_date,u.full_name,u.username,pr.status,su.full_name,su.username,pr.decided_at
        ORDER BY (pr.status='Pending Supervisor Approval') DESC,
            CASE WHEN pr.status='Pending Supervisor Approval' THEN pr.request_date END ASC,
            pr.request_date DESC,pr.created_at DESC LIMIT :limit OFFSET :offset", $params);
    return [
        'summary'=>[
            reportCard('Pending Approval',(int)($summaryMap['Pending Supervisor Approval']??0),'number','fa-clock','indigo'),
            reportCard('Pending over 2 days',(int)($pendingAging['total']??0),'number','fa-hourglass-half','amber'),
            reportCard('Approved',(int)($summaryMap['Approved']??0),'number','fa-circle-check','green'),
            reportCard('Revision Requested',(int)($summaryMap['Revision Requested']??0),'number','fa-rotate-left','amber'),
            reportCard('Rejected',(int)($summaryMap['Rejected']??0),'number','fa-circle-xmark','red')],
        'charts'=>[['id'=>'pr-status','title'=>'Purchase request approval status','type'=>'doughnut','tone'=>'status','rows'=>$statusRows,'href'=>'supervisor_approval.html','link_label'=>'Open approvals']],
        'columns'=>['pr_number'=>'PR Number','request_date'=>'Request Date','requested_by'=>'Requested By','item_count'=>'Items','requested_quantity'=>'Requested Qty','status'=>'Status','reviewed_by'=>'Reviewed By','decided_at'=>'Decision Date'],
        'numeric_columns'=>['item_count','requested_quantity','days_waiting'],'currency_columns'=>[],'rows'=>$rows,
        'pagination'=>reportPagination((int)($count['total']??0),$f),
        'actions'=>[['title'=>'Purchase request follow-up','description'=>'Review pending requests; the oldest approvals are listed first.','href'=>'supervisor_approval.html','label'=>'Open approval queue','tone'=>'indigo']],
        'notes'=>['This Inventory Supervisor view contains purchase request quantities and approval activity only; purchase costs and payment information are excluded.']];
}

function supervisorOverviewReport(PDO $pdo, array $f, array $role): array
{
    $filters=$f;
    foreach(['category_id','type_id','product_id','brand','supplier_id','stock_status','search'] as $key) $filters[$key]='';
    $inventory=inventoryReport($pdo,$filters);
    $expiryFilters=$filters; $expiryFilters['expiry_days']=90;
    $expiry=expiryReport($pdo,$expiryFilters);
    $products=supervisorProductReport($pdo,$filters,$role);
    $pendingRequests=(int)(reportRow($pdo,"SELECT COUNT(*) total FROM purchase_requests WHERE status='Pending Supervisor Approval'")['total']??0);
    $overdueRequests=(int)(reportRow($pdo,"SELECT COUNT(*) total FROM purchase_requests WHERE status='Pending Supervisor Approval' AND request_date<DATE_SUB(CURDATE(),INTERVAL 2 DAY)")['total']??0);
    $dateQuery='start_date='.rawurlencode($f['start_date']).'&end_date='.rawurlencode($f['end_date']);

    // ⚠️ Purchase Requests have their own section — they are NOT part of this Overview.
    return [
        'summary'=>array_slice($inventory['summary'],0,5),
        'charts'=>[$inventory['charts'][1],$products['charts'][0],$expiry['charts'][0]],
        'attention'=>[
            ['singular'=>'Purchase request awaiting your review','plural'=>'Purchase requests awaiting your review','value'=>$pendingRequests,'tone'=>'indigo','icon'=>'fa-clipboard-check','href'=>'reports.html?category=purchases&'.$dateQuery],
            ['singular'=>'Request pending over 2 days','plural'=>'Requests pending over 2 days','value'=>$overdueRequests,'tone'=>'amber','icon'=>'fa-hourglass-half','href'=>'reports.html?category=purchases&'.$dateQuery],
        ], 'overview_previews'=>[], 'columns'=>[], 'numeric_columns'=>[], 'currency_columns'=>[], 'rows'=>[],
        'actions'=>[['title'=>'Purchase approvals','description'=>'Review pending requests and see how long they have been waiting.','href'=>'supervisor_approval.html','label'=>'Open approval queue','tone'=>'indigo']],
        'pagination'=>reportPagination(0,$f),
        'notes'=>['Inventory Supervisor overview contains current inventory, expiry, and product movement information only. Purchase requests have their own section.']];
}

function overviewReport(PDO $pdo,array $f,array $role): array
{
    if (!empty($role['supervisor'])) return supervisorOverviewReport($pdo,$f,$role);
    $sales=salesReport($pdo,$f,$role);
    $currentFilters=$f;
    foreach(['category_id','type_id','product_id','brand','supplier_id','cashier_id','sales_clerk_id','payment_method','po_status','stock_status','search'] as $key)$currentFilters[$key]='';
    $inventory=inventoryReport($pdo,$currentFilters);
    $purchases=purchasesReport($pdo,$currentFilters);

    [$salesWhere,$salesParams]=reportSalesWhere($f,$role);
    $paid=reportPaidSalesSubquery();
    $specification=reportProductSpecificationSql();
    $topProducts=reportRows($pdo,"SELECT p.product_name,p.brand_name,{$specification} specification,
      SUM(i.quantity) quantity_sold,
      ROUND(SUM(CASE WHEN o.subtotal>0 THEN i.line_total/o.subtotal*pay.final_amount ELSE 0 END),2) net_revenue
      FROM sales_orders o INNER JOIN ({$paid}) pay ON pay.order_id=o.order_id
      INNER JOIN sales_order_items i ON i.order_id=o.order_id INNER JOIN product p ON p.product_id=i.product_id
      LEFT JOIN medicine_details md ON md.product_id=p.product_id LEFT JOIN grocery_details gd ON gd.product_id=p.product_id
      WHERE {$salesWhere}
      GROUP BY p.product_id,p.product_name,p.brand_name,md.generic_name,md.strength_value,md.strength_unit,md.strength,md.dosage_form,md.package_type,gd.variant,gd.size,gd.net_weight,gd.unit,gd.package_type
      ORDER BY quantity_sold DESC,net_revenue DESC LIMIT 5",$salesParams);

    $inventoryParams=[];$inventoryBase=inventoryBaseSql($currentFilters,$inventoryParams);
    $inventoryHealth=reportRow($pdo,"SELECT COUNT(*) total_products,
      SUM(stock_status='Healthy') healthy,SUM(stock_status='Low Stock') low_stock,
      SUM(stock_status='Out of Stock') out_of_stock,SUM(stock_status='Negative Stock — Data Issue') data_issues,
      SUM(shelf_stock) shelf_stock,SUM(storage_stock) storage_stock,SUM(shelf_stock+storage_stock) total_on_hand
      FROM ({$inventoryBase}) current_inventory",$inventoryParams);

    $expiryShelf='COALESCE(selling.shelf_qty,0)';$expiryStorage='GREATEST(b.storage_qty-COALESCE(b.expiry_quarantined_storage_qty,0),0)';$expiryRemaining="({$expiryStorage}+{$expiryShelf})";
    $expiryShelfJoin='LEFT JOIN (SELECT source_batch_id,SUM(GREATEST(quantity_remaining-expiry_quarantined_qty,0)) shelf_qty FROM product_selling_stock WHERE source_batch_id IS NOT NULL GROUP BY source_batch_id) selling ON selling.source_batch_id=b.batch_id';
    $expiryRisk=reportRow($pdo,"SELECT
      COUNT(DISTINCT b.batch_id) active_batches,
      SUM(b.expiry_date<CURDATE()) expired,
      SUM(b.expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(),INTERVAL 7 DAY)) within_7,
      SUM(b.expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(),INTERVAL 30 DAY)) within_30,
      SUM(b.expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(),INTERVAL 60 DAY)) within_60,
      SUM(CASE WHEN b.expiry_date<=DATE_ADD(CURDATE(),INTERVAL 60 DAY) THEN {$expiryRemaining} ELSE 0 END) quantity_at_risk,
      SUM(CASE WHEN b.expiry_date<=DATE_ADD(CURDATE(),INTERVAL 30 DAY) THEN {$expiryRemaining}*COALESCE(b.unit_cost,0) ELSE 0 END) cost_at_risk_30,
      SUM(CASE WHEN b.expiry_date<=DATE_ADD(CURDATE(),INTERVAL 60 DAY) THEN {$expiryRemaining}*COALESCE(b.unit_cost,0) ELSE 0 END) cost_at_risk
      FROM inventory_batches b {$expiryShelfJoin}
      WHERE b.expiry_date IS NOT NULL AND b.batch_status='active' AND {$expiryRemaining}>0");
    $expiryChartRows=reportRows($pdo,"SELECT
      CASE
        WHEN b.expiry_date<CURDATE() THEN 'Expired'
        WHEN b.expiry_date<=DATE_ADD(CURDATE(),INTERVAL 7 DAY) THEN 'Within 7 days'
        WHEN b.expiry_date<=DATE_ADD(CURDATE(),INTERVAL 30 DAY) THEN 'Within 30 days'
        ELSE 'Within 60 days'
      END label,
      COUNT(DISTINCT b.batch_id) batch_count,
      SUM({$expiryRemaining}) quantity_at_risk,
      ROUND(SUM({$expiryRemaining}*COALESCE(b.unit_cost,0)),2) cost_at_risk
      FROM inventory_batches b {$expiryShelfJoin}
      WHERE b.expiry_date IS NOT NULL AND b.batch_status='active'
        AND {$expiryRemaining}>0
        AND b.expiry_date<=DATE_ADD(CURDATE(),INTERVAL 60 DAY)
      GROUP BY label
      ORDER BY MIN(b.expiry_date)");
    $poStatuses=[];
        foreach(['Draft','Pending','Arrived','Delivered','Cancelled'] as $status)$poStatuses[$status]=0;
    foreach($purchases['charts'][0]['rows']??[] as $row)if(array_key_exists($row['label'],$poStatuses))$poStatuses[$row['label']]=(int)$row['value'];
    $arrived=(int)(reportRow($pdo,"SELECT COUNT(DISTINCT po_id) total FROM purchase_orders WHERE status='Arrived'")['total']??0);

    $staff=reportRow($pdo,"SELECT COUNT(DISTINCT COALESCE(o.assigned_cashier_id,pay.cashier_id)) active_cashiers,
      COUNT(DISTINCT o.sales_clerk_id) active_sales_clerks,COUNT(DISTINCT o.order_id) completed_transactions,
      COALESCE(AVG(pay.final_amount),0) average_transaction
      FROM sales_orders o INNER JOIN ({$paid}) pay ON pay.order_id=o.order_id WHERE {$salesWhere}",$salesParams);
    $topCashiers=reportRows($pdo,"SELECT COALESCE(NULLIF(u.full_name,''),u.username,'Unassigned') name,
      COUNT(DISTINCT o.order_id) transactions,ROUND(SUM(pay.final_amount),2) net_sales
      FROM sales_orders o INNER JOIN ({$paid}) pay ON pay.order_id=o.order_id LEFT JOIN users u ON u.user_id=COALESCE(o.assigned_cashier_id,pay.cashier_id)
      WHERE {$salesWhere} AND COALESCE(o.assigned_cashier_id,pay.cashier_id) IS NOT NULL
      GROUP BY COALESCE(o.assigned_cashier_id,pay.cashier_id),u.full_name,u.username
      ORDER BY transactions DESC,net_sales DESC,name LIMIT 3",$salesParams);
    $topClerks=reportRows($pdo,"SELECT COALESCE(NULLIF(u.full_name,''),u.username,'Unassigned') name,
      COUNT(DISTINCT o.order_id) transactions,ROUND(SUM(pay.final_amount),2) net_sales
      FROM sales_orders o INNER JOIN ({$paid}) pay ON pay.order_id=o.order_id LEFT JOIN users u ON u.user_id=o.sales_clerk_id
      WHERE {$salesWhere} AND o.sales_clerk_id IS NOT NULL
      GROUP BY o.sales_clerk_id,u.full_name,u.username
      ORDER BY transactions DESC,net_sales DESC,name LIMIT 3",$salesParams);

    $dateQuery='start_date='.rawurlencode($f['start_date']).'&end_date='.rawurlencode($f['end_date']);
    $links=[
      'sales'=>'reports.html?category=sales&'.$dateQuery,
      'products'=>'reports.html?category=products&'.$dateQuery,
      'inventory'=>'reports.html?category=inventory',
      'expiry'=>'reports.html?category=expiry&expiry_days=60',
      'purchases'=>'reports.html?category=purchases&'.$dateQuery,
      'staff'=>'reports.html?category=staff&'.$dateQuery,
    ];
    $attention=[
      ['singular'=>'Out-of-stock product','plural'=>'Out-of-stock products','value'=>(int)$inventoryHealth['out_of_stock'],'tone'=>'red','icon'=>'fa-box-open','href'=>'reports.html?category=inventory&stock_status=out'],
      ['singular'=>'Low-stock product','plural'=>'Low-stock products','value'=>(int)$inventoryHealth['low_stock'],'tone'=>'amber','icon'=>'fa-triangle-exclamation','href'=>'reports.html?category=inventory&stock_status=low'],
      ['singular'=>'Expired batch','plural'=>'Expired batches','value'=>(int)($expiryRisk['expired']??0),'tone'=>'red','icon'=>'fa-ban','href'=>'reports.html?category=expiry&expiry_days=0'],
      ['singular'=>'Batch expiring within 30 days','plural'=>'Batches expiring within 30 days','value'=>(int)($expiryRisk['within_30']??0),'tone'=>'amber','icon'=>'fa-calendar-xmark','href'=>'reports.html?category=expiry&expiry_days=30'],
      ['singular'=>'Arrived PO waiting for inspection','plural'=>'Arrived POs waiting for inspection','value'=>$arrived,'tone'=>'amber','icon'=>'fa-clipboard-check','href'=>'reports.html?category=purchases&po_status=Arrived'],
      ['singular'=>'Outstanding delivered PO payable','plural'=>'Outstanding delivered PO payables','value'=>(float)$purchases['summary'][5]['value'],'format'=>'currency','tone'=>'amber','icon'=>'fa-wallet','href'=>'reports.html?category=purchases&payment_state=outstanding&'.$dateQuery],
    ];
    $salesChart=$sales['charts'][0];
    $salesChart['href']=$links['sales'];$salesChart['link_label']='View Sales Report';$salesChart['overview_trend']=true;
    $overviewCards=[$sales['summary'][0],$sales['summary'][1],$sales['summary'][3],$inventory['summary'][5],reportCard('Cost at Risk',(float)($expiryRisk['cost_at_risk_30']??0),'currency','fa-coins','red'),$purchases['summary'][5]];
    foreach ($sales['summary'] as $salesCard) {
        if (in_array($salesCard['title'] ?? '', ['Gross Profit','Estimated Gross Profit','Total VAT Collected'], true)) $overviewCards[]=$salesCard;
    }
    return [
      'summary'=>$overviewCards,
      'charts'=>[$salesChart],
      'attention'=>$attention,
      'overview_previews'=>[
        'top_products'=>['rows'=>$topProducts,'href'=>$links['products']],
        'inventory_health'=>['healthy'=>(int)$inventoryHealth['healthy'],'low_stock'=>(int)$inventoryHealth['low_stock'],'out_of_stock'=>(int)$inventoryHealth['out_of_stock'],'data_issues'=>(int)$inventoryHealth['data_issues'],'total_products'=>(int)$inventoryHealth['total_products'],'total_on_hand'=>(int)$inventoryHealth['total_on_hand'],'shelf_stock'=>(int)$inventoryHealth['shelf_stock'],'storage_stock'=>(int)$inventoryHealth['storage_stock'],'href'=>$links['inventory']],
        'expiry_risk'=>['active_batches'=>(int)($expiryRisk['active_batches']??0),'expired'=>(int)($expiryRisk['expired']??0),'within_7'=>(int)($expiryRisk['within_7']??0),'within_30'=>(int)($expiryRisk['within_30']??0),'within_60'=>(int)($expiryRisk['within_60']??0),'quantity_at_risk'=>(int)($expiryRisk['quantity_at_risk']??0),'cost_at_risk'=>(float)($expiryRisk['cost_at_risk']??0),'chart_rows'=>$expiryChartRows,'href'=>$links['expiry']],
        'purchase_status'=>['statuses'=>$poStatuses,'arrived_awaiting_inspection'=>$arrived,'open_commitments'=>(float)$purchases['summary'][0]['value'],'outstanding_payable'=>(float)$purchases['summary'][5]['value'],'href'=>$links['purchases']],
        'staff_activity'=>['active_cashiers'=>(int)($staff['active_cashiers']??0),'active_sales_clerks'=>(int)($staff['active_sales_clerks']??0),'cashiers'=>$topCashiers,'sales_clerks'=>$topClerks,'completed_transactions'=>(int)($staff['completed_transactions']??0),'average_transaction'=>(float)($staff['average_transaction']??0),'href'=>$links['staff']],
      ],
      'columns'=>$sales['columns'],'numeric_columns'=>$sales['numeric_columns'],'currency_columns'=>$sales['currency_columns'],
      'rows'=>$sales['rows'],'pagination'=>$sales['pagination'],
      'notes'=>array_merge($sales['notes'],['Inventory Health and Expiry Risk are current active-stock values; time-based sales, product, purchase, and staff previews use the selected Overview date range.'])
    ];
}

require_once __DIR__ . '/reports_reference_views.php';

if (!defined('REPORTS_LIBRARY_ONLY')) {
try {
    reportApplyConfiguredTimezone($pdo);$role=reportRoleContext();$f=reportFilters();$category=strtolower(trim((string)($_GET['category']??'overview')));
    if(!in_array($category,$role['available_categories'],true)){http_response_code(403);echo json_encode(['status'=>'error','message'=>'You do not have access to this report category.','access'=>$role]);exit;}
    if(in_array($category,['sales','purchases','overview'],true))ensureSalesProfitAllocationSchema($pdo);
    $referenceLayout=$role['management'] && ($_GET['layout']??'')==='reference';
    // Sales Clerk and Cashier use the same reports UI, but their sales views must
    // also be routed through the view-aware report builder. Its queries still
    // apply reportSalesWhere() with the current role scope.
    $referenceSalesLayout=($_GET['layout']??'')==='reference';
    $report=match($category){'sales'=>($referenceSalesLayout?referenceSalesReport($pdo,$f,$role):salesReport($pdo,$f,$role)),'inventory'=>(!empty($role['supervisor'])?supervisorInventoryReport($pdo,$f):($referenceLayout?referenceInventoryReport($pdo,$f,$role):inventoryReport($pdo,$f))),'purchases'=>(!empty($role['supervisor'])?supervisorPurchaseRequestReport($pdo,$f):($referenceLayout?referencePurchasingReport($pdo,$f):purchasesReport($pdo,$f))),'expiry'=>(!empty($role['supervisor'])?supervisorExpiryReport($pdo,$f):($referenceLayout?referenceExpiryReport($pdo,$f):expiryReport($pdo,$f))),'supplier'=>referenceSupplierReport($pdo,$f),'products'=>(!empty($role['supervisor'])?supervisorProductReport($pdo,$f,$role):productReport($pdo,$f,$role)),'staff'=>($referenceLayout?referenceStaffReport($pdo,$f):staffReport($pdo,$f,$role)),default=>overviewReport($pdo,$f,$role)};
    echo json_encode(['status'=>'success','category'=>$category,'access'=>$role,'system'=>reportSystem($pdo,$role,$f),'filters'=>reportFilterOptions($pdo,$role)]+$report,JSON_UNESCAPED_UNICODE|JSON_INVALID_UTF8_SUBSTITUTE);
} catch(InvalidArgumentException $e){http_response_code(422);echo json_encode(['status'=>'error','message'=>$e->getMessage()]);}
catch(Throwable $e){error_log('Reports error: '.$e->getMessage());http_response_code(500);echo json_encode(['status'=>'error','message'=>'Unable to generate the selected report.']);}
}
