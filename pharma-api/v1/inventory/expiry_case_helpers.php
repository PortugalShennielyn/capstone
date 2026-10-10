<?php
require_once __DIR__ . '/../../config/db_connection.php';
require_once __DIR__ . '/../activity_log_helpers.php';

function expiryCaseReply(bool $ok, string $message, array $extra = [], int $code = 200): never
{
    http_response_code($code);
    echo json_encode(['status' => $ok ? 'success' : 'error', 'message' => $message] + $extra);
    exit;
}

function expiryCaseQuantity(mixed $value, string $label, bool $allowZero = false): int
{
    if (filter_var($value, FILTER_VALIDATE_INT) === false) {
        throw new InvalidArgumentException("{$label} must be a whole number.");
    }
    $qty = (int) $value;
    if ($qty < ($allowZero ? 0 : 1)) throw new InvalidArgumentException("{$label} is invalid.");
    return $qty;
}

function expiryCaseDate(mixed $value, bool $required = false): ?string
{
    $date = trim((string) $value);
    if ($date === '') {
        if ($required) throw new InvalidArgumentException('An expiry date is required for medicine replacement stock.');
        return null;
    }
    $parsed = DateTimeImmutable::createFromFormat('!Y-m-d', $date);
    if (!$parsed || $parsed->format('Y-m-d') !== $date) throw new InvalidArgumentException('Enter a valid date.');
    return $date;
}

function expiryCaseEvent(PDO $pdo, string $caseId, string $status, string $description, ?string $reference = null): void
{
    $pdo->prepare('INSERT INTO inventory_resolution_case_events (event_id,case_id,status,description,reference_number,actor_id)
                   VALUES (:event,:case_id,:status,:description,:reference,:actor)')
        ->execute([
            ':event' => newUuid($pdo), ':case_id' => $caseId, ':status' => $status,
            ':description' => $description, ':reference' => $reference,
            ':actor' => cleanId($_SESSION['user_id'] ?? null) ?: null
        ]);
}

function expiryCaseShelfRows(PDO $pdo, string $batchId): array
{
    $statement = $pdo->prepare('SELECT selling_stock_id,quantity_remaining,expiry_quarantined_qty
        FROM product_selling_stock WHERE source_batch_id=:batch_id AND quantity_remaining>0
        ORDER BY expiration_date IS NULL,expiration_date,created_at,selling_stock_id FOR UPDATE');
    $statement->execute([':batch_id' => $batchId]);
    return $statement->fetchAll(PDO::FETCH_ASSOC);
}

function expiryCaseConsumeReserved(PDO $pdo, array $case, array $batch): void
{
    $storage = (int) $case['storage_qty'];
    $shelf = (int) $case['shelf_qty'];
    if ($storage > 0) {
        $update = $pdo->prepare('UPDATE inventory_batches SET storage_qty=storage_qty-:qty,
            expiry_quarantined_storage_qty=expiry_quarantined_storage_qty-:reserved
            WHERE batch_id=:batch_id AND storage_qty>=:guard AND expiry_quarantined_storage_qty>=:quarantine_guard');
        $update->execute([':qty'=>$storage,':reserved'=>$storage,':batch_id'=>$case['batch_id'],':guard'=>$storage,':quarantine_guard'=>$storage]);
        if ($update->rowCount() !== 1) throw new RuntimeException('Reserved storage stock changed. Reload the case.');
        $legacyId = cleanId($batch['legacy_inventory_id'] ?? null);
        if ($legacyId !== '') {
            $legacy = $pdo->prepare('UPDATE product_inventory SET quantity_remaining=quantity_remaining-:qty
                WHERE inventory_id=:id AND quantity_remaining>=:guard');
            $legacy->execute([':qty'=>$storage,':id'=>$legacyId,':guard'=>$storage]);
            if ($legacy->rowCount() !== 1) throw new RuntimeException('Legacy storage stock changed. Reload the case.');
        }
    }
    $remaining = $shelf;
    foreach (expiryCaseShelfRows($pdo, (string) $case['batch_id']) as $row) {
        if ($remaining === 0) break;
        $take = min($remaining, (int) $row['expiry_quarantined_qty']);
        if ($take <= 0) continue;
        $update = $pdo->prepare('UPDATE product_selling_stock
            SET quantity_remaining=quantity_remaining-:qty,
                expiry_quarantined_qty=expiry_quarantined_qty-:reserved
            WHERE selling_stock_id=:id AND quantity_remaining>=:guard AND expiry_quarantined_qty>=:quarantine_guard');
        $update->execute([':qty'=>$take,':reserved'=>$take,':id'=>$row['selling_stock_id'],':guard'=>$take,':quarantine_guard'=>$take]);
        if ($update->rowCount() !== 1) throw new RuntimeException('Reserved shelf stock changed. Reload the case.');
        $remaining -= $take;
    }
    if ($remaining !== 0) throw new RuntimeException('Reserved shelf stock is incomplete. Reload the case.');
}

function expiryCaseAudit(PDO $pdo, array $case, string $action, string $description): void
{
    if (!recordActivityLog($pdo, 'Returns & Disposals', $action, $description, (string) $case['case_id'])) {
        throw new RuntimeException('Unable to record case activity.');
    }
}
