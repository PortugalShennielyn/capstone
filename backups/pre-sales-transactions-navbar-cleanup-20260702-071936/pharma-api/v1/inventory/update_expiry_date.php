<?php
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';

header('Content-Type: application/json');

function respond(bool $success, string $message, string $error = '', int $httpCode = 200): void
{
    http_response_code($httpCode);
    echo json_encode([
        'success' => $success,
        'status' => $success ? 'success' : 'error',
        'message' => $message,
        'error' => $error
    ]);
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
    $pdo->exec("ALTER TABLE product_inventory ADD COLUMN IF NOT EXISTS expiry_date DATE NULL");
    $pdo->exec("ALTER TABLE product_inventory ADD COLUMN IF NOT EXISTS expiration_date DATE NULL");
    $pdo->exec("ALTER TABLE product_inventory ADD COLUMN IF NOT EXISTS expiry_alert_days INT NOT NULL DEFAULT 30");

    $inventoryId = cleanId($payload['inventory_id'] ?? null);
    $expiryDate = trim((string) ($payload['expiry_date'] ?? ''));
    $alertDays = (int) ($payload['expiry_alert_days'] ?? 30);

    if ($inventoryId === '') {
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

    $statement = $pdo->prepare(
        'UPDATE product_inventory
         SET expiry_date = :expiry_date,
             expiration_date = :expiration_date,
             expiry_alert_days = :expiry_alert_days
         WHERE inventory_id = :inventory_id'
    );
    $statement->execute([
        ':expiry_date' => $expiryDate === '' ? null : $expiryDate,
        ':expiration_date' => $expiryDate === '' ? null : $expiryDate,
        ':expiry_alert_days' => $alertDays,
        ':inventory_id' => $inventoryId
    ]);

    if ($statement->rowCount() === 0) {
        $check = $pdo->prepare('SELECT COUNT(*) FROM product_inventory WHERE inventory_id = :inventory_id');
        $check->execute([':inventory_id' => $inventoryId]);
        if ((int) $check->fetchColumn() === 0) {
            throw new InvalidArgumentException('Inventory batch not found.');
        }
    }

    respond(true, 'Expiry date updated successfully.');
} catch (InvalidArgumentException $e) {
    respond(false, $e->getMessage(), $e->getMessage(), 400);
} catch (Throwable $e) {
    respond(false, 'Unable to update expiry date.', $e->getMessage(), 500);
}
?>
