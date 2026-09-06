<?php

declare(strict_types=1);
ob_start();

require_once __DIR__ . '/../pharma-api/config/db_connection.php';
require_once __DIR__ . '/../pharma-api/config/id_helpers.php';

function supplierEligibilityAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

function supplierEligibilitySession(PDO $pdo, string $role): array
{
    $stmt = $pdo->prepare("SELECT user_id, username, full_name, role, status FROM users WHERE role = :role AND status = 'Active' AND COALESCE(is_deleted, 0) = 0 LIMIT 1");
    $stmt->execute([':role' => $role]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    supplierEligibilityAssert((bool) $user, "An active {$role} account is required.");

    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    $phpSessionId = 'codexsupplier' . bin2hex(random_bytes(8));
    $tabToken = bin2hex(random_bytes(32));
    $authSessionId = newUuid($pdo);
    session_id($phpSessionId);
    session_start();
    $_SESSION = [
        'user_id' => $user['user_id'], 'username' => $user['username'], 'full_name' => $user['full_name'],
        'role' => $user['role'], 'roles' => [$user['role']],
        'role_identifiers' => ['ro-' . str_replace('_', '-', $user['role'])],
        'user_status' => $user['status'], 'auth_session_id' => $authSessionId,
        'tab_token_hash' => hash('sha256', $tabToken),
    ];
    session_write_close();

    $pdo->prepare(
        'INSERT INTO auth_sessions
            (auth_session_id, php_session_id, user_id, session_token_hash, expires_at, ip_address, user_agent)
         VALUES (:auth_session_id, :php_session_id, :user_id, :session_token_hash, :expires_at, :ip_address, :user_agent)'
    )->execute([
        ':auth_session_id' => $authSessionId, ':php_session_id' => $phpSessionId,
        ':user_id' => $user['user_id'], ':session_token_hash' => hash('sha256', $tabToken),
        ':expires_at' => date('Y-m-d H:i:s', time() + 3600),
        ':ip_address' => '127.0.0.1', ':user_agent' => 'Codex supplier eligibility test',
    ]);
    return compact('phpSessionId', 'tabToken', 'authSessionId') + ['user' => $user];
}

function supplierEligibilityApi(string $method, string $path, array $session, ?array $payload = null): array
{
    $curl = curl_init('http://127.0.0.1/PharmacySystem_for_DocR/pharma-api/v1/' . ltrim($path, '/'));
    $headers = ['Accept: application/json', 'X-Tab-Token: ' . $session['tabToken']];
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true, CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_COOKIE => 'PHPSESSID=' . $session['phpSessionId'], CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT => 20,
    ]);
    if ($payload !== null) {
        $headers[] = 'Content-Type: application/json';
        curl_setopt($curl, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($curl, CURLOPT_POSTFIELDS, json_encode($payload, JSON_THROW_ON_ERROR));
    }
    $body = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $error = curl_error($curl);
    curl_close($curl);
    supplierEligibilityAssert($body !== false, 'HTTP request failed: ' . $error);
    return ['status' => $status, 'body' => json_decode((string) $body, true) ?: []];
}


require_once __DIR__ . '/../pharma-api/v1/purchase_requests/purchase_request_helpers.php';
$manager = supplierEligibilitySession($pdo, 'manager');
$supervisor = supplierEligibilitySession($pdo, 'supervisor');
$type = $pdo->query('SELECT type_id FROM product_types LIMIT 1')->fetchColumn();
$supplier = $pdo->query('SELECT supplier_id FROM suppliers WHERE archived_at IS NULL LIMIT 1')->fetchColumn();
$products = []; $requests = [];
try {
    foreach ([['Tablet', 'Carton', [['unit'=>'Box','quantity'=>5],['unit'=>'Blister Pack','quantity'=>10],['unit'=>'Tablet','quantity'=>10]], 'Box', 5, 500, 1],
              ['Bottle', 'Case', [['unit'=>'Bottle','quantity'=>24]], 'Case', 2, 48, 2],
              ['Tablet', 'Carton', [['unit'=>'Box','quantity'=>5],['unit'=>'Blister Pack','quantity'=>10],['unit'=>'Tablet','quantity'=>10]], 'Box', 5, 500, 0],
              ['Tablet', 'Box', [['unit'=>'Blister Pack','quantity'=>10],['unit'=>'Tablet','quantity'=>10]], 'Box', 5, 500, 4]] as [$base,$purchase,$levels,$unit,$qty,$expected,$orderQty]) {
        $stmt = $pdo->prepare('SELECT measurement_unit_id FROM product_measurement_units WHERE unit_name=? LIMIT 1');
        $stmt->execute([$base]); $unitId = $stmt->fetchColumn();
        supplierEligibilityAssert((bool)$unitId, "Missing fixture unit {$base}");
        $product = newUuid($pdo); $products[] = $product; $sp = newUuid($pdo);
        $pdo->prepare("INSERT INTO product(product_id,barcode,product_name,brand_name,price,type_id,inventory_unit_id,status) VALUES(?,?,?,'Packaging regression',1,?,?,'Active')")->execute([$product,$product,'Packaging '.$base,$type,$unitId]);
        $setup = ['purchase_unit'=>$purchase,'inventory_unit'=>$base,'hierarchy_levels'=>$levels];
        $conversion = supplierPurchasingConversion($setup);
        $pdo->prepare('INSERT INTO supplier_products(supplier_product_id,supplier_id,product_id,purchase_unit,inventory_unit,units_per_purchase_unit) VALUES(?,?,?,?,?,?)')->execute([$sp,$supplier,$product,$purchase,$base,$conversion['base_qty_per_purchase_unit']]);
        syncSupplierProductUnitConversions($pdo,$sp,$setup);
        $candidates = supplierEligibilityApi('GET','purchase_requests/get_pr_candidates.php',$manager);
        supplierEligibilityAssert($candidates['status']===200, 'Candidate API failed: '.json_encode($candidates));
        $candidate = array_values(array_filter($candidates['body']['data'],fn($r)=>$r['product_id']===$product))[0];
        supplierEligibilityAssert(count($candidate['packaging_units'])===count($levels)+1,'Full hierarchy missing');
        if ($purchase==='Carton') {
            $bad = supplierEligibilityApi('POST','purchase_requests/create_purchase_request.php',$manager,['items'=>[['product_id'=>$product,'requested_qty'=>7,'unit'=>$unit]]]);
            supplierEligibilityAssert($bad['status']===422,'7 Boxes was not blocked');
        }
        $created = supplierEligibilityApi('POST','purchase_requests/create_purchase_request.php',$manager,['submit'=>false,'items'=>[['product_id'=>$product,'requested_qty'=>$qty,'unit'=>$unit]]]);
        supplierEligibilityAssert($created['status']===201,'Create failed: '.json_encode($created));
        $pr = $created['body']['data']['pr_id']; $requests[]=$pr;
        $saved = supplierEligibilityApi('POST','purchase_requests/save_purchase_request.php',$manager,['pr_id'=>$pr,'submit'=>true,'items'=>[['product_id'=>$product,'requested_qty'=>$qty,'unit'=>$unit]]]);
        supplierEligibilityAssert($saved['status']===200,'Save failed: '.json_encode($saved));
        $blocked = supplierEligibilityApi('POST','purchase_requests/generate_purchase_orders.php',$manager,['pr_id'=>$pr]);
        supplierEligibilityAssert($blocked['status']===409,'Pending PR generated PO');
        $read = supplierEligibilityApi('GET','purchase_requests/get_purchase_requests.php?pr_id='.$pr,$supervisor);
        supplierEligibilityAssert($read['status']===200,'Read failed: '.json_encode($read));
        $item=$read['body']['data']['requests'][0]['items'][0];
        supplierEligibilityAssert((float)$item['requested_qty']===$qty*1.0 && $item['unit']===$unit && (float)$item['requested_base_qty']===$expected*1.0,'Request quantity/unit lost');
        $approved = supplierEligibilityApi('POST','purchase_requests/decide_purchase_request.php',$supervisor,['pr_id'=>$pr,'decision'=>'approve','approved_quantities'=>[['pr_item_id'=>$item['pr_item_id'],'approved_qty'=>($orderQty===0 || $orderQty===4 ? 4 : $qty)]]]);
        supplierEligibilityAssert($approved['status']===200,'Approve failed: '.json_encode($approved));
        $payload=['pr_id'=>$pr,'items'=>[['pr_item_id'=>$item['pr_item_id'],'supplier_product_id'=>$sp]],'supplier_etas'=>[$supplier=>date('Y-m-d',time()+86400)]];
        $forbidden=supplierEligibilityApi('POST','purchase_requests/generate_purchase_orders.php',$supervisor,$payload);
        supplierEligibilityAssert($forbidden['status']===403,'Supervisor generated PO');
        $generated=supplierEligibilityApi('POST','purchase_requests/generate_purchase_orders.php',$manager,$payload);
        if ($orderQty===0) {
            supplierEligibilityAssert($generated['status']===409, 'Inexact Supervisor-approved quantity was rounded');
            $stmt=$pdo->prepare('SELECT COUNT(*) FROM purchase_orders WHERE pr_id=?');$stmt->execute([$pr]);
            supplierEligibilityAssert((int)$stmt->fetchColumn()===0, 'Failed generation wrote a PO');
            continue;
        }
        if ($orderQty===4) $expected=400;
        supplierEligibilityAssert($generated['status']===201,'Generate failed: '.json_encode($generated));
        $po=$generated['body']['data']['purchase_orders'][0]['po_id'];
        $detail=supplierEligibilityApi('GET','purchase_orders/get_purchase_order.php?po_id='.$po,$manager);
        supplierEligibilityAssert($detail['status']===200,'PO detail failed: '.json_encode($detail));
        $stmt=$pdo->prepare('SELECT purchase_qty,inventory_qty_ordered FROM purchase_order_items WHERE po_id=?');$stmt->execute([$po]);$row=$stmt->fetch();
        supplierEligibilityAssert((int)$row['purchase_qty']===$orderQty && (int)$row['inventory_qty_ordered']===$expected,'PO conversion incorrect');
        $again=supplierEligibilityApi('POST','purchase_requests/generate_purchase_orders.php',$manager,$payload);
        supplierEligibilityAssert($again['status']===200 && $again['body']['data']['idempotent'],'Duplicate PO generated');
        $read=supplierEligibilityApi('GET','purchase_requests/get_purchase_requests.php?pr_id='.$pr,$manager);
        supplierEligibilityAssert($read['body']['data']['requests'][0]['workflow_status']==='Ordered','Remaining quantity uses wrong unit');
    }
    $setup=['purchase_unit'=>'Carton','inventory_unit'=>'Tablet','hierarchy_levels'=>[['unit'=>'Box','quantity'=>5],['unit'=>'Blister Pack','quantity'=>10],['unit'=>'Tablet','quantity'=>10]]];
    try { purchaseRequestExactOrderQuantity(4,'Box',$setup); throw new RuntimeException('Rounded approved quantity'); } catch (InvalidArgumentException $expectedError) {}
    echo "PASS: medicine 5 Boxes -> 1 Carton / 500 Tablets; beverage 2 Cases -> 48 Bottles; invalid quantities; draft/save; supervisor approval; pending/role guards; changed approvals; independently purchasable Boxes; idempotency; ordered status.\n";
} finally {
    foreach ($requests as $pr) {
        $pdo->prepare('DELETE FROM purchase_order_items WHERE po_id IN (SELECT po_id FROM purchase_orders WHERE pr_id=?)')->execute([$pr]);
        $pdo->prepare('DELETE FROM activity_logs WHERE reference_id IN (SELECT po_id FROM purchase_orders WHERE pr_id=?)')->execute([$pr]);
        $pdo->prepare('DELETE FROM purchase_orders WHERE pr_id=?')->execute([$pr]);
        $pdo->prepare('DELETE FROM activity_logs WHERE reference_id=?')->execute([$pr]);
        $pdo->prepare('DELETE FROM purchase_request_items WHERE pr_id=?')->execute([$pr]);
        $pdo->prepare('DELETE FROM purchase_requests WHERE pr_id=?')->execute([$pr]);
    }
    foreach ($products as $product) {
        $pdo->prepare('DELETE FROM supplier_products WHERE product_id=?')->execute([$product]);
        $pdo->prepare('DELETE FROM product WHERE product_id=?')->execute([$product]);
    }
    foreach ([$manager,$supervisor] as $session) {
        $pdo->prepare('DELETE FROM auth_sessions WHERE auth_session_id=?')->execute([$session['authSessionId']]);
        if(session_status()===PHP_SESSION_ACTIVE)session_write_close();
        session_id($session['phpSessionId']); session_start(); $_SESSION=[]; session_destroy();
    }
}
