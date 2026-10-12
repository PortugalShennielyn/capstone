<?php
require_once '../../config/db_connection.php';
$allowedRoles = ['cashier', 'Cashier', 'ro-cashier', 'ro_cashier'];
require_once '../../config/require_auth.php';
require_once '../../config/audit_log.php';
require_once 'cashier_helpers.php';

header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

function shiftReconciliationRespond(int $status, string $message, array $data = []): void
{
    http_response_code($status);
    echo json_encode(['status' => $status < 400 ? 'success' : 'error', 'message' => $message] + ($data ? ['data' => $data] : []));
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');
    shiftReconciliationRespond(405, 'POST is required.');
}

try {
    $cashierId = cashierCurrentUserId();
    if ($cashierId === '') shiftReconciliationRespond(401, 'Sign in again to save your cash count.');

    $payload = json_decode((string) file_get_contents('php://input'), true);
    if (!is_array($payload)) shiftReconciliationRespond(400, 'Enter valid cash reconciliation details.');

    $shiftDate = trim((string) ($payload['shift_date'] ?? ''));
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $shiftDate);
    $dateErrors = DateTimeImmutable::getLastErrors();
    if (!$date || $date->format('Y-m-d') !== $shiftDate || (is_array($dateErrors) && ($dateErrors['warning_count'] || $dateErrors['error_count']))) {
        shiftReconciliationRespond(422, 'Choose a valid shift date.');
    }
    if ($date > new DateTimeImmutable('today')) shiftReconciliationRespond(422, 'Future shift dates cannot be reconciled.');

    ensureCashierShiftSchema($pdo);
    $trackedShift = $pdo->prepare(
        'SELECT COUNT(*)
         FROM cashier_shifts
         WHERE cashier_id = :cashier_id
           AND opened_at >= :day_start
           AND opened_at < :day_end'
    );
    $trackedShift->execute([
        ':cashier_id' => $cashierId,
        ':day_start' => $shiftDate . ' 00:00:00',
        ':day_end' => $date->modify('+1 day')->format('Y-m-d') . ' 00:00:00',
    ]);
    if ((int) $trackedShift->fetchColumn() > 0) {
        shiftReconciliationRespond(409, 'Cash counts for tracked shifts are saved when the shift is closed.');
    }

    $beginningRaw = $payload['beginning_cash'] ?? null;
    $actualRaw = $payload['actual_cash'] ?? null;
    if (!is_numeric($beginningRaw) || !is_numeric($actualRaw)) {
        shiftReconciliationRespond(422, 'Enter both the opening cash float and actual cash count.');
    }
    $beginningCash = round((float) $beginningRaw, 2);
    $actualCash = round((float) $actualRaw, 2);
    if ($beginningCash < 0 || $actualCash < 0 || $beginningCash > 9999999999.99 || $actualCash > 9999999999.99) {
        shiftReconciliationRespond(422, 'Cash amounts must be between ₱0.00 and ₱9,999,999,999.99.');
    }

    $remarks = trim((string) ($payload['variance_remarks'] ?? ''));
    if (mb_strlen($remarks) > 500) shiftReconciliationRespond(422, 'Variance remarks must be 500 characters or fewer.');

    ensureAuditLogSchema($pdo);
    $pdo->beginTransaction();
    $save = $pdo->prepare(
        "INSERT INTO cashier_shift_reconciliations
            (cashier_id, shift_date, beginning_cash, actual_cash, variance_remarks, status)
         VALUES (:cashier_id, :shift_date, :beginning_cash, :actual_cash, :remarks, 'count_saved')
         ON DUPLICATE KEY UPDATE
            beginning_cash = VALUES(beginning_cash),
            actual_cash = VALUES(actual_cash),
            variance_remarks = VALUES(variance_remarks),
            status = 'count_saved',
            updated_at = CURRENT_TIMESTAMP"
    );
    $save->execute([
        ':cashier_id' => $cashierId,
        ':shift_date' => $shiftDate,
        ':beginning_cash' => $beginningCash,
        ':actual_cash' => $actualCash,
        ':remarks' => $remarks !== '' ? $remarks : null,
    ]);

    $saved = $pdo->prepare(
        'SELECT beginning_cash, actual_cash, variance_remarks, status, updated_at
         FROM cashier_shift_reconciliations
         WHERE cashier_id = :cashier_id AND shift_date = :shift_date
         LIMIT 1 FOR UPDATE'
    );
    $saved->execute([':cashier_id' => $cashierId, ':shift_date' => $shiftDate]);
    $reconciliation = $saved->fetch(PDO::FETCH_ASSOC);
    if (!$reconciliation) throw new RuntimeException('The saved cash count could not be confirmed.');

    $auditDetails = json_encode([
        'shift_date' => $shiftDate,
        'beginning_cash' => number_format($beginningCash, 2, '.', ''),
        'actual_cash' => number_format($actualCash, 2, '.', ''),
        'variance_remarks' => $remarks,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if (!recordAuditLog($pdo, [
        'module' => 'Cashier Shift',
        'action' => 'CASH_COUNT_SAVED',
        'event_status' => 'Success',
        'description' => 'Cashier saved the opening float and actual cash count for ' . $shiftDate . '.',
        'target_type' => 'Cashier Shift Reconciliation',
        'target_id' => $cashierId . ':' . $shiftDate,
        'details' => $auditDetails,
        'idempotency_key' => auditRequestId() . ':CASH_COUNT_SAVED:' . $cashierId . ':' . $shiftDate,
    ])) {
        throw new RuntimeException('The cash count could not be added to the audit trail.');
    }

    $pdo->commit();
    shiftReconciliationRespond(200, 'Cash count saved.', ['reconciliation' => $reconciliation]);
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('Cashier shift reconciliation save failed: ' . $error->getMessage());
    shiftReconciliationRespond(500, 'The cash count could not be saved. Please try again.');
}
?>
