<?php
require_once '../../config/db_connection.php';
$allowedRoles = ['super_admin', 'admin', 'manager', 'supervisor', 'inventory_manager', 'Admin', 'Supervisor', 'Inventory Manager', 'ro-super-admin', 'ro-admin', 'ro-manager', 'ro-supervisor', 'ro-inventory-manager', 'ro_inventory_manager'];
require_once '../../config/require_auth.php';
require_once '../activity_log_helpers.php';

header('Content-Type: application/json; charset=UTF-8');

function expiryDisposalRespond(bool $success, string $message, int $httpCode = 200): void
{
    http_response_code($httpCode);
    echo json_encode(['status' => $success ? 'success' : 'error', 'message' => $message]);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    expiryDisposalRespond(false, 'Only POST requests are allowed.', 405);
}

$payload = json_decode(file_get_contents('php://input'), true);
if (!is_array($payload)) {
    expiryDisposalRespond(false, 'Invalid JSON payload.', 400);
}

try {
    $batchId = cleanId($payload['batch_id'] ?? null);
    $quantity = filter_var($payload['quantity'] ?? null, FILTER_VALIDATE_INT);
    $reason = trim((string) ($payload['reason'] ?? ''));
    $remarks = trim((string) ($payload['remarks'] ?? ''));
    $disposalDate = trim((string) ($payload['disposal_date'] ?? ''));
    if ($batchId === '') throw new InvalidArgumentException('Inventory batch is required.');
    if ($quantity === false || $quantity <= 0) throw new InvalidArgumentException('Disposal quantity must be a positive whole number.');
    if ($reason === '') throw new InvalidArgumentException('Disposal reason is required.');
    if (strlen($reason) > 255) throw new InvalidArgumentException('Disposal reason cannot exceed 255 characters.');
    if (strlen($remarks) > 1000) throw new InvalidArgumentException('Disposal remarks cannot exceed 1000 characters.');
    $parsedDisposalDate = DateTime::createFromFormat('!Y-m-d', $disposalDate);
    $dateErrors = DateTime::getLastErrors();
    if (!$parsedDisposalDate
        || ($dateErrors !== false && ($dateErrors['warning_count'] > 0 || $dateErrors['error_count'] > 0))
        || $parsedDisposalDate->format('Y-m-d') !== $disposalDate
        || $disposalDate > date('Y-m-d')) {
        throw new InvalidArgumentException('Disposal date must be a valid date no later than today.');
    }

    ensureActivityLogSchema($pdo);
    $pdo->beginTransaction();
    $batchStmt = $pdo->prepare(
        'SELECT batch_id, product_id, legacy_inventory_id, storage_qty, expiry_action_status
         FROM inventory_batches WHERE batch_id = :batch_id LIMIT 1 FOR UPDATE'
    );
    $batchStmt->execute([':batch_id' => $batchId]);
    $batch = $batchStmt->fetch(PDO::FETCH_ASSOC);
    if (!$batch) throw new InvalidArgumentException('Inventory batch not found.');
    if ((string) $batch['expiry_action_status'] !== 'For Disposal') {
        throw new InvalidArgumentException('Mark the batch For Disposal before confirming disposal.');
    }

    $shelfStmt = $pdo->prepare(
        'SELECT selling_stock_id, quantity_remaining FROM product_selling_stock
         WHERE source_batch_id = :batch_id AND quantity_remaining > 0
         ORDER BY expiration_date IS NULL, expiration_date, created_at, selling_stock_id
         FOR UPDATE'
    );
    $shelfStmt->execute([':batch_id' => $batchId]);
    $shelfRows = $shelfStmt->fetchAll(PDO::FETCH_ASSOC);
    $available = (int) $batch['storage_qty'];
    foreach ($shelfRows as $shelfRow) $available += (int) $shelfRow['quantity_remaining'];
    if ($quantity > $available) throw new InvalidArgumentException('Disposal quantity exceeds the remaining batch quantity.');

    $remaining = $quantity;
    $storageDisposed = min($remaining, (int) $batch['storage_qty']);
    if ($storageDisposed > 0) {
        $updateStorage = $pdo->prepare(
            'UPDATE inventory_batches
             SET storage_qty = storage_qty - :quantity,
                 expiry_quarantined_storage_qty = LEAST(expiry_quarantined_storage_qty, storage_qty)
             WHERE batch_id = :batch_id AND storage_qty >= :quantity_guard'
        );
        $updateStorage->execute([
            ':quantity' => $storageDisposed,
            ':batch_id' => $batchId,
            ':quantity_guard' => $storageDisposed
        ]);
        if ($updateStorage->rowCount() !== 1) throw new RuntimeException('Storage changed during disposal.');
        $remaining -= $storageDisposed;
    }

    $shelfDisposed = 0;
    foreach ($shelfRows as $shelfRow) {
        if ($remaining <= 0) break;
        $disposed = min($remaining, (int) $shelfRow['quantity_remaining']);
        $updateShelf = $pdo->prepare(
            'UPDATE product_selling_stock
             SET quantity_remaining = quantity_remaining - :quantity,
                 expiry_quarantined_qty = LEAST(expiry_quarantined_qty, quantity_remaining)
             WHERE selling_stock_id = :selling_stock_id AND quantity_remaining >= :quantity_guard'
        );
        $updateShelf->execute([
            ':quantity' => $disposed,
            ':selling_stock_id' => $shelfRow['selling_stock_id'],
            ':quantity_guard' => $disposed
        ]);
        if ($updateShelf->rowCount() !== 1) throw new RuntimeException('Shelf stock changed during disposal.');
        $shelfDisposed += $disposed;
        $remaining -= $disposed;
    }
    if ($remaining !== 0) throw new RuntimeException('Unable to allocate the complete disposal quantity.');

    $pdo->prepare('UPDATE inventory_batches SET expiry_action_status = :status WHERE batch_id = :batch_id')
        ->execute([
            ':status' => $quantity === $available ? 'Disposed' : 'For Disposal',
            ':batch_id' => $batchId
        ]);
    $legacyInventoryId = cleanId($batch['legacy_inventory_id'] ?? null);
    if ($legacyInventoryId !== '' && $storageDisposed > 0) {
        $pdo->prepare('UPDATE product_inventory SET quantity_remaining = GREATEST(0, quantity_remaining - :quantity) WHERE inventory_id = :inventory_id')
            ->execute([':quantity' => $storageDisposed, ':inventory_id' => $legacyInventoryId]);
    }
    $description = sprintf(
        'Disposal confirmed: %d units (Storage %d, Shelf %d); reason: %s; date: %s; remarks: %s; user: %s.',
        $quantity,
        $storageDisposed,
        $shelfDisposed,
        $reason,
        $disposalDate,
        $remarks !== '' ? $remarks : 'None',
        trim((string) ($_SESSION['full_name'] ?? $_SESSION['username'] ?? 'Authorized user'))
    );
    if (!recordActivityLog($pdo, 'Expiry Monitoring', 'Disposal Confirmed', $description, $batchId)) {
        throw new RuntimeException('Unable to write disposal confirmation to the audit history.');
    }
    $pdo->commit();
    expiryDisposalRespond(true, 'Disposal confirmed and recorded in the audit history.');
} catch (InvalidArgumentException $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    expiryDisposalRespond(false, $error->getMessage(), 400);
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('Expiry disposal confirmation failed: ' . $error->getMessage());
    expiryDisposalRespond(false, 'Unable to confirm disposal.', 500);
}
