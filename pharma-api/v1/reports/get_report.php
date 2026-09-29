<?php

$allowedRoles = ['super_admin', 'admin', 'manager', 'supervisor', 'cashier', 'salesclerk', 'ro-super-admin', 'ro-admin', 'ro-manager', 'ro-supervisor', 'ro-cashier', 'ro-sales-clerk', 'ro_super_admin', 'ro_admin', 'ro_manager', 'ro_supervisor', 'ro_cashier', 'ro_sales_clerk'];
require_once __DIR__ . '/../../config/db_connection.php';
require_once __DIR__ . '/../../config/require_auth.php';
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
    $summary = reportRow($pdo, "SELECT
        COALESCE(SUM(pay.final_amount),0) net_sales,
        COUNT(DISTINCT o.order_id) transactions,
        COALESCE(SUM(items.item_count),0) items_sold,
        COALESCE(AVG(pay.final_amount),0) average_transaction,
        COALESCE(SUM(o.subtotal),0) subtotal,
        COALESCE(SUM(COALESCE(pay.sales_clerk_discount,o.discount,0)+COALESCE(pay.cashier_discount_amount,0)),0) discounts,
        COALESCE(SUM(GREATEST(pay.payment_total-o.vat,0)),0) vatable_sales,
        COALESCE(SUM(o.vat),0) vat,
        COALESCE(SUM(pay.refund_amount),0) refunds
        FROM sales_orders o INNER JOIN ({$paid}) pay ON pay.order_id=o.order_id
        LEFT JOIN (SELECT order_id,SUM(quantity) item_count FROM sales_order_items GROUP BY order_id) items ON items.order_id=o.order_id
        WHERE {$where}", $params);

    $group = in_array($f['group_by'], ['day','week','month','product','brand','category','product_type','cashier','sales_clerk','payment_method'], true) ? $f['group_by'] : 'day';
    $trendExpressions = [
        'day' => ["DATE(o.completed_at)", "DATE_FORMAT(DATE(o.completed_at),'%b %e')"],
        'week' => ["YEARWEEK(o.completed_at,3)", "CONCAT('Week ',WEEK(o.completed_at,3),', ',YEAR(o.completed_at))"],
        'month' => ["DATE_FORMAT(o.completed_at,'%Y-%m')", "DATE_FORMAT(o.completed_at,'%b %Y')"],
    ];
    if (isset($trendExpressions[$group])) {
        [$groupSql, $labelSql] = $trendExpressions[$group];
        $groupRows = reportRows($pdo, "SELECT {$labelSql} label,MIN(DATE(o.completed_at)) raw_date,ROUND(SUM(pay.final_amount),2) value,COUNT(DISTINCT o.order_id) secondary
            FROM sales_orders o INNER JOIN ({$paid}) pay ON pay.order_id=o.order_id WHERE {$where}
            GROUP BY {$groupSql},{$labelSql} ORDER BY {$groupSql}", $params);
        $groupChart = ['id'=>'sales-trend','title'=>'Net sales over time','type'=>'line','tone'=>'sales','rows'=>$groupRows];
    } elseif (in_array($group, ['cashier','sales_clerk','payment_method'], true)) {
        $groupSql = match ($group) {
            'cashier' => "COALESCE(NULLIF(u.full_name,''),u.username,'Unassigned')",
            'sales_clerk' => "COALESCE(NULLIF(u.full_name,''),u.username,'Unassigned')",
            default => 'UPPER(pay.payment_method)',
        };
        $join = $group === 'cashier' ? 'LEFT JOIN users u ON u.user_id=COALESCE(o.assigned_cashier_id,pay.cashier_id)'
            : ($group === 'sales_clerk' ? 'LEFT JOIN users u ON u.user_id=o.sales_clerk_id' : '');
        $groupRows = reportRows($pdo, "SELECT {$groupSql} label,ROUND(SUM(pay.final_amount),2) value,COUNT(DISTINCT o.order_id) secondary
            FROM sales_orders o INNER JOIN ({$paid}) pay ON pay.order_id=o.order_id {$join} WHERE {$where}
            GROUP BY {$groupSql} ORDER BY value DESC LIMIT 10", $params);
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
    $payment = reportRows($pdo, "SELECT UPPER(pay.payment_method) label,ROUND(SUM(pay.final_amount),2) value,COUNT(DISTINCT o.order_id) secondary
        FROM sales_orders o INNER JOIN ({$paid}) pay ON pay.order_id=o.order_id WHERE {$where}
        GROUP BY pay.payment_method ORDER BY value DESC", $params);

    $rowWhere = $where;
    $rowParams = $params;
    if ($f['search'] !== '') {
        $rowWhere .= ' AND (o.order_no LIKE :order_search OR r.receipt_no LIKE :receipt_search OR o.customer_name LIKE :customer_search)';
        $rowParams[':order_search'] = $rowParams[':receipt_search'] = $rowParams[':customer_search'] = '%' . $f['search'] . '%';
    }
    $count = reportRow($pdo, "SELECT COUNT(DISTINCT o.order_id) total FROM sales_orders o INNER JOIN ({$paid}) pay ON pay.order_id=o.order_id LEFT JOIN sales_receipts r ON r.order_id=o.order_id WHERE {$rowWhere}", $rowParams);
    $sortMap = ['report_date'=>'o.completed_at','reference'=>'reference','cashier'=>'cashier','sales_clerk'=>'sales_clerk','final_total'=>'final_total','item_count'=>'item_count','subtotal'=>'o.subtotal','discount'=>'discount','vatable_sales'=>'vatable_sales','vat'=>'vat','payment_method'=>'payment_method','status'=>'status'];
    $sort = $sortMap[$f['sort']] ?? 'o.completed_at';
    $rowParams[':limit']=$f['page_size']; $rowParams[':offset']=$f['offset'];
    $rows = reportRows($pdo, "SELECT DATE_FORMAT(o.completed_at,'%Y-%m-%d %H:%i') report_date,o.order_id,
        COALESCE(r.receipt_no,o.order_no) reference,COALESCE(NULLIF(ca.full_name,''),ca.username,'Unassigned') cashier,
        COALESCE(NULLIF(sc.full_name,''),sc.username,'Unassigned') sales_clerk,COALESCE(items.item_count,0) item_count,
        o.subtotal,COALESCE(pay.sales_clerk_discount,o.discount,0)+COALESCE(pay.cashier_discount_amount,0) discount,
        GREATEST(pay.payment_total-o.vat,0) vatable_sales,o.vat vat,
        pay.refund_amount refund_reversal,pay.final_amount final_total,UPPER(pay.payment_method) payment_method,'Completed' status
        FROM sales_orders o INNER JOIN ({$paid}) pay ON pay.order_id=o.order_id
        LEFT JOIN (SELECT order_id,SUM(quantity) item_count FROM sales_order_items GROUP BY order_id) items ON items.order_id=o.order_id
        LEFT JOIN sales_receipts r ON r.order_id=o.order_id LEFT JOIN users ca ON ca.user_id=COALESCE(o.assigned_cashier_id,pay.cashier_id)
        LEFT JOIN users sc ON sc.user_id=o.sales_clerk_id WHERE {$rowWhere}
        ORDER BY {$sort} {$f['direction']} LIMIT :limit OFFSET :offset", $rowParams);

    $charts = [$groupChart];
    if ($group !== 'product') $charts[] = ['id'=>'top-products','title'=>'Top five products by units sold','type'=>'bar','orientation'=>'horizontal','tone'=>'inventory','rows'=>$topProducts];
    $cashierReport = !$role['management'] && $role['cashier'];
    $paymentSales = array_column($payment, 'value', 'label');
    if ($cashierReport) {
      $sortMap = ['transaction_id'=>'o.order_no','date_time'=>'o.completed_at','items'=>'items','total_amount'=>'total_amount','discount'=>'discount','vat'=>'vat','payment_method'=>'payment_method','status'=>'status'];
      $sort = $sortMap[$f['sort']] ?? 'o.completed_at';
      $rows = reportRows($pdo, "SELECT o.order_no transaction_id,DATE_FORMAT(o.completed_at,'%Y-%m-%d %H:%i') date_time,
        COALESCE(items.item_summary,'') items,pay.final_amount total_amount,
        COALESCE(pay.sales_clerk_discount,o.discount,0)+COALESCE(pay.cashier_discount_amount,0) discount,
        o.vat vat,UPPER(pay.payment_method) payment_method,o.status status
        FROM sales_orders o INNER JOIN ({$paid}) pay ON pay.order_id=o.order_id
        LEFT JOIN (SELECT order_id,GROUP_CONCAT(CONCAT(product_name,' (x',quantity,')') ORDER BY order_item_id SEPARATOR ', ') item_summary FROM sales_order_items GROUP BY order_id) items ON items.order_id=o.order_id
        LEFT JOIN sales_receipts r ON r.order_id=o.order_id
        WHERE {$rowWhere} ORDER BY {$sort} {$f['direction']} LIMIT :limit OFFSET :offset", $rowParams);
      $columns = ['transaction_id'=>'Transaction ID','date_time'=>'Date & Time','items'=>'Items','total_amount'=>'Total Amount','discount'=>'Discount','vat'=>'VAT','payment_method'=>'Payment Method','status'=>'Status'];
      $numericColumns = [];
      $currencyColumns = ['total_amount','discount','vat'];
      $summaryCards = [
        reportCard('Today\'s Net Sales',(float)$summary['net_sales'],'currency','fa-peso-sign','blue'),
        reportCard('Completed Transactions',(int)$summary['transactions'],'number','fa-receipt','blue'),
        reportCard('Items Sold',(int)$summary['items_sold'],'number','fa-box','teal'),
        reportCard('Cash Sales',(float)($paymentSales['CASH']??0),'currency','fa-money-bill-wave','green'),
        reportCard('GCash Sales',(float)($paymentSales['GCASH']??0),'currency','fa-mobile-screen-button','blue'),
        reportCard('Discounts',(float)$summary['discounts'],'currency','fa-tags','amber'),
        reportCard('VAT',(float)$summary['vat'],'currency','fa-percent','teal'),
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
        reportCard('VAT',(float)$summary['vat'],'currency','fa-percent','blue'),
      ];
    }
    return [
      'summary'=>$summaryCards,
        'charts'=>$charts,
        'insights'=>[['title'=>'Payment methods','tone'=>'sales','rows'=>$payment,'format'=>'currency']],
        'columns'=>$columns,
        'numeric_columns'=>$numericColumns,'currency_columns'=>$currencyColumns,'rows'=>$rows,
        'pagination'=>reportPagination((int)($count['total']??0),$f),
        'notes'=>[
            'Net Sales = completed paid final amounts − recorded refunded amounts. Cancelled, unpaid, and incomplete transactions are excluded.',
            'Gross / Subtotal is the sum of VAT-inclusive item prices. Discount is the stored sales-clerk discount plus cashier discount. VATable Sales and VAT use the saved completed-order snapshot; VAT is extracted from, not added to, the final price. Refund / Reversal is the recorded refunded final amount.',
            'Product/category net sales are allocated proportionally from each transaction’s final amount using item line subtotal ÷ order subtotal. Transactions are aggregated before item joins to prevent duplicate totals.',
        ],
    ];
}

function inventoryBaseSql(array $f, array &$params): string
{
    $productFilter=reportProductFilterSql($f,$params);
    if($f['supplier_id']!==''){$params[':supplier_id']=$f['supplier_id'];$productFilter.=' AND b.supplier_id=:supplier_id';}
    $spec=reportProductSpecificationSql();
    return "SELECT p.product_id,p.brand_name,p.product_name,{$spec} specification,COALESCE(pc.category_name,'Uncategorized') category,
        COALESCE(pt.type_name,'Unspecified') product_type,
        COALESCE(SUM(CASE WHEN b.batch_status='active' AND (b.expiry_date IS NULL OR b.expiry_date>=CURDATE()) THEN b.shelf_qty ELSE 0 END),0) shelf_stock,
        COALESCE(SUM(CASE WHEN b.batch_status='active' AND (b.expiry_date IS NULL OR b.expiry_date>=CURDATE()) THEN b.storage_qty ELSE 0 END),0) storage_stock,
        COALESCE(SUM(CASE WHEN b.batch_status='active' AND (b.expiry_date IS NULL OR b.expiry_date>=CURDATE()) THEN (b.shelf_qty+b.storage_qty)*COALESCE(b.unit_cost,0) ELSE 0 END),0) inventory_value,
        10 reorder_level,
        CASE WHEN COALESCE(SUM(CASE WHEN b.batch_status='active' AND (b.expiry_date IS NULL OR b.expiry_date>=CURDATE()) THEN b.shelf_qty+b.storage_qty ELSE 0 END),0)<0 THEN 'Negative Stock — Data Issue'
             WHEN COALESCE(SUM(CASE WHEN b.batch_status='active' AND (b.expiry_date IS NULL OR b.expiry_date>=CURDATE()) THEN b.shelf_qty+b.storage_qty ELSE 0 END),0)=0 THEN 'Out of Stock'
             WHEN COALESCE(SUM(CASE WHEN b.batch_status='active' AND (b.expiry_date IS NULL OR b.expiry_date>=CURDATE()) THEN b.shelf_qty+b.storage_qty ELSE 0 END),0)<=10 THEN 'Low Stock' ELSE 'Healthy' END stock_status,
        CASE WHEN COALESCE(SUM(CASE WHEN b.batch_status='active' AND (b.expiry_date IS NULL OR b.expiry_date>=CURDATE()) THEN b.shelf_qty+b.storage_qty ELSE 0 END),0)<>0
             THEN SUM(CASE WHEN b.batch_status='active' AND (b.expiry_date IS NULL OR b.expiry_date>=CURDATE()) THEN (b.shelf_qty+b.storage_qty)*COALESCE(b.unit_cost,0) ELSE 0 END)/
                  SUM(CASE WHEN b.batch_status='active' AND (b.expiry_date IS NULL OR b.expiry_date>=CURDATE()) THEN b.shelf_qty+b.storage_qty ELSE 0 END) ELSE 0 END unit_cost
        FROM product p LEFT JOIN product_categories pc ON pc.category_id=p.category_id LEFT JOIN product_types pt ON pt.type_id=p.type_id
        LEFT JOIN medicine_details md ON md.product_id=p.product_id LEFT JOIN grocery_details gd ON gd.product_id=p.product_id
        LEFT JOIN inventory_batches b ON b.product_id=p.product_id WHERE 1=1{$productFilter}
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
    $sortMap=['po_number'=>'po.po_number','order_date'=>'po.created_at','supplier_name'=>'s.supplier_name','ordered_qty'=>'ordered_qty','received_qty'=>'received_qty','accepted_qty'=>'accepted_qty','returned_qty'=>'returned_qty','damaged_qty'=>'damaged_qty','original_total'=>'po.total_amount','accepted_value'=>'accepted_value','final_payable'=>'po.final_payment','amount_paid'=>'amount_paid','remaining_balance'=>'remaining_balance','delivery_status'=>'po.status','payment_status'=>'payment_status'];
    $sort=$sortMap[$f['sort']]??'po.created_at';$params[':limit']=$f['page_size'];$params[':offset']=$f['offset'];
    $rows=reportRows($pdo,"SELECT po.po_number,DATE(po.created_at) order_date,s.supplier_name,COALESCE(item.ordered_qty,0) ordered_qty,
      COALESCE(rec.received_qty,0) received_qty,GREATEST(COALESCE(rec.received_qty,0)-COALESCE(ret.returned_qty,0)-COALESCE(ret.rejected_qty,0),0) accepted_qty,
      COALESCE(ret.returned_qty,0) returned_qty,COALESCE(rec.damaged_qty,0) damaged_qty,po.total_amount original_total,
      CASE WHEN po.status='Delivered' THEN COALESCE(NULLIF(po.final_payment,0),po.total_amount,0) ELSE 0 END accepted_value,
                CASE WHEN po.status='Delivered' THEN po.final_payment ELSE 0 END final_payable,
      COALESCE(pay.amount_paid,0) amount_paid,
                CASE WHEN po.status='Delivered' THEN GREATEST(po.final_payment-COALESCE(pay.amount_paid,0),0) ELSE 0 END remaining_balance,
                po.status delivery_status,CASE WHEN po.status='Cancelled' THEN 'Cancelled' WHEN po.status<>'Delivered' THEN 'Not Yet Payable' ELSE po.payment_status END payment_status
      FROM purchase_orders po JOIN suppliers s ON s.supplier_id=po.supplier_id {$joins} WHERE {$whereSql}
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
        'columns'=>['po_number'=>'PO Number','order_date'=>'Order Date','supplier_name'=>'Supplier','ordered_qty'=>'Ordered Qty','received_qty'=>'Received Qty','accepted_qty'=>'Accepted Qty','returned_qty'=>'Returned Qty','damaged_qty'=>'Damaged Qty','original_total'=>'Original Total','accepted_value'=>'Accepted Value','final_payable'=>'Final Payable','amount_paid'=>'Amount Paid','remaining_balance'=>'Remaining Balance','delivery_status'=>'Delivery Status','payment_status'=>'Payment Status'],
        'numeric_columns'=>['ordered_qty','received_qty','accepted_qty','returned_qty','damaged_qty'],'currency_columns'=>['original_total','accepted_value','final_payable','amount_paid','remaining_balance'],
        'rows'=>$rows,'pagination'=>reportPagination((int)($count['total']??0),$f),
        'notes'=>[
            'Draft and Pending POs do not have a monetary commitment until the actual supplier receipt total is entered at arrival.',
            'Original PO value uses purchase_orders.total_amount only. It never falls back to supplier reference costs or item line totals. For delivered POs, purchase_orders.final_payment remains the authoritative adjusted payable when present.',
            'Accepted Qty = received quantity − quantities returned for credit/replacement − rejected quantities. Accepted Value uses the adjusted PO payable without allocating the overall receipt total across items.',
            'Supplier performance includes only Delivered POs. On-time = received by expected date; fulfillment = received ÷ ordered; accepted = accepted ÷ received; return/damage = returned or rejected ÷ received; delay counts days after expected delivery.',
            'Amount Paid is retained in the response and detail table; Final Payable and Outstanding Payables are emphasized as management liabilities.'
        ]];
}

function expiryReport(PDO $pdo,array $f): array
{
    $params=[':expiry_end'=>date('Y-m-d',strtotime('+'.$f['expiry_days'].' days'))];$extra=reportProductFilterSql($f,$params);
    if($f['supplier_id']!==''){$extra.=' AND b.supplier_id=:supplier_id';$params[':supplier_id']=$f['supplier_id'];}
    $spec=reportProductSpecificationSql();
    $base="FROM inventory_batches b JOIN product p ON p.product_id=b.product_id LEFT JOIN product_categories pc ON pc.category_id=p.category_id
      LEFT JOIN medicine_details md ON md.product_id=p.product_id LEFT JOIN grocery_details gd ON gd.product_id=p.product_id
      LEFT JOIN suppliers s ON s.supplier_id=b.supplier_id WHERE b.expiry_date IS NOT NULL AND b.batch_status<>'depleted'
      AND (b.shelf_qty+b.storage_qty)>0 AND b.expiry_date<=:expiry_end{$extra}";
    $s=reportRow($pdo,"SELECT COALESCE(SUM(b.expiry_date<CURDATE()),0) expired_batches,COALESCE(SUM(b.expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(),INTERVAL 7 DAY)),0) expiring_7,
      COALESCE(SUM(b.expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(),INTERVAL 30 DAY)),0) expiring_30,COALESCE(SUM(b.shelf_qty+b.storage_qty),0) quantity_risk,
      COALESCE(SUM((b.shelf_qty+b.storage_qty)*COALESCE(b.unit_cost,0)),0) cost_risk {$base}",$params);
    $windows=reportRows($pdo,"SELECT CASE WHEN b.expiry_date<CURDATE() THEN 'Expired' WHEN DATEDIFF(b.expiry_date,CURDATE())<=7 THEN '0–7 days' WHEN DATEDIFF(b.expiry_date,CURDATE())<=30 THEN '8–30 days' ELSE '31+ days' END label,SUM(b.shelf_qty+b.storage_qty) value {$base} GROUP BY label ORDER BY MIN(b.expiry_date)",$params);
    $costs=reportRows($pdo,"SELECT COALESCE(pc.category_name,'Uncategorized') label,ROUND(SUM((b.shelf_qty+b.storage_qty)*COALESCE(b.unit_cost,0)),2) value {$base} GROUP BY pc.category_id,pc.category_name ORDER BY value DESC",$params);
    $count=reportRow($pdo,"SELECT COUNT(*) total {$base}",$params);$params[':limit']=$f['page_size'];$params[':offset']=$f['offset'];
    $sortMap=['product_name'=>'p.product_name','brand_name'=>'p.brand_name','expiry_date'=>'b.expiry_date','days_remaining'=>'days_remaining','quantity_at_risk'=>'quantity_at_risk','cost_at_risk'=>'cost_at_risk','expiry_status'=>'expiry_status'];$sort=$sortMap[$f['sort']]??'b.expiry_date';
    $rows=reportRows($pdo,"SELECT p.product_name,p.brand_name,{$spec} specification,COALESCE(b.legacy_inventory_id,b.batch_id) batch_reference,
      COALESCE(s.supplier_name,'Unknown') supplier,b.expiry_date,DATEDIFF(b.expiry_date,CURDATE()) days_remaining,b.shelf_qty,b.storage_qty,
      b.shelf_qty+b.storage_qty quantity_at_risk,(b.shelf_qty+b.storage_qty)*COALESCE(b.unit_cost,0) cost_at_risk,
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
        'notes'=>['Only active, non-depleted batches with positive shelf or storage quantity are included.','Cost at Risk = (shelf quantity + storage quantity) × inventory_batches.unit_cost.']];
}

function productReport(PDO $pdo,array $f,array $role): array
{
    [$where,$params]=reportSalesWhere($f,$role);$paid=reportPaidSalesSubquery();$productParams=$params;$filter=reportProductFilterSql($f,$productParams);$spec=reportProductSpecificationSql();
    $sales=reportRows($pdo,"SELECT p.product_id,p.brand_name,p.product_name,{$spec} specification,COALESCE(pc.category_name,'Uncategorized') category,
      COALESCE(SUM(i.quantity),0) sold_qty,COALESCE(SUM(CASE WHEN o.subtotal>0 THEN i.line_total/o.subtotal*pay.final_amount ELSE 0 END),0) revenue,MAX(o.completed_at) last_sale
      FROM product p LEFT JOIN product_categories pc ON pc.category_id=p.category_id LEFT JOIN medicine_details md ON md.product_id=p.product_id LEFT JOIN grocery_details gd ON gd.product_id=p.product_id
      LEFT JOIN (sales_order_items i INNER JOIN sales_orders o ON o.order_id=i.order_id INNER JOIN ({$paid}) pay ON pay.order_id=o.order_id AND {$where}) ON i.product_id=p.product_id
      WHERE 1=1{$filter} GROUP BY p.product_id,p.brand_name,p.product_name,pc.category_name,md.generic_name,md.strength_value,md.strength_unit,md.strength,md.dosage_form,md.package_type,gd.variant,gd.size,gd.net_weight,gd.unit,gd.package_type",$productParams);
    $inv=reportRows($pdo,"SELECT product_id,SUM(CASE WHEN batch_status='active' AND (expiry_date IS NULL OR expiry_date>=CURDATE()) THEN shelf_qty+storage_qty ELSE 0 END) on_hand FROM inventory_batches GROUP BY product_id");
    $map=[];foreach($inv as $r)$map[$r['product_id']]=(int)$r['on_hand'];$selling=array_filter($sales,fn($r)=>(int)$r['sold_qty']>0);$avgSales=count($selling)?array_sum(array_column($selling,'sold_qty'))/count($selling):0;
    $stocked=array_filter($sales,fn($r)=>($map[$r['product_id']]??0)>0);$avgStock=count($stocked)?array_sum(array_map(fn($r)=>$map[$r['product_id']]??0,$stocked))/count($stocked):0;
    foreach($sales as &$r){$r['sold_qty']=(int)$r['sold_qty'];$r['revenue']=(float)$r['revenue'];$r['on_hand']=$map[$r['product_id']]??0;$r['sell_through_rate']=$r['sold_qty']+$r['on_hand']>0?round(100*$r['sold_qty']/($r['sold_qty']+$r['on_hand']),1):0;$r['days_since_last_sale']=$r['last_sale']!==null?(int)((new DateTime($r['last_sale']))->diff(new DateTime())->days):null;
      if($r['on_hand']>0&&$r['sold_qty']===0)$r['performance_status']='No Sales';elseif($r['on_hand']>=$avgStock&&$r['sold_qty']<=$avgSales*.25)$r['performance_status']='High Stock / Low Sales';elseif($r['sold_qty']>0&&$r['sold_qty']<=$avgSales*.25)$r['performance_status']='Slow Moving';elseif(count($selling)>1&&$r['sold_qty']>=$avgSales)$r['performance_status']='Fast Moving';else $r['performance_status']='Steady';}unset($r);
    usort($sales,fn($a,$b)=>$b['revenue']<=>$a['revenue']);$topQty=$sales;$topRevenue=$sales;usort($topQty,fn($a,$b)=>$b['sold_qty']<=>$a['sold_qty']);
    $chart=static fn($rows,$field)=>array_map(fn($r)=>['label'=>$r['brand_name'].' — '.$r['product_name'],'value'=>$r[$field]],array_slice(array_values(array_filter($rows,fn($r)=>$r[$field]>0)),0,5));
    $s=['sold'=>array_sum(array_column($sales,'sold_qty')),'revenue'=>array_sum(array_column($sales,'revenue')),'no'=>count(array_filter($sales,fn($r)=>$r['performance_status']==='No Sales')),'slow'=>count(array_filter($sales,fn($r)=>$r['performance_status']==='Slow Moving')),'high'=>count(array_filter($sales,fn($r)=>$r['performance_status']==='High Stock / Low Sales'))];
    $sales=reportSortArray($sales,$f);
    return ['summary'=>[
        reportCard('Units Sold',$s['sold'],'number','fa-box','teal'),reportCard('Product Revenue',$s['revenue'],'currency','fa-chart-column','blue'),
        reportCard('Products with No Sales',$s['no'],'number','fa-circle-minus','gray'),reportCard('Slow-Moving Products',$s['slow'],'number','fa-gauge-low','amber'),reportCard('High Stock / Low Sales',$s['high'],'number','fa-boxes-stacked','red')],
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
    $count = reportRow($pdo, "SELECT COUNT(*) total FROM purchase_requests WHERE request_date>=:start_date AND request_date<:end_date", $params);
    $params[':limit']=$f['page_size']; $params[':offset']=$f['offset'];
    $rows = reportRows($pdo, "SELECT pr.pr_number,pr.request_date,COALESCE(NULLIF(u.full_name,''),u.username,'Unknown') requested_by,
        COUNT(pri.pr_item_id) item_count,COALESCE(SUM(pri.requested_qty),0) requested_quantity,pr.status,
        COALESCE(NULLIF(su.full_name,''),su.username,'—') reviewed_by,pr.decided_at
        FROM purchase_requests pr INNER JOIN users u ON u.user_id=pr.requested_by
        LEFT JOIN users su ON su.user_id=pr.supervisor_user_id LEFT JOIN purchase_request_items pri ON pri.pr_id=pr.pr_id
        WHERE pr.request_date>=:start_date AND pr.request_date<:end_date
        GROUP BY pr.pr_id,pr.pr_number,pr.request_date,u.full_name,u.username,pr.status,su.full_name,su.username,pr.decided_at
        ORDER BY pr.request_date DESC,pr.created_at DESC LIMIT :limit OFFSET :offset", $params);
    return [
        'summary'=>[
            reportCard('Pending Approval',(int)($summaryMap['Pending Supervisor Approval']??0),'number','fa-clock','indigo'),
            reportCard('Approved',(int)($summaryMap['Approved']??0),'number','fa-circle-check','green'),
            reportCard('Revision Requested',(int)($summaryMap['Revision Requested']??0),'number','fa-rotate-left','amber'),
            reportCard('Rejected',(int)($summaryMap['Rejected']??0),'number','fa-circle-xmark','red')],
        'charts'=>[['id'=>'pr-status','title'=>'Purchase request approval status','type'=>'doughnut','tone'=>'status','rows'=>$statusRows]],
        'columns'=>['pr_number'=>'PR Number','request_date'=>'Request Date','requested_by'=>'Requested By','item_count'=>'Items','requested_quantity'=>'Requested Qty','status'=>'Status','reviewed_by'=>'Reviewed By','decided_at'=>'Decision Date'],
        'numeric_columns'=>['item_count','requested_quantity'],'currency_columns'=>[],'rows'=>$rows,
        'pagination'=>reportPagination((int)($count['total']??0),$f),
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
    $prs=supervisorPurchaseRequestReport($pdo,$filters);
    return [
        'summary'=>array_merge(array_slice($inventory['summary'],0,5),array_slice($prs['summary'],0,1)),
        'charts'=>[$inventory['charts'][1],$products['charts'][0],$expiry['charts'][0],$prs['charts'][0]],
        'attention'=>[], 'overview_previews'=>[], 'columns'=>[], 'numeric_columns'=>[], 'currency_columns'=>[], 'rows'=>[],
        'pagination'=>reportPagination(0,$f),
        'notes'=>['Inventory Supervisor overview contains current inventory, expiry, product movement, and purchase-request approval information only. Financial and staff-performance reports are excluded.']];
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

    $expiryRisk=reportRow($pdo,"SELECT
      SUM(b.expiry_date<CURDATE()) expired,
      SUM(b.expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(),INTERVAL 7 DAY)) within_7,
      SUM(b.expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(),INTERVAL 30 DAY)) within_30,
      SUM(b.expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(),INTERVAL 60 DAY)) within_60,
      SUM(CASE WHEN b.expiry_date<=DATE_ADD(CURDATE(),INTERVAL 60 DAY) THEN b.shelf_qty+b.storage_qty ELSE 0 END) quantity_at_risk,
      SUM(CASE WHEN b.expiry_date<=DATE_ADD(CURDATE(),INTERVAL 30 DAY) THEN (b.shelf_qty+b.storage_qty)*COALESCE(b.unit_cost,0) ELSE 0 END) cost_at_risk_30,
      SUM(CASE WHEN b.expiry_date<=DATE_ADD(CURDATE(),INTERVAL 60 DAY) THEN (b.shelf_qty+b.storage_qty)*COALESCE(b.unit_cost,0) ELSE 0 END) cost_at_risk
      FROM inventory_batches b
      WHERE b.expiry_date IS NOT NULL AND b.batch_status='active' AND (b.shelf_qty+b.storage_qty)>0");
    $expiryChartRows=reportRows($pdo,"SELECT
      CASE
        WHEN b.expiry_date<CURDATE() THEN 'Expired'
        WHEN b.expiry_date<=DATE_ADD(CURDATE(),INTERVAL 7 DAY) THEN 'Within 7 days'
        WHEN b.expiry_date<=DATE_ADD(CURDATE(),INTERVAL 30 DAY) THEN 'Within 30 days'
        ELSE 'Within 60 days'
      END label,
      COUNT(DISTINCT b.batch_id) batch_count,
      SUM(b.shelf_qty+b.storage_qty) quantity_at_risk,
      ROUND(SUM((b.shelf_qty+b.storage_qty)*COALESCE(b.unit_cost,0)),2) cost_at_risk
      FROM inventory_batches b
      WHERE b.expiry_date IS NOT NULL AND b.batch_status='active'
        AND (b.shelf_qty+b.storage_qty)>0
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
    return [
      'summary'=>[$sales['summary'][0],$sales['summary'][1],$sales['summary'][3],$inventory['summary'][5],reportCard('Cost at Risk',(float)($expiryRisk['cost_at_risk_30']??0),'currency','fa-coins','red'),$purchases['summary'][5]],
      'charts'=>[$salesChart],
      'attention'=>$attention,
      'overview_previews'=>[
        'top_products'=>['rows'=>$topProducts,'href'=>$links['products']],
        'inventory_health'=>['healthy'=>(int)$inventoryHealth['healthy'],'low_stock'=>(int)$inventoryHealth['low_stock'],'out_of_stock'=>(int)$inventoryHealth['out_of_stock'],'data_issues'=>(int)$inventoryHealth['data_issues'],'total_products'=>(int)$inventoryHealth['total_products'],'total_on_hand'=>(int)$inventoryHealth['total_on_hand'],'shelf_stock'=>(int)$inventoryHealth['shelf_stock'],'storage_stock'=>(int)$inventoryHealth['storage_stock'],'href'=>$links['inventory']],
        'expiry_risk'=>['expired'=>(int)($expiryRisk['expired']??0),'within_7'=>(int)($expiryRisk['within_7']??0),'within_30'=>(int)($expiryRisk['within_30']??0),'within_60'=>(int)($expiryRisk['within_60']??0),'quantity_at_risk'=>(int)($expiryRisk['quantity_at_risk']??0),'cost_at_risk'=>(float)($expiryRisk['cost_at_risk']??0),'chart_rows'=>$expiryChartRows,'href'=>$links['expiry']],
        'purchase_status'=>['statuses'=>$poStatuses,'arrived_awaiting_inspection'=>$arrived,'open_commitments'=>(float)$purchases['summary'][0]['value'],'outstanding_payable'=>(float)$purchases['summary'][5]['value'],'href'=>$links['purchases']],
        'staff_activity'=>['active_cashiers'=>(int)($staff['active_cashiers']??0),'active_sales_clerks'=>(int)($staff['active_sales_clerks']??0),'cashiers'=>$topCashiers,'sales_clerks'=>$topClerks,'completed_transactions'=>(int)($staff['completed_transactions']??0),'average_transaction'=>(float)($staff['average_transaction']??0),'href'=>$links['staff']],
      ],
      'columns'=>$sales['columns'],'numeric_columns'=>$sales['numeric_columns'],'currency_columns'=>$sales['currency_columns'],
      'rows'=>$sales['rows'],'pagination'=>$sales['pagination'],
      'notes'=>array_merge($sales['notes'],['Inventory Health and Expiry Risk are current active-stock values; time-based sales, product, purchase, and staff previews use the selected Overview date range.'])
    ];
}

try {
    reportApplyConfiguredTimezone($pdo);$role=reportRoleContext();$f=reportFilters();$defaultCategory=$role['cashier']&&!$role['management']?'sales':'overview';$category=strtolower(trim((string)($_GET['category']??$defaultCategory)));
    if(!in_array($category,$role['available_categories'],true)){http_response_code(403);echo json_encode(['status'=>'error','message'=>'You do not have access to this report category.','access'=>$role]);exit;}
    $report=match($category){'sales'=>salesReport($pdo,$f,$role),'inventory'=>inventoryReport($pdo,$f),'purchases'=>(!empty($role['supervisor'])?supervisorPurchaseRequestReport($pdo,$f):purchasesReport($pdo,$f)),'expiry'=>expiryReport($pdo,$f),'products'=>(!empty($role['supervisor'])?supervisorProductReport($pdo,$f,$role):productReport($pdo,$f,$role)),'staff'=>staffReport($pdo,$f,$role),default=>overviewReport($pdo,$f,$role)};
    echo json_encode(['status'=>'success','category'=>$category,'access'=>$role,'system'=>reportSystem($pdo,$role,$f),'filters'=>reportFilterOptions($pdo,$role)]+$report,JSON_UNESCAPED_UNICODE|JSON_INVALID_UTF8_SUBSTITUTE);
} catch(InvalidArgumentException $e){http_response_code(422);echo json_encode(['status'=>'error','message'=>$e->getMessage()]);}
catch(Throwable $e){error_log('Reports error: '.$e->getMessage());http_response_code(500);echo json_encode(['status'=>'error','message'=>'Unable to generate the selected report.']);}
