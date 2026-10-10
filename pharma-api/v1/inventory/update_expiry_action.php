<?php
require_once '../../config/db_connection.php';
$allowedRoles = ['super_admin', 'admin', 'manager', 'supervisor', 'inventory_manager', 'Admin', 'Supervisor', 'Inventory Manager', 'ro-super-admin', 'ro-admin', 'ro-manager', 'ro-supervisor', 'ro-inventory-manager', 'ro_inventory_manager'];
require_once '../../config/require_auth.php';
require_once '../activity_log_helpers.php';

header('Content-Type: application/json; charset=UTF-8');

function expiryActionRespond(bool $success, string $message, int $httpCode = 200, array $data = []): void
{
    http_response_code($httpCode);
    echo json_encode(['status' => $success ? 'success' : 'error', 'message' => $message] + $data);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    expiryActionRespond(false, 'Only POST requests are allowed.', 405);
}

$payload = json_decode(file_get_contents('php://input'), true);
if (!is_array($payload)) {
    expiryActionRespond(false, 'Invalid JSON payload.', 400);
}

try {
    $batchId = cleanId($payload['batch_id'] ?? null);
    $action = trim((string) ($payload['review_action'] ?? ''));
    $quantity = filter_var($payload['return_quantity'] ?? null, FILTER_VALIDATE_INT);
    $reason = trim((string) ($payload['return_reason'] ?? ''));
    if (strlen($reason) > 255) {
        throw new InvalidArgumentException('Return reason is too long.');
    }
    if ($batchId === '') {
        throw new InvalidArgumentException('Inventory batch is required.');
    }
    if (!in_array($action, ['Return for Replacement', 'Not Eligible for Return', 'For Disposal'], true)) {
        throw new InvalidArgumentException('Select a valid Review Action.');
    }
    if ($action === 'Return for Replacement' && ($quantity === false || $quantity <= 0)) {
        throw new InvalidArgumentException('Return quantity must be a positive whole number.');
    }
    if ($action === 'Return for Replacement' && $reason !== 'Near Expiry') {
        throw new InvalidArgumentException('The return reason must be Near Expiry.');
    }

    ensureActivityLogSchema($pdo);
    $pdo->beginTransaction();
    $batchStmt = $pdo->prepare(
        'SELECT batch_id, product_id, legacy_inventory_id, storage_qty, expiry_action_status
         FROM inventory_batches WHERE batch_id = :batch_id LIMIT 1 FOR UPDATE'
    );
    $batchStmt->execute([':batch_id' => $batchId]);
    $batch = $batchStmt->fetch(PDO::FETCH_ASSOC);
    if (!$batch) {
        throw new InvalidArgumentException('Inventory batch not found.');
    }

    $pdo->prepare('UPDATE inventory_batches SET expiry_quarantined_storage_qty = 0 WHERE batch_id = :batch_id')
        ->execute([':batch_id' => $batchId]);
    $pdo->prepare('UPDATE product_selling_stock SET expiry_quarantined_qty = 0 WHERE source_batch_id = :batch_id')
        ->execute([':batch_id' => $batchId]);

    if ($action === 'Return for Replacement') {
        $shelfStmt = $pdo->prepare(
            'SELECT selling_stock_id, quantity_remaining
             FROM product_selling_stock
             WHERE source_batch_id = :batch_id AND quantity_remaining > 0
             ORDER BY expiration_date IS NULL, expiration_date, created_at, selling_stock_id
             FOR UPDATE'
        );
        $shelfStmt->execute([':batch_id' => $batchId]);
        $shelfRows = $shelfStmt->fetchAll(PDO::FETCH_ASSOC);
        $totalAvailable = (int) $batch['storage_qty'];
        foreach ($shelfRows as $shelfRow) {
            $totalAvailable += (int) $shelfRow['quantity_remaining'];
        }
        if ($quantity > $totalAvailable) {
            throw new InvalidArgumentException('Return quantity exceeds the remaining batch quantity.');
        }

        $remaining = $quantity;
        $storageQuarantine = min($remaining, (int) $batch['storage_qty']);
        if ($storageQuarantine > 0) {
            $pdo->prepare('UPDATE inventory_batches SET expiry_quarantined_storage_qty = :quantity WHERE batch_id = :batch_id')
                ->execute([':quantity' => $storageQuarantine, ':batch_id' => $batchId]);
            $remaining -= $storageQuarantine;
        }
        foreach ($shelfRows as $shelfRow) {
            if ($remaining <= 0) {
                break;
            }
            $reserved = min($remaining, (int) $shelfRow['quantity_remaining']);
            $pdo->prepare('UPDATE product_selling_stock SET expiry_quarantined_qty = :quantity WHERE selling_stock_id = :selling_stock_id')
                ->execute([':quantity' => $reserved, ':selling_stock_id' => $shelfRow['selling_stock_id']]);
            $remaining -= $reserved;
        }
    }

    $pdo->prepare('UPDATE inventory_batches SET expiry_action_status = :action WHERE batch_id = :batch_id')
        ->execute([':action' => $action, ':batch_id' => $batchId]);

    $description = $action === 'Return for Replacement'
        ? sprintf('Return for Replacement: %d units quarantined for Near Expiry. Replacement must be received as a new batch.', $quantity)
        : ($action === 'For Disposal'
            ? 'Batch marked For Disposal; inventory is blocked pending a disposal confirmation.'
            : 'Supplier return marked Not Eligible for Return; valid stock remains available for FEFO sale until expiry.');
    if (!recordActivityLog($pdo, 'Expiry Monitoring', $action, $description, $batchId)) {
        throw new RuntimeException('Unable to write expiry action to the audit history.');
    }

    $pdo->commit();
    expiryActionRespond(true, 'Review Action saved.', 200, [
        'batch_id' => $batchId,
        'review_action' => $action,
        'return_quantity' => $action === 'Return for Replacement' ? $quantity : 0,
        'return_reason' => $action === 'Return for Replacement' ? $reason : null
    ]);
} catch (InvalidArgumentException $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    expiryActionRespond(false, $error->getMessage(), 400);
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('Expiry review action failed: ' . $error->getMessage());
    expiryActionRespond(false, 'Unable to save the expiry review action.', 500);
}
