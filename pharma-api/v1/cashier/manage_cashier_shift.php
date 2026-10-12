<?php
require_once '../../config/db_connection.php';
$allowedRoles = ['super_admin', 'admin', 'Cashier', 'cashier', 'ro-super-admin', 'ro-admin', 'ro-cashier'];
require_once '../../config/require_auth.php';
require_once '../../config/audit_log.php';
require_once 'cashier_helpers.php';

header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

function cashierShiftRespond(int $status, string $message, array $shift = []): void
{
    http_response_code($status);
    echo json_encode([
        'status' => $status < 400 ? 'success' : 'error',
        'message' => $message,
    ] + ($shift ? ['data' => ['shift' => $shift]] : []));
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');
    cashierShiftRespond(405, 'POST is required.');
}

try {
    $cashierId = cashierCurrentUserId();
    if ($cashierId === '') cashierShiftRespond(401, 'Sign in again to manage your shift.');
    $roles = cashierSessionRoles();
    if (!in_array('cashier', $roles, true) && !cashierIsAdminSession()) {
        cashierShiftRespond(403, 'Only a cashier or authorized administrator can manage a shift.');
    }

    ensureCashierShiftSchema($pdo);
    ensureAuditLogSchema($pdo);
    $payload = json_decode((string) file_get_contents('php://input'), true);
    if (!is_array($payload)) cashierShiftRespond(400, 'Enter valid shift details.');

    $action = strtolower(trim((string) ($payload['action'] ?? '')));
    if (!in_array($action, ['start', 'close'], true)) cashierShiftRespond(422, 'Choose whether to start or close the shift.');

    if ($action === 'start') {
        $openingRaw = $payload['opening_cash'] ?? null;
        if (!is_string($openingRaw) && !is_int($openingRaw) && !is_float($openingRaw)) {
            cashierShiftRespond(422, 'Enter a valid opening cash amount.');
        }
        $openingRaw = trim((string) $openingRaw);
        if (!preg_match('/^(?:[0-9]+(?:\.[0-9]{1,2})?|\.[0-9]{1,2})$/D', $openingRaw)) {
            cashierShiftRespond(422, 'Opening cash must contain only digits and an optional decimal point with up to two decimal places.');
        }
        $openingCash = (float) $openingRaw;
        if ($openingCash < 0 || $openingCash > 9999999999.99) {
            cashierShiftRespond(422, 'Opening cash must be between ₱0.00 and ₱9,999,999,999.99.');
        }

        $pdo->beginTransaction();
        $active = $pdo->prepare('SELECT shift_id FROM cashier_shifts WHERE active_cashier_id = :cashier_id LIMIT 1 FOR UPDATE');
        $active->execute([':cashier_id' => $cashierId]);
        if ($active->fetchColumn()) throw new RuntimeException('Your shift is already open. Close it before starting another shift.');

        $insert = $pdo->prepare(
            "INSERT INTO cashier_shifts (cashier_id, active_cashier_id, status, opening_cash, opened_at)
             VALUES (:cashier_id, :active_cashier_id, 'open', :opening_cash, NOW())"
        );
        $insert->execute([
            ':cashier_id' => $cashierId,
            ':active_cashier_id' => $cashierId,
            ':opening_cash' => $openingCash,
        ]);
        $shiftId = (int) $pdo->lastInsertId();
        if (!recordAuditLog($pdo, [
            'module' => 'Cashier Shift',
            'action' => 'SHIFT_STARTED',
            'event_status' => 'Success',
            'description' => 'Cashier started shift #' . $shiftId . '.',
            'target_type' => 'Cashier Shift',
            'target_id' => (string) $shiftId,
            'details' => json_encode(['opening_cash' => number_format($openingCash, 2, '.', '')], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            'idempotency_key' => auditRequestId() . ':SHIFT_STARTED:' . $shiftId,
        ])) {
            throw new RuntimeException('The shift could not be added to the audit trail.');
        }
        $pdo->commit();

        cashierShiftRespond(201, 'Shift started.', [
            'shift_id' => $shiftId,
            'status' => 'open',
            'opening_cash' => $openingCash,
            'opened_at' => date('Y-m-d H:i:s'),
            'closed_at' => null,
        ]);
    }

    $actualRaw = $payload['actual_cash'] ?? null;
    if (!is_numeric($actualRaw)) cashierShiftRespond(422, 'Enter the actual cash count to close your shift.');
    $actualCash = cashierMoney($actualRaw);
    if ($actualCash < 0 || $actualCash > 9999999999.99) {
        cashierShiftRespond(422, 'Actual cash must be between ₱0.00 and ₱9,999,999,999.99.');
    }
    $remarks = trim((string) ($payload['variance_remarks'] ?? ''));
    if (mb_strlen($remarks) > 500) cashierShiftRespond(422, 'Variance remarks must be 500 characters or fewer.');

    $requestedShiftId = filter_var($payload['shift_id'] ?? null, FILTER_VALIDATE_INT);
    if (!$requestedShiftId || $requestedShiftId < 1) cashierShiftRespond(422, 'Refresh the dashboard and choose the active shift to close.');

    $pdo->beginTransaction();
    $shiftStmt = $pdo->prepare(
        "SELECT shift_id, opening_cash, opened_at
         FROM cashier_shifts
         WHERE shift_id = :shift_id AND active_cashier_id = :cashier_id AND status = 'open'
         LIMIT 1 FOR UPDATE"
    );
    $shiftStmt->execute([':shift_id' => $requestedShiftId, ':cashier_id' => $cashierId]);
    $shift = $shiftStmt->fetch(PDO::FETCH_ASSOC);
    if (!$shift) throw new RuntimeException('There is no open shift to close.');

    $totals = $pdo->prepare(
        "SELECT
            COALESCE(SUM(CASE WHEN LOWER(p.payment_method) = 'cash' AND p.payment_status IN ('paid', 'refunded') THEN COALESCE(NULLIF(p.final_amount, 0), p.total_amount) ELSE 0 END), 0) AS cash_sales,
            COALESCE(SUM(CASE WHEN LOWER(p.payment_method) = 'cash' AND p.payment_status = 'refunded' THEN COALESCE(NULLIF(p.final_amount, 0), p.total_amount) ELSE 0 END), 0) AS cash_refunds
         FROM cashier_shift_transactions st
         INNER JOIN sales_payments p ON p.order_id = st.order_id
         WHERE st.shift_id = :shift_id
           AND LOWER(p.payment_method) IN ('cash', 'gcash')
           AND p.payment_status IN ('paid', 'refunded')"
    );
    $totals->execute([':shift_id' => (int) $shift['shift_id']]);
    $cashTotals = $totals->fetch(PDO::FETCH_ASSOC) ?: [];
    $netCashSales = cashierMoney((float) ($cashTotals['cash_sales'] ?? 0) - (float) ($cashTotals['cash_refunds'] ?? 0));
    $expectedCash = cashierMoney((float) $shift['opening_cash'] + $netCashSales);
    $variance = cashierMoney($actualCash - $expectedCash);

    $close = $pdo->prepare(
        "UPDATE cashier_shifts
         SET active_cashier_id = NULL,
             status = 'closed',
             expected_cash = :expected_cash,
             actual_cash = :actual_cash,
             cash_variance = :cash_variance,
             variance_remarks = :variance_remarks,
             closed_at = NOW()
         WHERE shift_id = :shift_id AND active_cashier_id = :cashier_id"
    );
    $close->execute([
        ':expected_cash' => $expectedCash,
        ':actual_cash' => $actualCash,
        ':cash_variance' => $variance,
        ':variance_remarks' => $remarks !== '' ? $remarks : null,
        ':shift_id' => (int) $shift['shift_id'],
        ':cashier_id' => $cashierId,
    ]);
    if ($close->rowCount() !== 1) throw new RuntimeException('The shift could not be closed. Refresh and try again.');
    if (!recordAuditLog($pdo, [
        'module' => 'Cashier Shift',
        'action' => 'SHIFT_CLOSED',
        'event_status' => 'Success',
        'description' => 'Cashier closed shift #' . (int) $shift['shift_id'] . '.',
        'target_type' => 'Cashier Shift',
        'target_id' => (string) $shift['shift_id'],
        'details' => json_encode([
            'opening_cash' => number_format((float) $shift['opening_cash'], 2, '.', ''),
            'expected_cash' => number_format($expectedCash, 2, '.', ''),
            'actual_cash' => number_format($actualCash, 2, '.', ''),
            'cash_variance' => number_format($variance, 2, '.', ''),
            'variance_remarks' => $remarks,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        'idempotency_key' => auditRequestId() . ':SHIFT_CLOSED:' . $shift['shift_id'],
    ])) {
        throw new RuntimeException('The shift could not be added to the audit trail.');
    }

    $pdo->commit();
    cashierShiftRespond(200, 'Shift closed.', [
        'shift_id' => (int) $shift['shift_id'],
        'status' => 'closed',
        'opening_cash' => cashierMoney($shift['opening_cash']),
        'expected_cash' => $expectedCash,
        'actual_cash' => $actualCash,
        'cash_variance' => $variance,
        'variance_remarks' => $remarks,
        'opened_at' => $shift['opened_at'],
        'closed_at' => date('Y-m-d H:i:s'),
    ]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    if ($e instanceof PDOException) error_log('Cashier shift update failed: ' . $e->getMessage());
    $message = $e instanceof PDOException && (string) $e->getCode() === '23000'
        ? 'Your shift is already open. Close it before starting another shift.'
        : ($e instanceof PDOException ? 'Unable to update your cashier shift. Please try again.' : $e->getMessage());
    cashierShiftRespond(400, $message !== '' ? $message : 'Unable to update your cashier shift.');
}
