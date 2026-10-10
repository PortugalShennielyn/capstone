<?php

function referenceReportPage(array $rows, array $filters): array
{
    $rows = reportSortArray($rows, $filters);
    return [array_slice($rows, $filters['offset'], $filters['page_size']), reportPagination(count($rows), $filters)];
}

function referenceSalesBreakdownReport(PDO $pdo, array $filters, array $role, string $view): array
{
    [$where, $params] = reportSalesWhere($filters, $role);
    $paid = reportPaidSalesSubquery();
    if (reportHasItemFilters($filters)) {
        $scopeSql = reportSalesItemScopeSubquery($filters, $params, 'breakdown_scope');
        $itemJoin = "INNER JOIN ({$scopeSql}) item_scope ON item_scope.order_id=o.order_id";
        $share = 'CASE WHEN o.subtotal>0 THEN item_scope.line_subtotal/o.subtotal ELSE 0 END';
        $itemCount = 'item_scope.item_count';
        $grossSales = 'item_scope.line_subtotal';
    } else {
        $itemJoin = 'LEFT JOIN (SELECT order_id,SUM(quantity) item_count FROM sales_order_items GROUP BY order_id) items ON items.order_id=o.order_id';
        $share = '1';
        $itemCount = 'COALESCE(items.item_count,0)';
        $grossSales = 'o.subtotal';
    }

    if ($view === 'Payment and Discount') {
        $label = 'UPPER(pay.payment_method)';
        $staffJoin = '';
        $dimension = 'Payment method';
    } else {
        if (!empty($role['cashier'])) {
            $label = "COALESCE(NULLIF(staff.full_name,''),staff.username,'Unassigned')";
            $staffJoin = 'LEFT JOIN users staff ON staff.user_id=COALESCE(o.assigned_cashier_id,pay.cashier_id)';
            $dimension = 'Cashier';
        } else {
            $label = "COALESCE(NULLIF(staff.full_name,''),staff.username,'Unassigned')";
            $staffJoin = 'LEFT JOIN users staff ON staff.user_id=o.sales_clerk_id';
            $dimension = 'Sales clerk';
        }
    }

    $rows = reportRows($pdo, "SELECT {$label} label,COUNT(DISTINCT o.order_id) transactions,
        COALESCE(SUM({$itemCount}),0) items_sold,
        ROUND(SUM({$grossSales}),2) gross_sales,
        ROUND(SUM((COALESCE(pay.sales_clerk_discount,o.discount,0)+COALESCE(pay.cashier_discount_amount,0))*{$share}),2) discounts,
        ROUND(SUM(CASE WHEN pay.payment_total>0 THEN o.vat*pay.final_amount/pay.payment_total ELSE o.vat END*{$share}),2) vat,
        ROUND(SUM(pay.refund_amount*{$share}),2) refunds,
        ROUND(SUM(pay.final_amount*{$share}),2) net_sales
        FROM sales_orders o INNER JOIN ({$paid}) pay ON pay.order_id=o.order_id
        {$itemJoin} {$staffJoin} WHERE {$where}
        GROUP BY {$label} ORDER BY net_sales DESC, label ASC", $params);
    if ($filters['search'] !== '') $rows = referenceSearchRows($rows, $filters['search']);
    foreach ($rows as &$row) $row['average_transaction'] = (float)$row['transactions'] > 0 ? round((float)$row['net_sales']/(int)$row['transactions'],2) : 0;
    unset($row);

    $sum = static fn(string $key): float => array_sum(array_map(static fn($row): float => (float)($row[$key]??0),$rows));
    $transactions = $sum('transactions');
    $netSales = $sum('net_sales');
    $summary = $view === 'Payment and Discount'
        ? [reportCard('Net Sales',$netSales,'currency','fa-peso-sign','purple'),
            reportCard('Total Discounts',$sum('discounts'),'currency','fa-tags','amber'),
            reportCard('Total VAT Collected',$sum('vat'),'currency','fa-percent','teal'),
            reportCard('Completed Transactions',$transactions,'number','fa-receipt','blue'),
            reportCard('Payment Methods Used',count(array_filter($rows,static fn($row)=>(float)$row['net_sales']>0)),'number','fa-credit-card','indigo')]
        : [reportCard('Net Sales',$netSales,'currency','fa-peso-sign','purple'),
            reportCard('Completed Transactions',$transactions,'number','fa-receipt','blue'),
            reportCard('Items Sold',$sum('items_sold'),'number','fa-box','teal'),
            reportCard($dimension.'s Shown',count($rows),'number','fa-users','indigo')];
    [$page,$pagination] = referenceReportPage($rows,$filters);
    $chartRows = array_map(static fn($row): array=>['label'=>$row['label'],'value'=>(float)$row['net_sales']],$rows);
    $columns = $view === 'Payment and Discount'
        ? ['label'=>'Payment Method','transactions'=>'Transactions','gross_sales'=>'Gross Sales','discounts'=>'Discounts','vat'=>'VAT','refunds'=>'Refunds','net_sales'=>'Net Sales']
        : ['label'=>$dimension,'transactions'=>'Transactions','items_sold'=>'Items Sold','gross_sales'=>'Gross Sales','discounts'=>'Discounts','vat'=>'VAT','refunds'=>'Refunds','net_sales'=>'Net Sales','average_transaction'=>'Average Transaction'];
    return [
        'summary'=>$summary,
        'charts'=>[['id'=>$view==='Payment and Discount'?'payment-method-breakdown':'staff-sales-breakdown',
            'title'=>$view==='Payment and Discount'?'Net sales by payment method':'Net sales by '.$dimension,
            'type'=>$view==='Payment and Discount'?'doughnut':'bar','orientation'=>'horizontal','tone'=>'sales','rows'=>$chartRows]],
        'columns'=>$columns,
        'numeric_columns'=>['transactions','items_sold'],
        'currency_columns'=>['gross_sales','discounts','vat','refunds','net_sales','average_transaction'],
        'rows'=>$page,'pagination'=>$pagination,
        'notes'=>$view==='Payment and Discount'
            ? ['Discount totals include recorded sales-clerk and cashier discounts. Payment totals use completed paid transactions and reflect recorded refunds.']
            : ["Sales are grouped by {$dimension} for the selected date range and account scope."]
    ];
}

function referenceSalesReport(PDO $pdo, array $filters, array $role): array
{
    $view = $filters['report_view'] ?: 'Sales Summary';
    $baseFilters = $filters;
    // Keep a date-based series available to the summary indicators for every
    // sales view, even when the main chart groups by product, staff, or payment.
    $baseFilters['group_by'] = 'day';
    $base = salesReport($pdo, $baseFilters, $role);
    $trendSeries = $base['charts'][0]['rows'] ?? [];
    $grossProfitCard = null;
    $totalVatCard = null;
    foreach ($base['summary'] as $metricCard) {
        if (in_array(($metricCard['title'] ?? ''), ['Gross Profit', 'Estimated Gross Profit'], true)) $grossProfitCard = $metricCard;
        if (($metricCard['title'] ?? '') === 'Total VAT Collected') $totalVatCard = $metricCard;
    }
    if (in_array($view,['Staff Sales','Payment and Discount'],true)) {
        $breakdown = referenceSalesBreakdownReport($pdo,$filters,$role,$view);
        $breakdown['trend_series'] = $trendSeries;
        return $breakdown;
    }
    if (!in_array($view, ['Sales Summary', 'Product Sales', 'Category Sales', 'Cashier Sales'], true)) return $base;

    if ($view === 'Product Sales') {
        $product = productReport($pdo, $filters, $role);
        $classifications=reportRows($pdo,"SELECT psv.product_id,MAX(psv.value_text) classification
            FROM product_specification_values psv INNER JOIN product_specifications ps ON ps.specification_id=psv.specification_id
            WHERE LOWER(TRIM(ps.specification_name))='medicine classification' GROUP BY psv.product_id");
        $classMap=array_column($classifications,'classification','product_id');
        foreach ($product['rows'] as &$row) {
            $row['average_price'] = $row['sold_qty'] > 0 ? round($row['revenue'] / $row['sold_qty'], 2) : 0;
            $classification=strtolower(trim((string)($classMap[$row['product_id']]??'')));
            $row['rx_otc']=$classification==='prescription (rx)'?'Rx':($classification!==''?'OTC':'—');
        }
        unset($row);
        $product['summary'] = [
            reportCard('Product Sales', $product['summary'][1]['value'], 'currency', 'fa-peso-sign', 'purple'),
            $product['summary'][0],
            reportCard('Products Shown', $product['pagination']['total'], 'number', 'fa-box', 'teal'),
            reportCard('Top Seller', $product['charts'][1]['rows'][0]['label']??'—', 'text', 'fa-star', 'blue'),
        ];
        $product['charts'] = [$product['charts'][1]];
        $product['charts'][0]['title'] = 'Top products by sales';
        // Rx/OTC is applied by productReport; omit the indicator if that
        // classification filter cannot be represented by the daily series.
        $product['trend_series'] = ($filters['rx_filter'] ?? '') === '' ? $trendSeries : [];
        $product['columns'] = ['product_name'=>'Product', 'specification'=>'Generic / Specification', 'category'=>'Category', 'rx_otc'=>'Rx / OTC', 'sold_qty'=>'Qty Sold', 'revenue'=>'Sales', 'average_price'=>'Avg. Price'];
        $product['currency_columns'] = ['revenue', 'average_price'];
        $product['numeric_columns'] = ['sold_qty'];
        return $product;
    }

    [$where, $params] = reportSalesWhere($filters, $role);
    $paid = reportPaidSalesSubquery();
    if ($view === 'Sales Summary') {
        $scopeQueryParts = static function (array $targetFilters, array $baseParams, string $scope): array {
            $queryParams = $baseParams;
            $scopeJoin = '';
            $itemJoin = 'LEFT JOIN (SELECT order_id,SUM(quantity) item_count FROM sales_order_items GROUP BY order_id) items ON items.order_id=o.order_id';
            $share = '1';
            $gross = 'o.subtotal';
            $itemCount = 'COALESCE(items.item_count,0)';
            if (reportHasItemFilters($targetFilters)) {
                $scopeSql = reportSalesItemScopeSubquery($targetFilters, $queryParams, $scope);
                $scopeJoin = "INNER JOIN ({$scopeSql}) item_scope ON item_scope.order_id=o.order_id";
                $itemJoin = '';
                $share = 'CASE WHEN o.subtotal>0 THEN item_scope.line_subtotal/o.subtotal ELSE 0 END';
                $gross = 'item_scope.line_subtotal';
                $itemCount = 'item_scope.item_count';
            }
            return [$queryParams, $scopeJoin, $itemJoin, $share, $gross, $itemCount];
        };
        [$dailyParams, $dailyScopeJoin, $dailyItemJoin, $dailyShare, $dailyGross, $dailyItemCount] = $scopeQueryParts($filters, $params, 'daily_scope');
        $rows = reportRows($pdo, "SELECT DATE(o.completed_at) report_date, COUNT(DISTINCT o.order_id) transactions,
            COALESCE(SUM({$dailyItemCount}),0) items_sold, ROUND(SUM({$dailyGross}),2) gross_sales,
            ROUND(SUM((COALESCE(pay.sales_clerk_discount,o.discount,0)+COALESCE(pay.cashier_discount_amount,0))*{$dailyShare}),2) discounts,
            ROUND(SUM(pay.refund_amount*{$dailyShare}),2) returns_cancelled,
            ROUND(SUM(CASE WHEN pay.payment_total>0 THEN o.vat*pay.final_amount/pay.payment_total ELSE o.vat END*{$dailyShare}),2) vat,
            ROUND(SUM(pay.final_amount*{$dailyShare}),2) net_sales
            FROM sales_orders o INNER JOIN ({$paid}) pay ON pay.order_id=o.order_id {$dailyScopeJoin} {$dailyItemJoin}
            WHERE {$where} GROUP BY DATE(o.completed_at) ORDER BY report_date DESC", $dailyParams);
        $total = static fn(string $key): float => array_sum(array_map(static fn($row): float => (float)$row[$key], $rows));
        $trendByDate = [];
        foreach (($base['charts'][0]['rows']??[]) as $trendRow) {
            if (!empty($trendRow['raw_date'])) $trendByDate[(string)$trendRow['raw_date']] = $trendRow;
        }
        $transactions = $total('transactions');
        $periodStart = new DateTimeImmutable($filters['start_date']);
        $periodEnd = new DateTimeImmutable($filters['end_date']);
        $periodDays = $periodStart->diff($periodEnd)->days + 1;
        $previousStart = $periodStart->modify("-{$periodDays} days");
        $previousEnd = $periodStart->modify('-1 day');
        $previousFilters = $filters;
        $previousFilters['start_date'] = $previousStart->format('Y-m-d');
        $previousFilters['end_date'] = $previousEnd->format('Y-m-d');
        $previousFilters['date_end_exclusive'] = $periodStart->format('Y-m-d');
        [$previousWhere, $previousParams] = reportSalesWhere($previousFilters, $role);
        [$previousParams, $previousScopeJoin, $previousItemJoin, $previousShare, $previousGross, $previousItemCount] = $scopeQueryParts($previousFilters, $previousParams, 'previous_scope');
        $previous = reportRow($pdo, "SELECT
            COALESCE(SUM(pay.final_amount*{$previousShare}),0) net_sales,
            COALESCE(SUM({$previousGross}),0) gross_sales,
            COALESCE(SUM((COALESCE(pay.sales_clerk_discount,o.discount,0)+COALESCE(pay.cashier_discount_amount,0))*{$previousShare}),0) discounts,
            COALESCE(SUM(pay.refund_amount*{$previousShare}),0) returns_cancelled,
            COUNT(DISTINCT o.order_id) transactions,
            COALESCE(SUM({$previousItemCount}),0) items_sold
            FROM sales_orders o INNER JOIN ({$paid}) pay ON pay.order_id=o.order_id {$previousScopeJoin} {$previousItemJoin}
            WHERE {$previousWhere}", $previousParams);
        $base['summary'] = [
            reportCard('Net Sales', $total('net_sales'), 'currency', 'fa-peso-sign', 'purple'),
            reportCard('Gross Sales', $total('gross_sales'), 'currency', 'fa-chart-line', 'blue'),
            reportCard('Discounts', $total('discounts'), 'currency', 'fa-tags', 'amber'),
            reportCard('Returns / Refunded', $total('returns_cancelled'), 'currency', 'fa-rotate-left', 'red'),
            reportCard('Transactions', $transactions, 'number', 'fa-receipt', 'teal'),
            reportCard('Items Sold', $total('items_sold'), 'number', 'fa-box', 'teal'),
            reportCard('Avg. Transaction', $transactions > 0 ? $total('net_sales') / $transactions : 0, 'currency', 'fa-chart-simple', 'blue'),
        ];
        $previousTransactions = (float) ($previous['transactions'] ?? 0);
        $comparisonKeys = ['net_sales', 'gross_sales', 'discounts', 'returns_cancelled', 'transactions', 'items_sold', 'average_transaction'];
        foreach ($base['summary'] as $index => &$card) {
            $key = $comparisonKeys[$index];
            $previousValue = $key === 'average_transaction'
                ? ($previousTransactions > 0 ? (float) $previous['net_sales'] / $previousTransactions : 0)
                : (float) ($previous[$key] ?? 0);
            $card['comparison'] = $previousValue > 0
                ? ['percent' => round(100 * ((float) $card['value'] - $previousValue) / $previousValue, 1), 'previous_value' => $previousValue]
                : null;
        }
        unset($card);
        // Keep comparison metadata aligned with the seven comparable sales metrics above.
        // VAT and gross-profit cards use their own data/history rules and have no comparison here.
        if ($totalVatCard !== null) $base['summary'][] = $totalVatCard;
        if (!empty($role['management']) && $grossProfitCard !== null) $base['summary'][] = $grossProfitCard;
        $base['comparison_period'] = [
            'start' => $previousStart->format('Y-m-d'),
            'end' => $previousEnd->format('Y-m-d'),
            'days' => $periodDays,
        ];
        $base['charts'] = [[
            'id'=>'daily-net-sales', 'title'=>'Net sales per day', 'type'=>'bar', 'tone'=>'sales',
            'rows'=>array_reverse(array_map(static function($row) use ($trendByDate): array {
                $trend=$trendByDate[(string)$row['report_date']]??[];
                return ['label'=>$row['report_date'],'raw_date'=>$row['report_date'],'value'=>(float)$row['net_sales'],
                    'gross_sales'=>(float)$row['gross_sales'],'vat'=>(float)$row['vat'],
                    'gross_profit'=>isset($trend['gross_profit'])?(float)$trend['gross_profit']:null];
            }, $rows))
        ]];
        $workflowChart = reportMyOrderStatusChart($pdo, $filters, $role);
        if ($workflowChart !== null) $base['charts'][] = $workflowChart;
        [$base['rows'], $base['pagination']] = referenceReportPage($rows, $filters);
        $base['columns'] = ['report_date'=>'Date', 'transactions'=>'Transactions', 'items_sold'=>'Items Sold', 'gross_sales'=>'Gross Sales', 'discounts'=>'Discounts', 'returns_cancelled'=>'Returns / Refunded', 'net_sales'=>'Net Sales'];
        $base['numeric_columns'] = ['transactions', 'items_sold'];
        $base['currency_columns'] = ['gross_sales', 'discounts', 'returns_cancelled', 'net_sales'];
        $base['notes'] = ['Net sales uses saved completed payment amounts after recorded refunds. Cancelled and unpaid orders are excluded.', 'Daily totals use the completion date in the configured pharmacy timezone.'];
        if ($totalVatCard !== null) $base['notes'][] = 'Total VAT Collected is the saved VAT from completed paid sales in the selected date range and filters, reduced proportionally for recorded refunds.';
        if (!empty($role['management'])) $base['notes'][] = 'Gross Profit uses recorded batch costs. Unknown costs are estimated from the all-time cost-to-sales ratio of reliably costed sales, and the card is labeled Estimated Gross Profit.';
        if ($workflowChart !== null) $base['notes'][] = 'My orders by status counts orders created in the selected date range and assigned to your account.';
        return $base;
    }

    if ($view === 'Category Sales') {
        $productParams = $params;
        $filter = reportProductFilterSql($filters, $productParams);
        $rows = reportRows($pdo, "SELECT COALESCE(pc.category_name,'Uncategorized') category,
            SUM(i.quantity) qty_sold,
            ROUND(SUM(CASE WHEN o.subtotal>0 THEN i.line_total/o.subtotal*pay.final_amount ELSE 0 END),2) sales
            FROM sales_orders o INNER JOIN ({$paid}) pay ON pay.order_id=o.order_id
            INNER JOIN sales_order_items i ON i.order_id=o.order_id INNER JOIN product p ON p.product_id=i.product_id
            LEFT JOIN product_categories pc ON pc.category_id=p.category_id
            WHERE {$where}{$filter} GROUP BY pc.category_id,pc.category_name ORDER BY sales DESC", $productParams);
        $total = array_sum(array_column($rows, 'sales'));
        foreach ($rows as &$row) $row['share'] = $total > 0 ? round(100 * $row['sales'] / $total, 1) : 0;
        unset($row);
        $base['summary'] = [reportCard('Total Sales',$total,'currency','fa-peso-sign','purple'),reportCard('Units Sold',array_sum(array_column($rows,'qty_sold')),'number','fa-box','teal'),reportCard('Largest Category Share',$rows[0]['share']??0,'percent','fa-chart-pie','blue')];
        $base['charts'] = [['id'=>'category-share','title'=>'Share of sales','type'=>'doughnut','tone'=>'category','rows'=>array_map(static fn($row): array => ['label'=>$row['category'],'value'=>(float)$row['sales']],$rows)]];
        [$base['rows'],$base['pagination']] = referenceReportPage($rows,$filters);
        $base['columns'] = ['category'=>'Category','qty_sold'=>'Qty Sold','sales'=>'Sales','share'=>'% of Total Sales'];
        $base['numeric_columns'] = ['qty_sold','share'];$base['currency_columns'] = ['sales'];
        $base['notes'] = ['Sales are allocated from each completed transaction in proportion to item line subtotals.'];
        $base['trend_series'] = $trendSeries;
        return $base;
    }

    $rows = reportRows($pdo, "SELECT COALESCE(o.assigned_cashier_id,pay.cashier_id) cashier_id,COALESCE(NULLIF(u.full_name,''),u.username,'Unassigned') cashier,
        COUNT(DISTINCT o.order_id) transactions,COALESCE(SUM(items.item_count),0) items_sold,
        ROUND(SUM(pay.final_amount),2) sales
        FROM sales_orders o INNER JOIN ({$paid}) pay ON pay.order_id=o.order_id
        LEFT JOIN users u ON u.user_id=COALESCE(o.assigned_cashier_id,pay.cashier_id)
        LEFT JOIN (SELECT order_id,SUM(quantity) item_count FROM sales_order_items GROUP BY order_id) items ON items.order_id=o.order_id
        WHERE {$where} GROUP BY COALESCE(o.assigned_cashier_id,pay.cashier_id),u.full_name,u.username ORDER BY sales DESC", $params);
    $cancelParams=[':start_date'=>$filters['start_date'],':end_date'=>$filters['date_end_exclusive']];
    $cancelFilter='';
    if($filters['cashier_id']!==''){$cancelFilter=' AND COALESCE(o.assigned_cashier_id,o.cancelled_by)=:cashier_id';$cancelParams[':cashier_id']=$filters['cashier_id'];}
    $cancellations=reportRows($pdo,"SELECT COALESCE(o.assigned_cashier_id,o.cancelled_by) cashier_id,COALESCE(NULLIF(u.full_name,''),u.username,'Unassigned') cashier,
        COUNT(*) cancelled,ROUND(SUM(o.total_amount),2) cancelled_amount
        FROM sales_orders o LEFT JOIN users u ON u.user_id=COALESCE(o.assigned_cashier_id,o.cancelled_by)
        WHERE o.status='cancelled' AND o.cancelled_at>=:start_date AND o.cancelled_at<:end_date{$cancelFilter}
        GROUP BY COALESCE(o.assigned_cashier_id,o.cancelled_by),u.full_name,u.username",$cancelParams);
    $byCashier=[];foreach($rows as $index=>$row){$rows[$index]['cancelled']=0;$rows[$index]['cancelled_amount']=0;$byCashier[(string)($row['cashier_id']??'')]=$index;}
    foreach($cancellations as $cancel){$key=(string)($cancel['cashier_id']??'');if(!array_key_exists($key,$byCashier)){$byCashier[$key]=count($rows);$rows[]=['cashier_id'=>$key,'cashier'=>$cancel['cashier'],'transactions'=>0,'items_sold'=>0,'sales'=>0,'cancelled'=>0,'cancelled_amount'=>0];}$index=$byCashier[$key];$rows[$index]['cancelled']=(int)$cancel['cancelled'];$rows[$index]['cancelled_amount']=(float)$cancel['cancelled_amount'];}
    if($filters['search']!=='')$rows=array_values(array_filter($rows,static fn($row):bool=>stripos($row['cashier'],$filters['search'])!==false));
    $base['summary'] = [reportCard('Sales Handled',array_sum(array_column($rows,'sales')),'currency','fa-peso-sign','purple'),reportCard('Transactions',array_sum(array_column($rows,'transactions')),'number','fa-receipt','teal'),reportCard('Cancelled Transactions',array_sum(array_column($rows,'cancelled')),'number','fa-ban','amber'),reportCard('Cancelled Amount',array_sum(array_column($rows,'cancelled_amount')),'currency','fa-peso-sign','red')];
    $base['charts'] = [['id'=>'cashier-sales','title'=>'Sales by cashier','type'=>'bar','orientation'=>'horizontal','tone'=>'sales','rows'=>array_map(static fn($row): array => ['label'=>$row['cashier'],'value'=>(float)$row['sales']],$rows)]];
    [$base['rows'],$base['pagination']] = referenceReportPage($rows,$filters);
    $base['columns'] = ['cashier'=>'Cashier','transactions'=>'Transactions','items_sold'=>'Items Sold','sales'=>'Sales','cancelled'=>'Cancelled','cancelled_amount'=>'Cancelled Amount'];
    $base['numeric_columns'] = ['transactions','items_sold','cancelled'];$base['currency_columns'] = ['sales','cancelled_amount'];
    $base['notes'] = ['Completed paid orders are attributed to the assigned cashier. Cancelled orders use their cancellation date and assigned cashier, or the cancelling user if no cashier was assigned. Cancelled Amount is the saved order amount, not realized revenue.'];
    $base['trend_series'] = $trendSeries;
    return $base;
}

function referenceInventoryReport(PDO $pdo, array $filters, array $role): array
{
    $view = $filters['report_view'] ?: 'Current Inventory';
    $base = inventoryReport($pdo, $filters);
    if ($view === 'Fast / Slow Moving') {
        $product = productReport($pdo, $filters, $role);
        $product['summary'] = [
            $product['summary'][0],
            $product['summary'][5],
            $product['summary'][3], $product['summary'][2],
        ];
        $product['charts'] = [$product['charts'][0]];
        $product['charts'][0]['title'] = 'Units sold by product';
        $product['columns'] = ['product_name'=>'Product','sold_qty'=>'Qty Sold','on_hand'=>'Current Stock','performance_status'=>'Movement'];
        $product['numeric_columns'] = ['sold_qty','on_hand'];$product['currency_columns'] = [];
        return $product;
    }

    if ($view === 'Stock Movement') return referenceStockMovementReport($pdo, $filters);

    if ($view === 'Low / Out of Stock') {
        $params=[];$inventorySql=inventoryBaseSql($filters,$params);
        $rows=reportRows($pdo,"SELECT *,(shelf_stock+storage_stock) on_hand FROM ({$inventorySql}) stock WHERE stock_status IN ('Low Stock','Out of Stock') ORDER BY on_hand,product_name",$params);
        $base['summary'] = [reportCard('Products to Reorder',count($rows),'number','fa-triangle-exclamation','amber'),reportCard('Low Stock',count(array_filter($rows,static fn($row): bool=>$row['stock_status']==='Low Stock')),'number','fa-box','amber'),reportCard('Out of Stock',count(array_filter($rows,static fn($row): bool=>$row['stock_status']==='Out of Stock')),'number','fa-box-open','red')];
        $base['charts'] = [['id'=>'reorder-stock','title'=>'Products with least on-hand stock','type'=>'bar','orientation'=>'horizontal','tone'=>'inventory','rows'=>array_map(static fn($row): array=>['label'=>$row['product_name'],'value'=>(int)$row['on_hand']],array_slice($rows,0,10))]];
        [$base['rows'],$base['pagination']] = referenceReportPage($rows,$filters);
        $base['columns'] = ['product_name'=>'Product','category'=>'Category','storage_stock'=>'Storage','shelf_stock'=>'Shelf','on_hand'=>'On Hand','reorder_level'=>'Reorder Level','stock_status'=>'Stock Status'];
        $base['numeric_columns'] = ['storage_stock','shelf_stock','on_hand','reorder_level'];$base['currency_columns'] = [];
        return $base;
    }

    if ($view === 'Inventory Valuation') {
        $params=[];$inventorySql=inventoryBaseSql($filters,$params);
        $rows=reportRows($pdo,"SELECT stock.*,stock.shelf_stock+stock.storage_stock on_hand,p.price retail_unit_price,
            ROUND((stock.shelf_stock+stock.storage_stock)*p.price,2) retail_value
            FROM ({$inventorySql}) stock INNER JOIN product p ON p.product_id=stock.product_id
            WHERE stock.shelf_stock+stock.storage_stock>0 ORDER BY stock.inventory_value DESC",$params);
        $cost=array_sum(array_column($rows,'inventory_value'));$retail=array_sum(array_column($rows,'retail_value'));$categories=[];
        foreach($rows as $row)$categories[$row['category']]=($categories[$row['category']]??0)+(float)$row['inventory_value'];
        arsort($categories);
        $base['summary']=[reportCard('Total Inventory Cost',$cost,'currency','fa-peso-sign','purple'),reportCard('Potential Retail Value',$retail,'currency','fa-store','blue'),reportCard('Potential Margin',$retail-$cost,'currency','fa-chart-line','green')];
        $base['charts']=[['id'=>'cost-by-category','title'=>'Cost value by category','type'=>'doughnut','tone'=>'category','rows'=>array_map(static fn($label,$value):array=>compact('label','value'),array_keys($categories),array_values($categories))]];
        [$base['rows'],$base['pagination']]=referenceReportPage($rows,$filters);
        $base['columns']=['product_name'=>'Product','category'=>'Category','storage_stock'=>'Storage Qty','shelf_stock'=>'Shelf Qty','unit_cost'=>'Unit Cost','inventory_value'=>'Stock Value','retail_value'=>'Retail Value'];
        $base['numeric_columns']=['storage_stock','shelf_stock'];$base['currency_columns']=['unit_cost','inventory_value','retail_value'];
        $base['notes']=['Cost includes active, unexpired Storage and Shelf stock only. Potential retail value uses the current product price; it is not realized revenue.'];
        return $base;
    }

    $params=[];$productFilter=reportProductFilterSql($filters,$params);$supplierFilter='';
    if($filters['supplier_id']!==''){$supplierFilter=' AND b.supplier_id=:supplier_id';$params[':supplier_id']=$filters['supplier_id'];}
    $shelf='COALESCE(selling.shelf_qty,0)';$storage='GREATEST(b.storage_qty-COALESCE(b.expiry_quarantined_storage_qty,0),0)';$onHand="({$storage}+{$shelf})";
    $rows=reportRows($pdo,"SELECT p.product_name,p.brand_name,COALESCE(pc.category_name,'Uncategorized') category,
        UPPER(LEFT(b.batch_id,8)) batch_reference,COALESCE(s.supplier_name,'—') supplier,{$storage} storage_qty,{$shelf} shelf_qty,
        {$onHand} on_hand,b.expiry_date,
        CASE WHEN b.expiry_date<CURDATE() THEN 'Expired' WHEN b.expiry_date<=DATE_ADD(CURDATE(),INTERVAL 30 DAY) THEN 'Expiring Soon' ELSE 'Good' END expiry_status,
        CASE WHEN {$onHand}<=0 THEN 'Out of Stock' WHEN {$onHand}<=10 THEN 'Low Stock' ELSE 'In Stock' END stock_status
        FROM inventory_batches b INNER JOIN product p ON p.product_id=b.product_id
        LEFT JOIN product_categories pc ON pc.category_id=p.category_id LEFT JOIN suppliers s ON s.supplier_id=b.supplier_id
        LEFT JOIN (SELECT source_batch_id,SUM(GREATEST(quantity_remaining-expiry_quarantined_qty,0)) shelf_qty FROM product_selling_stock WHERE source_batch_id IS NOT NULL GROUP BY source_batch_id) selling ON selling.source_batch_id=b.batch_id
        WHERE b.batch_status='active' AND {$onHand}>0{$productFilter}{$supplierFilter}
        ORDER BY p.product_name,b.expiry_date",$params);
    $stockLabels=['healthy'=>'In Stock','low'=>'Low Stock','out'=>'Out of Stock'];
    if(isset($stockLabels[$filters['stock_status']]))$rows=array_values(array_filter($rows,static fn($row):bool=>$row['stock_status']===$stockLabels[$filters['stock_status']]));
    $storage=array_sum(array_column($rows,'storage_qty'));$shelf=array_sum(array_column($rows,'shelf_qty'));
    $base['summary']=[reportCard('On Hand Units',$storage+$shelf,'number','fa-boxes-stacked','purple'),reportCard('Storage',$storage,'number','fa-warehouse','blue'),reportCard('Shelf',$shelf,'number','fa-store','teal'),reportCard('Expired Batches Still On Hand',count(array_filter($rows,static fn($row):bool=>$row['expiry_status']==='Expired')),'number','fa-calendar-xmark','red')];
    $base['charts']=[['id'=>'current-stock','title'=>'On-hand units by product','type'=>'bar','orientation'=>'horizontal','tone'=>'inventory','rows'=>array_slice(array_map(static fn($row):array=>['label'=>$row['product_name'],'value'=>(int)$row['on_hand']],$rows),0,10)]];
    [$base['rows'],$base['pagination']]=referenceReportPage($rows,$filters);
    $base['columns']=['product_name'=>'Product','batch_reference'=>'Batch','supplier'=>'Supplier','storage_qty'=>'Storage','shelf_qty'=>'Shelf','on_hand'=>'On Hand','expiry_date'=>'Expiry','stock_status'=>'Stock','expiry_status'=>'Expiry Status'];
    $base['numeric_columns']=['storage_qty','shelf_qty','on_hand'];$base['currency_columns']=[];
    $base['notes']=['On-hand values use active Shelf stock and Storage units after subtracting quarantine reservations. Expired batches with stock remain visible for follow-up; expired units must not be sold.'];
    return $base;
}

function referenceStockMovementReport(PDO $pdo,array $filters): array
{
    $params=[':start_date'=>$filters['start_date'],':end_date'=>$filters['date_end_exclusive']];
    $productFilter=reportProductFilterSql($filters,$params);
    $paid=reportPaidSalesSubquery();
    $rows=reportRows($pdo,"SELECT DATE(m.moved_at) report_date,p.product_name,m.transaction_type,m.location,m.units_in,m.units_out,m.reference
        FROM (
            SELECT r.created_at moved_at,r.product_id,r.transaction_type,'Storage' location,
                GREATEST(r.quantity,0) units_in,GREATEST(-r.quantity,0) units_out,r.po_id reference
            FROM inventory_receiving_transactions r
            UNION ALL
            SELECT t.created_at,t.product_id,'Transfer',t.source_location,0,t.base_quantity,t.transfer_id FROM inventory_transfers t
            UNION ALL
            SELECT t.created_at,t.product_id,'Transfer',t.destination_location,t.base_quantity,0,t.transfer_id FROM inventory_transfers t
            UNION ALL
            SELECT o.completed_at,i.product_id,'Sale','Shelf',0,i.quantity,o.order_no
            FROM sales_order_items i INNER JOIN sales_orders o ON o.order_id=i.order_id
            INNER JOIN ({$paid}) pay ON pay.order_id=o.order_id WHERE o.status='completed'
        ) m INNER JOIN product p ON p.product_id=m.product_id
        WHERE m.moved_at>=:start_date AND m.moved_at<:end_date{$productFilter}
        ORDER BY m.moved_at DESC,m.reference",$params);
    $in=array_sum(array_column($rows,'units_in'));$out=array_sum(array_column($rows,'units_out'));$days=[];
    foreach($rows as $row){$date=$row['report_date'];$days[$date]=($days[$date]??0)+(int)$row['units_in'];}
    ksort($days);
    [$page,$pagination]=referenceReportPage($rows,$filters);
    return ['summary'=>[reportCard('Movements Recorded',count($rows),'number','fa-arrows-rotate','purple'),reportCard('Units In',$in,'number','fa-arrow-down','green'),reportCard('Units Out',$out,'number','fa-arrow-up','gray')],
        'charts'=>[['id'=>'movement-in','title'=>'Units in per day','type'=>'bar','tone'=>'inventory','rows'=>array_map(static fn($label,$value):array=>compact('label','value'),array_keys($days),array_values($days))]],
        'columns'=>['report_date'=>'Date','product_name'=>'Product','transaction_type'=>'Transaction','location'=>'Location','units_in'=>'In','units_out'=>'Out','reference'=>'Reference'],
        'numeric_columns'=>['units_in','units_out'],'currency_columns'=>[],'rows'=>$page,'pagination'=>$pagination,
        'notes'=>['Receiving, Storage–Shelf transfers and completed paid sales are shown. Each transfer has an outgoing and incoming row. Historical adjustments are not in this ledger because the current database has no unified adjustment log.']];
}

function referenceExpiryReport(PDO $pdo, array $filters): array
{
    $view = $filters['report_view'] ?: 'Expiring Products';
    $params = [];
    $productFilters = $filters;
    $productFilters['search'] = '';
    $productFilter = reportProductFilterSql($productFilters, $params);
    if ($filters['supplier_id'] !== '') {
        $productFilter .= ' AND b.supplier_id=:supplier_id';
        $params[':supplier_id'] = $filters['supplier_id'];
    }
    $search = trim($filters['search']);
    if ($view === 'Batch Traceability') {
        $find = $params;
        foreach ([':batch_number_search',':batch_id_search',':batch_product_search'] as $key) $find[$key] = '%' . $search . '%';
        $batch = reportRow($pdo, "SELECT b.batch_id,COALESCE(NULLIF(pi.batch_number,''),UPPER(LEFT(b.batch_id,8))) batch_reference,
            p.product_name,COALESCE(s.supplier_name,'Unknown') supplier,COALESCE(po.po_number,'—') po_number,
            b.received_date,b.received_qty,b.storage_qty,COALESCE(selling.shelf_qty,0) shelf_qty,b.returned_qty,b.damaged_qty,b.expiry_date
            FROM inventory_batches b JOIN product p ON p.product_id=b.product_id
            LEFT JOIN product_inventory pi ON pi.inventory_id=b.legacy_inventory_id
            LEFT JOIN suppliers s ON s.supplier_id=b.supplier_id LEFT JOIN purchase_orders po ON po.po_id=b.po_id
            LEFT JOIN (SELECT source_batch_id,SUM(quantity_remaining) shelf_qty FROM product_selling_stock WHERE source_batch_id IS NOT NULL GROUP BY source_batch_id) selling ON selling.source_batch_id=b.batch_id
            WHERE (pi.batch_number LIKE :batch_number_search OR b.batch_id LIKE :batch_id_search OR p.product_name LIKE :batch_product_search)
            {$productFilter} ORDER BY b.received_date DESC LIMIT 1", $find);
        $history = [];
        if ($batch) {
            $history[] = ['date'=>$batch['received_date'],'event'=>'Received','detail'=>'Received against '.$batch['po_number'],'quantity'=>(int)$batch['received_qty']];
            $transfers = reportRows($pdo, "SELECT t.created_at date,t.source_location,t.destination_location,a.base_quantity quantity
                FROM inventory_transfer_allocations a JOIN inventory_transfers t ON t.transfer_id=a.transfer_id
                WHERE a.source_batch_id=:batch_id ORDER BY t.created_at", [':batch_id'=>$batch['batch_id']]);
            foreach ($transfers as $move) $history[] = ['date'=>$move['date'],'event'=>'Transfer','detail'=>$move['source_location'].' → '.$move['destination_location'],'quantity'=>(int)$move['quantity']];
            usort($history, static fn($a,$b)=>strcmp($a['date'],$b['date']));
        }
        return ['summary'=>[],'charts'=>[],'columns'=>[],'numeric_columns'=>[],'currency_columns'=>[],
            'rows'=>[],'pagination'=>reportPagination(0,$filters),'trace'=>$batch ? ['batch'=>$batch,'history'=>$history] : null,
            'notes'=>['Trace history includes receiving and recorded batch transfers. Current Storage and Shelf balances come from the batch ledger.']];
    }

    $expired = $view === 'Expired / Wastage';
    $shelf='COALESCE(selling.shelf_qty,0)';
    $remaining="(b.storage_qty+{$shelf})";
    $where = $expired ? 'b.expiry_date>=:expired_start AND b.expiry_date<:expired_end AND b.expiry_date<CURDATE()' : 'b.expiry_date>=CURDATE() AND b.expiry_date<=DATE_ADD(CURDATE(),INTERVAL 365 DAY)';
    if ($expired) { $params[':expired_start']=$filters['start_date']; $params[':expired_end']=$filters['date_end_exclusive']; }
    if ($search !== '') {
        $productFilter .= ' AND (p.product_name LIKE :search_product OR pi.batch_number LIKE :search_batch)';
        $params[':search_product'] = $params[':search_batch'] = '%'.$search.'%';
    }
    $rows = reportRows($pdo, "SELECT p.product_name,COALESCE(NULLIF(pi.batch_number,''),UPPER(LEFT(b.batch_id,8))) batch_reference,
        b.storage_qty,{$shelf} shelf_qty,b.expiry_date,DATEDIFF(b.expiry_date,CURDATE()) days_left,
        ROUND({$remaining}*b.unit_cost,2) cost_value,
        CASE WHEN b.expiry_date<CURDATE() THEN 'Expired' WHEN DATEDIFF(b.expiry_date,CURDATE())<=30 THEN 'Within 30 days'
             WHEN DATEDIFF(b.expiry_date,CURDATE())<=90 THEN '31–90 days'
             WHEN DATEDIFF(b.expiry_date,CURDATE())<=180 THEN '3–6 months' ELSE '6–12 months' END expiry_window,
        CASE WHEN b.storage_qty>0 AND {$shelf}>0 THEN 'Storage + Shelf' WHEN b.storage_qty>0 THEN 'Storage' ELSE 'Shelf' END location
        FROM inventory_batches b JOIN product p ON p.product_id=b.product_id
        LEFT JOIN product_inventory pi ON pi.inventory_id=b.legacy_inventory_id
        LEFT JOIN (SELECT source_batch_id,SUM(quantity_remaining) shelf_qty FROM product_selling_stock WHERE source_batch_id IS NOT NULL GROUP BY source_batch_id) selling ON selling.source_batch_id=b.batch_id
        WHERE b.expiry_date IS NOT NULL AND b.batch_status<>'depleted' AND {$remaining}>0 AND {$where}{$productFilter}
        ORDER BY b.expiry_date,p.product_name", $params);
    if (!$expired && $filters['expiry_days'] < 365) {
        $days = $filters['expiry_days'];
        $rows = array_values(array_filter($rows, static fn($row)=>(int)$row['days_left'] <= $days));
    }
    $windows = ['Within 30 days'=>0,'31–90 days'=>0,'3–6 months'=>0,'6–12 months'=>0];
    foreach ($rows as $row) if (isset($windows[$row['expiry_window']])) $windows[$row['expiry_window']] += (float)$row['cost_value'];
    $total = array_sum(array_column($rows,'cost_value'));
    $summary = $expired ? [
        reportCard('Value lost to expiry',$total,'currency','fa-peso-sign','red'),
        reportCard('Units expired',array_sum(array_map(static fn($r)=>(int)$r['storage_qty']+(int)$r['shelf_qty'],$rows)),'number','fa-box','gray'),
        reportCard('Batches',count($rows),'number','fa-layer-group','gray')
    ] : [
        reportCard('Cost expiring within 30 days',$windows['Within 30 days'],'currency','fa-peso-sign','red'),
        reportCard('31–90 days',$windows['31–90 days'],'currency','fa-calendar','amber'),
        reportCard('Batches tracked',count($rows),'number','fa-layer-group','gray')
    ];
    $chartRows = $expired ? [] : array_map(static fn($label,$value)=>['label'=>$label,'value'=>$value],array_keys($windows),array_values($windows));
    if ($expired) {
        $byProduct=[];foreach($rows as $row)$byProduct[$row['product_name']]=($byProduct[$row['product_name']]??0)+(float)$row['cost_value'];
        arsort($byProduct);
        $chartRows=array_map(static fn($label,$value)=>['label'=>$label,'value'=>$value],array_keys($byProduct),array_values($byProduct));
    }
    $columns = $expired ? ['product_name'=>'Product','batch_reference'=>'Batch','expiry_date'=>'Expired on','storage_qty'=>'Storage','shelf_qty'=>'Shelf','cost_value'=>'Cost value','location'=>'Location']
        : ['product_name'=>'Product','batch_reference'=>'Batch','storage_qty'=>'Storage','shelf_qty'=>'Shelf','expiry_date'=>'Expiry','days_left'=>'Days left','expiry_window'=>'Window','cost_value'=>'Cost value'];
    [$page,$pagination] = referenceReportPage($rows,$filters);
    return ['summary'=>$summary,'charts'=>[['id'=>$expired?'expired-product-cost':'expiry-cost-window','title'=>$expired?'Value lost by product':'Cost value by expiry window','type'=>'bar','orientation'=>$expired?'horizontal':'vertical','tone'=>'expiry','rows'=>$chartRows]],
        'columns'=>$columns,'numeric_columns'=>['storage_qty','shelf_qty','days_left'],'currency_columns'=>['cost_value'],
        'rows'=>$page,'pagination'=>$pagination,'notes'=>['Cost value uses remaining Storage and Shelf units multiplied by the recorded batch unit cost.']];
}

function referencePurchasingReport(PDO $pdo, array $filters): array
{
    $view = $filters['report_view'] ?: 'PR / PO Summary';
    $params = [':start_date'=>$filters['start_date'],':end_date'=>$filters['date_end_exclusive']];
    $dateColumn = $view === 'Invoice & Payment' ? 'inv.invoice_date' : 'po.created_at';
    $where = "{$dateColumn}>=:start_date AND {$dateColumn}<:end_date";
    if ($filters['supplier_id'] !== '') { $where .= ' AND po.supplier_id=:supplier_id'; $params[':supplier_id']=$filters['supplier_id']; }
    if ($filters['po_status'] !== '' && $view !== 'Invoice & Payment') { $where .= ' AND po.status=:po_status'; $params[':po_status']=$filters['po_status']; }
    $search = trim($filters['search']);
    if ($search !== '') { $where .= ' AND (po.po_number LIKE :search_po OR pr.pr_number LIKE :search_pr OR s.supplier_name LIKE :search_supplier)';
        foreach ([':search_po',':search_pr',':search_supplier'] as $key) $params[$key]='%'.$search.'%'; }
    $invoiceJoin = "LEFT JOIN purchase_order_invoices inv ON inv.po_id=po.po_id
        LEFT JOIN (SELECT po_id,SUM(amount) paid FROM purchase_order_payments GROUP BY po_id) pay ON pay.po_id=po.po_id";
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
        WHERE allocation.po_id IS NOT NULL GROUP BY allocation.po_id
    ) po_sales ON po_sales.po_id=po.po_id";
    $rows = reportRows($pdo, "SELECT po.po_number,pr.pr_number,s.supplier_name,DATE(po.created_at) order_date,po.expected_delivery_date,
        COALESCE(items.item_count,0) item_count,COALESCE(NULLIF(po.final_payment,0),inv.supplier_invoice_total,po.total_amount,0) total,
        po.status delivery_status,po.payment_status,inv.invoice_number,inv.invoice_date,inv.supplier_invoice_total invoice_total,
        COALESCE(pay.paid,0) paid,GREATEST(COALESCE(inv.supplier_invoice_total,po.final_payment,0)-COALESCE(pay.paid,0),0) outstanding,
        COALESCE(po_sales.tracked_units_sold,0) tracked_units_sold,
        COALESCE(po_sales.tracked_net_sales,0) tracked_net_sales,
        COALESCE(po_sales.tracked_cost_of_goods,0) tracked_cost_of_goods,
        CASE WHEN COALESCE(po_sales.allocation_count,0)=0 OR COALESCE(po_sales.missing_cost_quantity,0)>0 THEN NULL
             ELSE ROUND(COALESCE(po_sales.tracked_net_sales,0)-COALESCE(po_sales.tracked_cost_of_goods,0),2) END tracked_gross_profit
        FROM purchase_orders po JOIN suppliers s ON s.supplier_id=po.supplier_id
        LEFT JOIN purchase_requests pr ON pr.pr_id=po.pr_id
        LEFT JOIN (SELECT po_id,COUNT(*) item_count FROM purchase_order_items GROUP BY po_id) items ON items.po_id=po.po_id
        {$invoiceJoin} {$poSalesJoin} WHERE {$where} ORDER BY po.created_at DESC,po.po_number DESC",$params);
    if ($view === 'Invoice & Payment') {
        $rows=array_values(array_filter($rows,static fn($r)=>$r['invoice_number']!==null));
        if ($filters['payment_state'] !== '') $rows=array_values(array_filter($rows,static fn($r)=>strcasecmp((string)$r['payment_status'],$filters['payment_state'])===0));
    }
    if ($view === 'PR / PO Summary' && $filters['payment_state'] !== '') {
        $paymentState=strtolower($filters['payment_state']);
        $rows=array_values(array_filter($rows,static function($row)use($paymentState): bool {
            $status=strtolower(trim((string)$row['payment_status']));
            return $paymentState==='partial' ? str_starts_with($status,'partial') : $status===$paymentState;
        }));
    }
    $total = array_sum(array_column($rows,'total'));
    $paid = array_sum(array_column($rows,'paid'));
    $outstanding = array_sum(array_column($rows,'outstanding'));
    if ($view === 'Purchase History') {
        $params2 = $params;
        $items = reportRows($pdo,"SELECT po.po_number,pr.pr_number,s.supplier_name,DATE(po.created_at) order_date,
            COALESCE(NULLIF(poi.product_name_snapshot,''),p.product_name) product_name,
            COALESCE(NULLIF(poi.inventory_qty_ordered,0),poi.quantity) ordered_qty,
            COALESCE(poi.line_total,poi.unit_price_snapshot*COALESCE(NULLIF(poi.inventory_qty_ordered,0),poi.quantity),0) line_total,po.status delivery_status
            FROM purchase_orders po JOIN suppliers s ON s.supplier_id=po.supplier_id
            LEFT JOIN purchase_requests pr ON pr.pr_id=po.pr_id JOIN purchase_order_items poi ON poi.po_id=po.po_id
            JOIN product p ON p.product_id=poi.product_id {$invoiceJoin} WHERE {$where}
            ORDER BY po.created_at DESC,po.po_number,p.product_name",$params2);
        [$page,$pagination]=referenceReportPage($items,$filters);
        return ['summary'=>[reportCard('Purchased line value',array_sum(array_column($items,'line_total')),'currency','fa-peso-sign','purple'),reportCard('Line items',count($items),'number','fa-list','teal'),reportCard('Purchase orders',count($rows),'number','fa-file','gray')],
            'charts'=>[],'columns'=>['order_date'=>'Ordered','po_number'=>'PO','pr_number'=>'PR','supplier_name'=>'Supplier','product_name'=>'Product','ordered_qty'=>'Qty','line_total'=>'Line total','delivery_status'=>'Status'],
            'numeric_columns'=>['ordered_qty'],'currency_columns'=>['line_total'],'rows'=>$page,'pagination'=>$pagination,'notes'=>['Line totals are recorded purchase order item values.']];
    }
    if ($view === 'Invoice & Payment') {
        $invoiceTotal=array_sum(array_column($rows,'invoice_total'));
        $bySupplier=[];
        foreach ($rows as $row) { $name=$row['supplier_name']; $bySupplier[$name]['paid']=($bySupplier[$name]['paid']??0)+(float)$row['paid']; $bySupplier[$name]['outstanding']=($bySupplier[$name]['outstanding']??0)+(float)$row['outstanding']; }
        [$page,$pagination]=referenceReportPage($rows,$filters);
        return ['summary'=>[reportCard('Outstanding',$outstanding,'currency','fa-wallet','amber'),reportCard('Invoice total',$invoiceTotal,'currency','fa-file-invoice','gray'),reportCard('Paid',$paid,'currency','fa-circle-check','green')],
            'charts'=>[['id'=>'supplier-payments','title'=>'Paid vs outstanding by supplier','type'=>'stacked-bar','tone'=>'purchases','rows'=>array_map(static fn($name,$value)=>['label'=>$name,'paid'=>$value['paid'],'outstanding'=>$value['outstanding']],array_keys($bySupplier),array_values($bySupplier))]],
            'columns'=>['invoice_number'=>'Invoice','po_number'=>'PO','supplier_name'=>'Supplier','invoice_date'=>'Invoice date','invoice_total'=>'Invoice total','paid'=>'Paid','outstanding'=>'Outstanding','payment_status'=>'Status'],
            'numeric_columns'=>[],'currency_columns'=>['invoice_total','paid','outstanding'],'rows'=>$page,'pagination'=>$pagination,
            'notes'=>['Outstanding equals the supplier invoice total less recorded payments, floored at zero.']];
    }
    $statuses=[];foreach($rows as $row){$status=$row['delivery_status'];$statuses[$status]=($statuses[$status]??0)+1;}
    $dailyTotals=[];
    foreach($rows as $row){$day=$row['order_date'];$dailyTotals[$day]=($dailyTotals[$day]??0)+(float)$row['total'];}
    ksort($dailyTotals);
    $topOrders=[];
    foreach($rows as $row){
        $key=$row['po_number'];
        if(!isset($topOrders[$key]) || (float)$row['total']>(float)$topOrders[$key]['total'])$topOrders[$key]=$row;
    }
    $topOrders=array_values($topOrders);
    usort($topOrders,static fn($a,$b)=>(float)$b['total']<=>(float)$a['total']);
    [$page,$pagination]=referenceReportPage($rows,$filters);
    return ['summary'=>[reportCard('Total purchased',$total,'currency','fa-peso-sign','purple'),reportCard('Paid',$paid,'currency','fa-circle-check','green'),reportCard('Unpaid / partial',$outstanding,'currency','fa-wallet','amber'),reportCard('Open POs',count(array_filter($rows,static fn($r)=>in_array($r['delivery_status'],['Draft','Pending','Arrived'],true))),'number','fa-file','gray')],
        'purchase_order_count'=>count($rows),
        'purchase_trend'=>array_map(static fn($day,$value)=>['label'=>$day,'value'=>$value],array_keys($dailyTotals),array_values($dailyTotals)),
        'top_purchase_orders'=>array_map(static fn($row)=>['label'=>$row['po_number'],'value'=>(float)$row['total']],array_slice($topOrders,0,5)),
        'charts'=>[['id'=>'po-status-reference','title'=>'Purchase orders by status','type'=>'bar','orientation'=>'horizontal','tone'=>'status','rows'=>array_map(static fn($label,$value)=>compact('label','value'),array_keys($statuses),array_values($statuses))]],
        'columns'=>['po_number'=>'PO','pr_number'=>'PR','supplier_name'=>'Supplier','order_date'=>'Ordered','expected_delivery_date'=>'ETA','item_count'=>'Items','total'=>'Total','tracked_units_sold'=>'Units Sold from PO (tracked)','tracked_net_sales'=>'Net Sales from PO (tracked)','tracked_cost_of_goods'=>'Cost of Goods Sold (tracked)','tracked_gross_profit'=>'Gross Profit from PO (tracked)','payment_status'=>'Payment','delivery_status'=>'Status'],
        'numeric_columns'=>['item_count','tracked_units_sold'],'currency_columns'=>['total','tracked_net_sales','tracked_cost_of_goods','tracked_gross_profit'],'rows'=>$page,'pagination'=>$pagination,
        'notes'=>['Totals reflect saved purchase order amounts and recorded supplier payments.','PO gross profit compares tracked net sales excluding VAT with actual batch costs. It includes only sales captured after batch allocation tracking was added; a blank gross-profit cell means there are no tracked sales or a cost is incomplete.']];
}

function referenceSearchRows(array $rows, string $search): array
{
    if ($search === '') return $rows;
    return array_values(array_filter($rows, static function ($row) use ($search): bool {
        foreach ($row as $value) if (is_scalar($value) && stripos((string)$value, $search) !== false) return true;
        return false;
    }));
}

function referenceSupplierReport(PDO $pdo, array $filters): array
{
    $view=$filters['report_view'] ?: 'Supplier Performance';
    $params=[':start_date'=>$filters['start_date'],':end_date'=>$filters['date_end_exclusive']];
    $supplierWhere='';
    if ($filters['supplier_id'] !== '') { $supplierWhere=' AND po.supplier_id=:supplier_id'; $params[':supplier_id']=$filters['supplier_id']; }
    if ($view === 'Returns & Damage' || $view === 'Supplier Credits') {
        if ($view === 'Returns & Damage') {
            $rows=reportRows($pdo,"SELECT DATE(sc.created_at) report_date,po.po_number,s.supplier_name,
                COALESCE(NULLIF(poi.product_name_snapshot,''),p.product_name) product_name,
                sc.damage_reason,sc.affected_quantity,sc.damaged_quantity,sc.disposition,sc.claim_status
                FROM supplier_claims sc JOIN purchase_order_items poi ON poi.po_item_id=sc.po_item_id
                JOIN purchase_orders po ON po.po_id=poi.po_id JOIN suppliers s ON s.supplier_id=po.supplier_id
                JOIN product p ON p.product_id=poi.product_id
                WHERE sc.created_at>=:start_date AND sc.created_at<:end_date{$supplierWhere}
                ORDER BY sc.created_at DESC",$params);
            $rows=referenceSearchRows($rows,$filters['search']);$bySupplier=[];
            foreach($rows as $row)$bySupplier[$row['supplier_name']]=($bySupplier[$row['supplier_name']]??0)+1;
            [$page,$pagination]=referenceReportPage($rows,$filters);
            return ['summary'=>[reportCard('Receiving issues',count($rows),'number','fa-triangle-exclamation','purple'),reportCard('Affected units',array_sum(array_column($rows,'affected_quantity')),'number','fa-box','amber'),reportCard('Damaged units',array_sum(array_column($rows,'damaged_quantity')),'number','fa-box-open','red')],
                'charts'=>[['id'=>'supplier-issues','title'=>'Receiving issues by supplier','type'=>'bar','tone'=>'purchases','rows'=>array_map(static fn($label,$value)=>compact('label','value'),array_keys($bySupplier),array_values($bySupplier))]],
                'columns'=>['report_date'=>'Reported','supplier_name'=>'Supplier','po_number'=>'PO','product_name'=>'Product','damage_reason'=>'Issue','affected_quantity'=>'Affected','damaged_quantity'=>'Damaged','disposition'=>'Disposition','claim_status'=>'Status'],
                'numeric_columns'=>['affected_quantity','damaged_quantity'],'currency_columns'=>[],'rows'=>$page,'pagination'=>$pagination,
                'notes'=>['Each row is a recorded supplier claim. Affected and damaged quantities use the saved claim units.']];
        }
        $rows=reportRows($pdo,"SELECT DATE(cr.created_at) report_date,s.supplier_name,po.po_number,
            cr.credit_amount,COALESCE(app.amount_applied,0) amount_applied,
            GREATEST(cr.credit_amount-COALESCE(app.amount_applied,0),0) available_amount,cr.credit_status
            FROM supplier_credits cr JOIN supplier_claims sc ON sc.claim_id=cr.claim_id
            JOIN purchase_order_items poi ON poi.po_item_id=sc.po_item_id
            JOIN purchase_orders po ON po.po_id=poi.po_id JOIN suppliers s ON s.supplier_id=po.supplier_id
            LEFT JOIN (SELECT credit_id,SUM(amount_applied) amount_applied FROM supplier_credit_applications GROUP BY credit_id) app ON app.credit_id=cr.credit_id
            WHERE cr.created_at>=:start_date AND cr.created_at<:end_date{$supplierWhere}
            ORDER BY cr.created_at DESC",$params);
        $rows=referenceSearchRows($rows,$filters['search']);$bySupplier=[];
        foreach($rows as $row)$bySupplier[$row['supplier_name']]=($bySupplier[$row['supplier_name']]??0)+(float)$row['credit_amount'];
        [$page,$pagination]=referenceReportPage($rows,$filters);
        return ['summary'=>[reportCard('Supplier credits',array_sum(array_column($rows,'credit_amount')),'currency','fa-peso-sign','purple'),reportCard('Applied',array_sum(array_column($rows,'amount_applied')),'currency','fa-circle-check','green'),reportCard('Available',array_sum(array_column($rows,'available_amount')),'currency','fa-wallet','amber')],
            'charts'=>[['id'=>'supplier-credits','title'=>'Credit value by supplier','type'=>'bar','orientation'=>'horizontal','tone'=>'purchases','rows'=>array_map(static fn($label,$value)=>compact('label','value'),array_keys($bySupplier),array_values($bySupplier))]],
            'columns'=>['report_date'=>'Created','supplier_name'=>'Supplier','po_number'=>'Source PO','credit_amount'=>'Credit','amount_applied'=>'Applied','available_amount'=>'Available','credit_status'=>'Status'],
            'numeric_columns'=>[],'currency_columns'=>['credit_amount','amount_applied','available_amount'],'rows'=>$page,'pagination'=>$pagination,
            'notes'=>['Available credit is the recorded credit amount less applications to purchase orders.']];
    }

    $rows=reportRows($pdo,"SELECT DATE(r.received_date) report_date,po.po_number,s.supplier_name,
        po.expected_delivery_date,r.delivery_receipt_no,r.inspection_status,
        COALESCE(items.ordered_qty,0) ordered_qty,COALESCE(rec.received_qty,0) received_qty,
        COALESCE(rec.accepted_qty,0) accepted_qty,COALESCE(rec.damaged_qty,0) damaged_qty,
        COALESCE(rec.shortage_qty,0) shortage_qty,
        GREATEST(DATEDIFF(DATE(r.received_date),DATE(po.created_at)),0) lead_days,
        CASE WHEN po.expected_delivery_date IS NOT NULL AND DATE(r.received_date)<=po.expected_delivery_date THEN 1 ELSE 0 END on_time
        FROM purchase_order_receiving r JOIN purchase_orders po ON po.po_id=r.po_id
        JOIN suppliers s ON s.supplier_id=po.supplier_id
        LEFT JOIN (SELECT po_id,SUM(COALESCE(NULLIF(inventory_qty_ordered,0),quantity)) ordered_qty FROM purchase_order_items GROUP BY po_id) items ON items.po_id=po.po_id
        LEFT JOIN (SELECT receiving_id,SUM(received_quantity) received_qty,SUM(accepted_quantity) accepted_qty,
            SUM(damaged_quantity) damaged_qty,SUM(missing_quantity) shortage_qty FROM purchase_order_receiving_items GROUP BY receiving_id) rec ON rec.receiving_id=r.receiving_id
        WHERE r.received_date>=:start_date AND r.received_date<:end_date{$supplierWhere}
        ORDER BY r.received_date DESC",$params);
    $rows=referenceSearchRows($rows,$filters['search']);
    if ($view === 'Delivery / Receiving') {
        $bySupplier=[];foreach($rows as $row)$bySupplier[$row['supplier_name']]=($bySupplier[$row['supplier_name']]??0)+(int)$row['received_qty'];
        [$page,$pagination]=referenceReportPage($rows,$filters);
        return ['summary'=>[reportCard('Received units',array_sum(array_column($rows,'received_qty')),'number','fa-box','purple'),reportCard('Accepted units',array_sum(array_column($rows,'accepted_qty')),'number','fa-circle-check','green'),reportCard('Damaged units',array_sum(array_column($rows,'damaged_qty')),'number','fa-triangle-exclamation','red'),reportCard('Deliveries',count($rows),'number','fa-truck','gray')],
            'charts'=>[['id'=>'received-supplier','title'=>'Received units by supplier','type'=>'bar','orientation'=>'horizontal','tone'=>'inventory','rows'=>array_map(static fn($label,$value)=>compact('label','value'),array_keys($bySupplier),array_values($bySupplier))]],
            'columns'=>['report_date'=>'Received','po_number'=>'PO','supplier_name'=>'Supplier','delivery_receipt_no'=>'Receipt','ordered_qty'=>'Ordered','received_qty'=>'Received','accepted_qty'=>'Accepted','damaged_qty'=>'Damaged','shortage_qty'=>'Shortage','inspection_status'=>'Inspection'],
            'numeric_columns'=>['ordered_qty','received_qty','accepted_qty','damaged_qty','shortage_qty'],'currency_columns'=>[],'rows'=>$page,'pagination'=>$pagination,
            'notes'=>['Received, accepted, damaged and shortage quantities use the saved receiving item records.']];
    }
    $suppliers=[];foreach($rows as $row){$name=$row['supplier_name'];if(!isset($suppliers[$name]))$suppliers[$name]=['supplier_name'=>$name,'deliveries'=>0,'complete'=>0,'with_issues'=>0,'damaged'=>0,'shortage'=>0,'lead_total'=>0,'on_time'=>0];
        $entry=&$suppliers[$name];$entry['deliveries']++;$issues=(int)$row['damaged_qty']+(int)$row['shortage_qty'];if($issues)$entry['with_issues']++;else $entry['complete']++;$entry['damaged']+=(int)$row['damaged_qty'];$entry['shortage']+=(int)$row['shortage_qty'];$entry['lead_total']+=(int)$row['lead_days'];$entry['on_time']+=(int)$row['on_time'];unset($entry);}
    $performance=[];foreach($suppliers as $entry){$entry['avg_lead_days']=round($entry['lead_total']/max(1,$entry['deliveries']),1);$entry['on_time_percent']=round(100*$entry['on_time']/max(1,$entry['deliveries']),1);unset($entry['lead_total'],$entry['on_time']);$performance[]=$entry;}
    usort($performance,static fn($a,$b)=>$b['deliveries']<=>$a['deliveries']);
    $complete=array_sum(array_column($performance,'complete'));$deliveries=count($rows);
    [$page,$pagination]=referenceReportPage($performance,$filters);
    return ['summary'=>[reportCard('Complete delivery rate',$deliveries?round(100*$complete/$deliveries,1):0,'percent','fa-circle-check','purple'),reportCard('Deliveries with issues',$deliveries-$complete,'number','fa-triangle-exclamation','amber'),reportCard('Damaged',array_sum(array_column($rows,'damaged_qty')),'number','fa-box-open','red'),reportCard('Shortages',array_sum(array_column($rows,'shortage_qty')),'number','fa-box','amber')],
        'charts'=>[['id'=>'supplier-deliveries','title'=>'Deliveries by supplier','type'=>'bar','orientation'=>'horizontal','tone'=>'purchases','rows'=>array_map(static fn($r)=>['label'=>$r['supplier_name'],'value'=>$r['deliveries']],$performance)]],
        'columns'=>['supplier_name'=>'Supplier','deliveries'=>'Deliveries','complete'=>'Complete','with_issues'=>'With issues','damaged'=>'Damaged','shortage'=>'Shortage','avg_lead_days'=>'Avg. lead days','on_time_percent'=>'On time %'],
        'numeric_columns'=>['deliveries','complete','with_issues','damaged','shortage','avg_lead_days','on_time_percent'],'currency_columns'=>[],'rows'=>$page,'pagination'=>$pagination,
        'notes'=>['Complete deliveries have no recorded damaged or missing units. Lead time is arrival date minus PO creation date.']];
}

function referenceStaffReport(PDO $pdo, array $filters): array
{
    $view = $filters['report_view'] ?: 'Shift Reports';
    $paid = reportPaidSalesSubquery();
    $params = [':start_date' => $filters['start_date'], ':end_date' => $filters['date_end_exclusive']];

    if ($view === 'Audit Activity') {
        $rows = reportRows($pdo, "SELECT DATE_FORMAT(created_at,'%Y-%m-%d %H:%i') report_date,
            COALESCE(NULLIF(user_name,''),'System') actor,COALESCE(role,'') role,
            module,action,event_status status,COALESCE(description,'') description
            FROM audit_logs WHERE created_at>=:start_date AND created_at<:end_date
            ORDER BY created_at DESC", $params);
        $rows = referenceSearchRows($rows, $filters['search']);
        $modules = [];
        foreach ($rows as $row) $modules[$row['module']] = ($modules[$row['module']] ?? 0) + 1;
        arsort($modules);
        [$page, $pagination] = referenceReportPage($rows, $filters);
        return [
            'summary' => [reportCard('Audit events', count($rows), 'number', 'fa-list-check', 'purple'),
                reportCard('Successful', count(array_filter($rows, static fn($r) => strcasecmp($r['status'], 'Success') === 0)), 'number', 'fa-circle-check', 'green'),
                reportCard('Other outcomes', count(array_filter($rows, static fn($r) => strcasecmp($r['status'], 'Success') !== 0)), 'number', 'fa-triangle-exclamation', 'amber'),
                reportCard('Actors', count(array_unique(array_column($rows, 'actor'))), 'number', 'fa-users', 'blue')],
            'charts' => [['id' => 'audit-modules', 'title' => 'Activity by module', 'type' => 'bar', 'orientation' => 'horizontal', 'tone' => 'sales',
                'rows' => array_map(static fn($label, $value) => compact('label', 'value'), array_keys($modules), array_values($modules))]],
            'columns' => ['report_date' => 'Date & time', 'actor' => 'User', 'role' => 'Role', 'module' => 'Module', 'action' => 'Action', 'status' => 'Status', 'description' => 'Description'],
            'numeric_columns' => [], 'currency_columns' => [], 'rows' => $page, 'pagination' => $pagination,
            'notes' => ['Activity comes from recorded audit events in the selected period.']
        ];
    }

    $cashierWhere = '';
    if ($filters['cashier_id'] !== '') {
        $cashierWhere = ' AND COALESCE(o.assigned_cashier_id,pay.cashier_id)=:cashier_id';
        $params[':cashier_id'] = $filters['cashier_id'];
    }
    $orders = reportRows($pdo, "SELECT o.order_id,o.order_no,DATE(o.completed_at) report_date,
        DATE_FORMAT(o.completed_at,'%Y-%m-%d %H:%i') completed_at,
        COALESCE(r.receipt_no,o.order_no) receipt,
        COALESCE(NULLIF(u.full_name,''),u.username,'Unassigned') cashier,
        COALESCE(o.assigned_cashier_id,pay.cashier_id) cashier_id,
        UPPER(pay.payment_method) payment_method,pay.final_amount total,
        COALESCE(items.item_count,0) items,'Completed' status
        FROM sales_orders o INNER JOIN ({$paid}) pay ON pay.order_id=o.order_id
        LEFT JOIN users u ON u.user_id=COALESCE(o.assigned_cashier_id,pay.cashier_id)
        LEFT JOIN sales_receipts r ON r.order_id=o.order_id
        LEFT JOIN (SELECT order_id,SUM(quantity) item_count FROM sales_order_items GROUP BY order_id) items ON items.order_id=o.order_id
        WHERE o.status='completed' AND o.completed_at>=:start_date AND o.completed_at<:end_date{$cashierWhere}
        ORDER BY o.completed_at DESC", $params);

    if ($view === 'Transaction History') {
        $rows = referenceSearchRows($orders, $filters['search']);
        $daily = [];
        foreach ($rows as $row) $daily[$row['report_date']] = ($daily[$row['report_date']] ?? 0) + (float)$row['total'];
        ksort($daily);
        [$page, $pagination] = referenceReportPage($rows, $filters);
        return [
            'summary' => [reportCard('Net sales', array_sum(array_column($rows, 'total')), 'currency', 'fa-peso-sign', 'purple'),
                reportCard('Completed', count($rows), 'number', 'fa-receipt', 'green'),
                reportCard('Items sold', array_sum(array_column($rows, 'items')), 'number', 'fa-box', 'blue'),
                reportCard('Average sale', $rows ? array_sum(array_column($rows, 'total')) / count($rows) : 0, 'currency', 'fa-chart-line', 'blue')],
            'charts' => [['id' => 'transaction-daily', 'title' => 'Net sales by day', 'type' => 'bar', 'tone' => 'sales',
                'rows' => array_map(static fn($label, $value) => compact('label', 'value'), array_keys($daily), array_values($daily))]],
            'columns' => ['completed_at' => 'Date & time', 'receipt' => 'Receipt', 'cashier' => 'Cashier', 'items' => 'Items', 'total' => 'Total', 'payment_method' => 'Payment', 'status' => 'Status'],
            'numeric_columns' => ['items'], 'currency_columns' => ['total'], 'rows' => $page, 'pagination' => $pagination,
            'notes' => ['Transactions include completed orders with paid payment records. Refunds reduce the displayed net amount.']
        ];
    }

    $shifts = [];
    foreach ($orders as $order) {
        $key = $order['report_date'] . '|' . ($order['cashier_id'] ?? '');
        if (!isset($shifts[$key])) $shifts[$key] = ['report_date' => $order['report_date'], 'cashier' => $order['cashier'],
            'transactions' => 0, 'cash_sales' => 0, 'other_sales' => 0, 'total_sales' => 0];
        $shifts[$key]['transactions']++;
        $shifts[$key]['total_sales'] += (float)$order['total'];
        $field = strcasecmp($order['payment_method'], 'CASH') === 0 ? 'cash_sales' : 'other_sales';
        $shifts[$key][$field] += (float)$order['total'];
    }
    $rows = referenceSearchRows(array_values($shifts), $filters['search']);
    $daily = [];
    foreach ($rows as $row) $daily[$row['report_date']] = ($daily[$row['report_date']] ?? 0) + $row['cash_sales'];
    ksort($daily);
    [$page, $pagination] = referenceReportPage($rows, $filters);
    return [
        'summary' => [reportCard('Cash sales', array_sum(array_column($rows, 'cash_sales')), 'currency', 'fa-peso-sign', 'purple'),
            reportCard('Other payments', array_sum(array_column($rows, 'other_sales')), 'currency', 'fa-credit-card', 'blue'),
            reportCard('Transactions', array_sum(array_column($rows, 'transactions')), 'number', 'fa-receipt', 'green'),
            reportCard('Cashier days', count($rows), 'number', 'fa-users', 'gray')],
        'charts' => [['id' => 'shift-cash', 'title' => 'Cash sales by day', 'type' => 'bar', 'tone' => 'sales',
            'rows' => array_map(static fn($label, $value) => compact('label', 'value'), array_keys($daily), array_values($daily))]],
        'columns' => ['report_date' => 'Date', 'cashier' => 'Cashier', 'transactions' => 'Transactions', 'cash_sales' => 'Cash sales', 'other_sales' => 'Other payments', 'total_sales' => 'Total sales'],
        'numeric_columns' => ['transactions'], 'currency_columns' => ['cash_sales', 'other_sales', 'total_sales'], 'rows' => $page, 'pagination' => $pagination,
        'notes' => ['Each row groups completed paid transactions for one cashier on one day. Cash drawer opening and counted closing balances are not recorded in this report.']
    ];
}
