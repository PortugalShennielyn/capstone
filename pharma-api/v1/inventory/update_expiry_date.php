<?php
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';

header('Content-Type: application/json');

function respond(bool $success, string $message, string $error = '', int $httpCode = 200, array $details = []): void
{
    http_response_code($httpCode);
    echo json_encode([
        'success' => $success,
        'status' => $success ? 'success' : 'error',
        'message' => $message,
        'error' => $error
    ] + $details);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(false, 'Only POST requests are allowed.', 'Invalid request method.', 405);
}

$payload = json_decode(file_get_contents('php://input'), true);
if (!is_array($payload)) {
    respond(false, 'Invalid JSON payload.', 'Request body is not valid JSON.', 400);
}

try {
    $batchId = cleanId($payload['batch_id'] ?? null);
    $inventoryId = cleanId($payload['inventory_id'] ?? null);
    $expiryDate = trim((string) ($payload['expiry_date'] ?? ''));
    $alertDays = (int) ($payload['expiry_alert_days'] ?? 30);

    if ($batchId === '' && $inventoryId === '') {
        throw new InvalidArgumentException('Inventory batch is required.');
    }
    if ($alertDays <= 0 || $alertDays > 3650) {
        throw new InvalidArgumentException('Alert before expiry must be between 1 and 3650 days.');
    }
    if ($expiryDate !== '') {
        $parsed = DateTime::createFromFormat('Y-m-d', $expiryDate);
        if (!$parsed || $parsed->format('Y-m-d') !== $expiryDate) {
            throw new InvalidArgumentException('Expiry date must be a valid date.');
        }
    }

    $pdo->beginTransaction();
    $lookup = $pdo->prepare(
        'SELECT batch_id, legacy_inventory_id, product_id, received_date,
                CASE
                    WHEN received_date >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
                     AND NOT EXISTS (SELECT 1 FROM inventory_transfer_allocations ita WHERE ita.source_batch_id = inventory_batches.batch_id)
                     AND NOT EXISTS (SELECT 1 FROM product_selling_stock pss WHERE pss.source_batch_id = inventory_batches.batch_id)
                    THEN 1 ELSE 0
                END AS can_edit_expiry
         FROM inventory_batches
         WHERE batch_id = :batch_id
            OR legacy_inventory_id = :inventory_id
         LIMIT 1
         FOR UPDATE'
    );
    $lookup->execute([':batch_id' => $batchId, ':inventory_id' => $inventoryId]);
    $batch = $lookup->fetch(PDO::FETCH_ASSOC);
    if (!$batch) {
        throw new InvalidArgumentException('Inventory batch not found.');
    }
    if ((int) ($batch['can_edit_expiry'] ?? 0) !== 1) {
        throw new InvalidArgumentException('Expiry date locked. Expiry information can only be corrected within 24 hours of receiving the batch before inventory activity occurs.');
    }

    $updateBatch = $pdo->prepare('UPDATE inventory_batches SET expiry_date = :expiry_date WHERE batch_id = :batch_id');
    $updateBatch->execute([
        ':expiry_date' => $expiryDate === '' ? null : $expiryDate,
        ':batch_id' => $batch['batch_id']
    ]);

    $legacyInventoryId = cleanId($batch['legacy_inventory_id'] ?? null);
    if ($legacyInventoryId !== '') {
        $updateLegacy = $pdo->prepare(
            'UPDATE product_inventory
             SET expiry_date = :expiry_date,
                 expiration_date = :expiration_date,
                 expiry_alert_days = :expiry_alert_days
             WHERE inventory_id = :inventory_id'
        );
        $updateLegacy->execute([
            ':expiry_date' => $expiryDate === '' ? null : $expiryDate,
            ':expiration_date' => $expiryDate === '' ? null : $expiryDate,
            ':expiry_alert_days' => $alertDays,
            ':inventory_id' => $legacyInventoryId
        ]);
    }

    $pdo->commit();
    respond(true, 'Expiry date updated successfully.', '', 200, [
        'batch_id' => $batch['batch_id'],
        'inventory_id' => $legacyInventoryId !== '' ? $legacyInventoryId : null,
        'product_id' => $batch['product_id'],
        'expiry_date' => $expiryDate !== '' ? $expiryDate : null,
        'expiry_alert_days' => $alertDays
    ]);
} catch (InvalidArgumentException $e) {
    if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
    respond(false, $e->getMessage(), $e->getMessage(), 400);
} catch (Throwable $e) {
    if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
    respond(false, 'Unable to update expiry date.', $e->getMessage(), 500);
}
?>
