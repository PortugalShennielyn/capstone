<?php
$allowedRoles = ['super_admin', 'admin', 'manager', 'Admin', 'ro-super-admin', 'ro-admin', 'ro-manager'];
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once __DIR__ . '/purchase_order_helpers.php';
require_once __DIR__ . '/purchase_order_payment_helpers.php';

function paymentError(string $message, int $code, array $details = []): void
{
    if (isset($GLOBALS['pdo']) && $GLOBALS['pdo'] instanceof PDO && $GLOBALS['pdo']->inTransaction()) $GLOBALS['pdo']->rollBack();
    http_response_code($code);
    echo json_encode(['status' => 'error', 'message' => $message] + $details, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') paymentError('Only POST requests are allowed.', 405);
$payload = json_decode(file_get_contents('php://input'), true);
if (!is_array($payload)) paymentError('Invalid JSON payload.', 400);
$poId = cleanId($payload['po_id'] ?? null);
$amount = round((float) ($payload['amount'] ?? 0), 2);
$method = strtolower(trim((string) ($payload['payment_method'] ?? '')));
$paymentDate = trim((string) ($payload['payment_date'] ?? ''));
$reference = trim((string) ($payload['reference_number'] ?? ''));
$remarks = trim((string) ($payload['remarks'] ?? ''));
$paymentRequestKey = trim((string) ($payload['payment_request_key'] ?? ''));
$expectedRemaining = isset($payload['expected_remaining_balance']) && is_numeric($payload['expected_remaining_balance'])
    ? round((float) $payload['expected_remaining_balance'], 2)
    : null;
if ($poId === '') paymentError('Purchase order is required.', 400);
if (!isset($payload['amount']) || !is_numeric($payload['amount']) || $amount <= 0) paymentError('Payment amount must be greater than zero.', 400);
if ($method === '') $method = 'cash';
if ($paymentDate === '') paymentError('Payment date is required.', 400);
if ($paymentRequestKey === '') paymentError('Payment submission key is required.', 400);
if ($method !== 'cash') paymentError('Purchase order payments must be recorded as Cash.', 400);
$date = DateTime::createFromFormat('Y-m-d', $paymentDate);
if (!$date || $date->format('Y-m-d') !== $paymentDate) paymentError('Payment date must be a valid date.', 400);
if (strlen($paymentRequestKey) > 100 || strlen($reference) > 100) paymentError('Reference number or submission key is too long.', 400);

try {
    $pdo->beginTransaction();
    $duplicate = $pdo->prepare('SELECT payment_id FROM purchase_order_payments WHERE payment_request_key = :key LIMIT 1');
    $duplicate->execute([':key' => $paymentRequestKey]);
    if ($duplicate->fetchColumn()) paymentError('This payment submission was already recorded.', 409);
    $orderStatement = $pdo->prepare(
        "SELECT po.po_id, po.po_number, po.status, invoice.invoice_id,
                invoice.supplier_invoice_total
         FROM purchase_orders po
         LEFT JOIN purchase_order_invoices invoice ON invoice.po_id = po.po_id
         WHERE po.po_id = :po_id
         LIMIT 1 FOR UPDATE"
    );
    $orderStatement->execute([':po_id' => $poId]);
    $order = $orderStatement->fetch(PDO::FETCH_ASSOC);
    if (!$order) paymentError('Purchase order not found.', 404);
    if (!in_array($order['status'], ['Pending','Arrived','Delivered'], true)) paymentError('Supplier payments can only be recorded for Pending, Arrived, or Delivered purchase orders.', 422);
    if (empty($order['invoice_id']) || (float) $order['supplier_invoice_total'] <= 0) {
        paymentError('Record the supplier invoice before recording a payment.', 422);
    }
    $effectivePayable = (float) $order['supplier_invoice_total'];
    $before = purchaseOrderPaymentSummary($pdo, $poId, $effectivePayable);
    if ($before['remaining_balance'] <= 0) paymentError('This purchase order is already fully paid.', 409);
    if ($expectedRemaining !== null && abs($expectedRemaining - $before['remaining_balance']) >= 0.01) {
        paymentError(
            'The outstanding balance changed. The latest remaining balance is ₱' . number_format($before['remaining_balance'], 2) . '.',
            409,
            [
                'stale_balance' => true,
                'latest_remaining_balance' => $before['remaining_balance'],
                'payment_status' => $before['payment_status']
            ]
        );
    }
    if ($amount > $before['remaining_balance']) paymentError('Payment amount exceeds the remaining balance by ₱' . number_format($amount - $before['remaining_balance'], 2) . '.', 422);
    $statement = $pdo->prepare(
        'INSERT INTO purchase_order_payments
            (payment_id, po_id, amount, payment_method, payment_date, reference_number, remarks, recorded_by, payment_request_key)
         VALUES
            (:payment_id, :po_id, :amount, :payment_method, :payment_date, :reference_number, :remarks, :recorded_by, :payment_request_key)'
    );
    $paymentId = newUuid($pdo);
    $statement->execute([
        ':payment_id' => $paymentId, ':po_id' => $poId, ':amount' => $amount, ':payment_method' => $method,
        ':payment_date' => $paymentDate, ':reference_number' => $reference !== '' ? $reference : null,
        ':remarks' => $remarks !== '' ? $remarks : null, ':recorded_by' => $_SESSION['user_id'] ?? null,
        ':payment_request_key' => $paymentRequestKey
    ]);
    $summary = synchronizePurchaseOrderPaymentStatus($pdo, $poId, $effectivePayable);
    $pdo->commit();
    recordActivityLog($pdo, 'Purchase Order', 'Supplier Payment', 'Supplier payment of ' . number_format($amount, 2) . ' recorded for PO ' . $order['po_number'], $poId);
    echo json_encode([
        'status' => 'success', 'message' => 'Supplier payment recorded.', 'payment_id' => $paymentId,
        'payment_recorded' => $amount, 'total_paid' => $summary['total_paid'],
        'remaining_balance' => $summary['remaining_balance'], 'payment_status' => $summary['payment_status'],
        'payment_timing' => $order['status'] === 'Pending' ? 'Prepaid' : 'Standard'
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (PDOException $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    if ((string) $error->getCode() === '23000') paymentError('This payment submission was already recorded.', 409);
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to record supplier payment.', 'error' => $error->getMessage()]);
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to record supplier payment.', 'error' => $error->getMessage()]);
}
