<?php
declare(strict_types=1);

require_once __DIR__ . '/../pharma-api/config/db_connection.php';
require_once __DIR__ . '/../pharma-api/v1/purchase_orders/purchase_order_helpers.php';

function creditHttpAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

function creditHttpRequest(string $method, string $path, array $payload, string $sessionId, string $tabToken): array
{
    $curl = curl_init('http://127.0.0.1/PharmacySystem_for_DocR/pharma-api/v1/' . $path);
    $options = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_COOKIE => 'PHPSESSID=' . $sessionId,
        CURLOPT_HTTPHEADER => ['Accept: application/json', 'Content-Type: application/json', 'X-Tab-Token: ' . $tabToken],
        CURLOPT_TIMEOUT => 20,
    ];
    if ($method === 'POST') {
        $options[CURLOPT_POST] = true;
        $options[CURLOPT_POSTFIELDS] = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
    curl_setopt_array($curl, $options);
    $body = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $error = curl_error($curl);
    curl_close($curl);
    creditHttpAssert($body !== false, 'HTTP request failed: ' . $error);
    return ['status' => $status, 'body' => json_decode((string) $body, true) ?: []];
}

$claimId = newUuid($pdo);
$creditId = newUuid($pdo);
$targetOneId = newUuid($pdo);
$targetTwoId = newUuid($pdo);
$otherSupplierTargetId = newUuid($pdo);
$targetInvoiceIds = [newUuid($pdo), newUuid($pdo), newUuid($pdo)];
$authSessionId = newUuid($pdo);
$phpSessionId = 'codexcredit' . bin2hex(random_bytes(8));
$tabToken = bin2hex(random_bytes(32));

try {
    $source = $pdo->query("SELECT po.po_id,po.supplier_id,poi.po_item_id FROM purchase_orders po INNER JOIN purchase_order_items poi ON poi.po_id=po.po_id ORDER BY po.created_at LIMIT 1")->fetch(PDO::FETCH_ASSOC);
    creditHttpAssert((bool) $source, 'A source PO item fixture is required.');
    $otherSupplierId = $pdo->prepare('SELECT supplier_id FROM suppliers WHERE supplier_id<>:supplier_id ORDER BY supplier_id LIMIT 1');
    $otherSupplierId->execute([':supplier_id' => $source['supplier_id']]);
    $otherSupplierId = (string) $otherSupplierId->fetchColumn();
    creditHttpAssert($otherSupplierId !== '', 'A second supplier fixture is required.');
    $user = $pdo->query("SELECT user_id,username,full_name,role,status FROM users WHERE role='admin' AND status='Active' LIMIT 1")->fetch(PDO::FETCH_ASSOC);
    creditHttpAssert((bool) $user, 'An active admin fixture is required.');

    $targetInsert = $pdo->prepare("INSERT INTO purchase_orders(po_id,po_number,supplier_id,status,total_amount,final_payment,payment_status,approval_status,created_at) VALUES(:id,:number,:supplier_id,'Delivered',1500,1500,'Unpaid','Approved',CURRENT_TIMESTAMP)");
    $targetInsert->execute([':id' => $targetOneId, ':number' => 'TEST-CREDIT-T1-' . substr(str_replace('-', '', $targetOneId), 0, 8), ':supplier_id' => $source['supplier_id']]);
    $targetInsert->execute([':id' => $targetTwoId, ':number' => 'TEST-CREDIT-T2-' . substr(str_replace('-', '', $targetTwoId), 0, 8), ':supplier_id' => $source['supplier_id']]);
    $targetInsert->execute([':id' => $otherSupplierTargetId, ':number' => 'TEST-CREDIT-X-' . substr(str_replace('-', '', $otherSupplierTargetId), 0, 8), ':supplier_id' => $otherSupplierId]);
    $invoiceInsert = $pdo->prepare("INSERT INTO purchase_order_invoices(invoice_id,po_id,invoice_number,invoice_date,discount,other_charges,supplier_invoice_total,recorded_by) VALUES(:invoice_id,:po_id,:invoice_number,CURRENT_DATE,0,0,1500,:recorded_by)");
    foreach ([[$targetInvoiceIds[0],$targetOneId,'TEST-CREDIT-INV-1'],[$targetInvoiceIds[1],$targetTwoId,'TEST-CREDIT-INV-2'],[$targetInvoiceIds[2],$otherSupplierTargetId,'TEST-CREDIT-INV-X']] as [$invoiceId,$targetId,$invoiceNumber]) {
        $invoiceInsert->execute([':invoice_id'=>$invoiceId,':po_id'=>$targetId,':invoice_number'=>$invoiceNumber,':recorded_by'=>$user['user_id']]);
    }
    $conversionId = supplierClaimDefaultConversion($pdo, (string) $source['po_item_id']);
    $metadata = ['version' => 1, 'resolution' => 'next_po_credit', 'supplier_adjustment' => 100, 'replacement_expected_qty' => 0, 'replacement_received_qty' => 0];
    $pdo->prepare("INSERT INTO supplier_claims(claim_id,po_item_id,affected_quantity,unit_conversion_id,damage_reason,disposition,resolution_type,claim_status,reported_by,remarks,resolved_at) VALUES(:id,:po_item_id,1,:conversion_id,'Credit application regression','Hold/Quarantine','Next PO Credit','Resolved / Credit Issued',:reported_by,:remarks,CURRENT_TIMESTAMP)")->execute([':id' => $claimId, ':po_item_id' => $source['po_item_id'], ':conversion_id' => $conversionId, ':reported_by' => $user['user_id'], ':remarks' => buildPurchaseOrderReturnRemarks($metadata, 'HTTP credit application test')]);
    $pdo->prepare("INSERT INTO supplier_credits(credit_id,claim_id,credit_amount,credit_status) VALUES(:id,:claim_id,100,'Available')")->execute([':id' => $creditId, ':claim_id' => $claimId]);

    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    session_id($phpSessionId);
    session_start();
    $_SESSION = ['user_id' => $user['user_id'], 'username' => $user['username'], 'full_name' => $user['full_name'], 'role' => $user['role'], 'roles' => [$user['role']], 'role_identifiers' => ['ro-admin'], 'user_status' => $user['status'], 'auth_session_id' => $authSessionId, 'tab_token_hash' => hash('sha256', $tabToken)];
    session_write_close();
    $pdo->prepare("INSERT INTO auth_sessions(auth_session_id,php_session_id,user_id,session_token_hash,expires_at,ip_address,user_agent) VALUES(:id,:php,:user,:token,DATE_ADD(NOW(),INTERVAL 10 MINUTE),'127.0.0.1','Codex supplier credit test')")->execute([':id' => $authSessionId, ':php' => $phpSessionId, ':user' => $user['user_id'], ':token' => hash('sha256', $tabToken)]);

    $available = creditHttpRequest('GET', 'purchase_orders/get_supplier_credits.php?po_id=' . rawurlencode($targetOneId), [], $phpSessionId, $tabToken);
    creditHttpAssert($available['status'] === 200 && count(array_filter($available['body']['credits'] ?? [], static fn(array $row): bool => ($row['credit_id'] ?? '') === $creditId)) === 1, 'Same-supplier available credit was not shown on the later PO.');
    $partial = creditHttpRequest('POST', 'purchase_orders/apply_supplier_credit.php', ['po_id' => $targetOneId, 'credit_id' => $creditId, 'amount_applied' => 60], $phpSessionId, $tabToken);
    creditHttpAssert($partial['status'] === 200 && (float) ($partial['body']['credit_remaining'] ?? -1) === 40.0, 'Partial ₱60 credit application did not retain ₱40.');
    creditHttpAssert((string) $pdo->query("SELECT credit_status FROM supplier_credits WHERE credit_id='{$creditId}'")->fetchColumn() === 'Partially Applied', 'Partially used credit status was not retained.');
    $partialClaim = $pdo->query("SELECT claim_status,resolved_at FROM supplier_claims WHERE claim_id='{$claimId}'")->fetch(PDO::FETCH_ASSOC);
    creditHttpAssert(($partialClaim['claim_status'] ?? '') === 'Supplier Credit Partially Applied' && $partialClaim['resolved_at'] === null, 'A partially applied supplier credit was incorrectly marked resolved.');

    $crossSupplier = creditHttpRequest('POST', 'purchase_orders/apply_supplier_credit.php', ['po_id' => $otherSupplierTargetId, 'credit_id' => $creditId, 'amount_applied' => 10], $phpSessionId, $tabToken);
    creditHttpAssert($crossSupplier['status'] === 400, 'A different supplier was allowed to consume the credit.');
    creditHttpAssert((float) $pdo->query("SELECT credit_amount-COALESCE((SELECT SUM(amount_applied) FROM supplier_credit_applications WHERE credit_id='{$creditId}'),0) FROM supplier_credits WHERE credit_id='{$creditId}'")->fetchColumn() === 40.0, 'Rejected cross-supplier application changed the remaining credit.');

    $final = creditHttpRequest('POST', 'purchase_orders/apply_supplier_credit.php', ['po_id' => $targetTwoId, 'credit_id' => $creditId, 'amount_applied' => 40], $phpSessionId, $tabToken);
    creditHttpAssert($final['status'] === 200 && (float) ($final['body']['credit_remaining'] ?? -1) === 0.0, 'Remaining credit was not applied to the second later same-supplier PO.');
    creditHttpAssert((int) $pdo->query("SELECT COUNT(*) FROM supplier_credit_applications WHERE credit_id='{$creditId}' AND po_id IN ('{$targetOneId}','{$targetTwoId}') AND applied_by='{$user['user_id']}'")->fetchColumn() === 2, 'Credit applications did not retain both target-PO and user audit links.');
    creditHttpAssert((float) $pdo->query("SELECT SUM(amount_applied) FROM supplier_credit_applications WHERE credit_id='{$creditId}'")->fetchColumn() === 100.0, 'Credit applications do not reconcile to the original credit amount.');
    creditHttpAssert((string) $pdo->query("SELECT credit_status FROM supplier_credits WHERE credit_id='{$creditId}'")->fetchColumn() === 'Applied', 'Fully consumed credit was not marked Applied.');
    $appliedClaim = $pdo->query("SELECT claim_status,resolved_at FROM supplier_claims WHERE claim_id='{$claimId}'")->fetch(PDO::FETCH_ASSOC);
    creditHttpAssert(($appliedClaim['claim_status'] ?? '') === 'Credit Applied' && !empty($appliedClaim['resolved_at']), 'A fully applied supplier credit did not complete its source claim.');

    echo "supplier credit application HTTP test passed\n";
} finally {
    $pdo->prepare('DELETE FROM supplier_credit_applications WHERE credit_id=:credit_id')->execute([':credit_id' => $creditId]);
    $pdo->prepare('DELETE FROM supplier_credits WHERE credit_id=:credit_id')->execute([':credit_id' => $creditId]);
    $pdo->prepare('DELETE FROM supplier_claims WHERE claim_id=:claim_id')->execute([':claim_id' => $claimId]);
    $pdo->prepare('DELETE FROM auth_sessions WHERE auth_session_id=:id')->execute([':id' => $authSessionId]);
    foreach ([$targetOneId, $targetTwoId, $otherSupplierTargetId] as $targetId) {
        $pdo->prepare('DELETE FROM purchase_order_invoices WHERE po_id=:po_id')->execute([':po_id' => $targetId]);
        $pdo->prepare('DELETE FROM purchase_orders WHERE po_id=:po_id')->execute([':po_id' => $targetId]);
    }
}
