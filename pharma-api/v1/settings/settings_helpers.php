<?php

const SETTINGS_WEEK_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SETTINGS_EXCEPTION_REASONS = ['Holiday', 'Maintenance', 'Emergency Closure', 'Inventory Count', 'Custom Hours', 'Custom'];

function normalizeClockTime(?string $value): ?string
{
    $clean = trim((string) $value);
    if ($clean === '') {
        return null;
    }

    if (!preg_match('/^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/', $clean, $matches)) {
        return null;
    }

    return $matches[1] . ':' . $matches[2] . ':00';
}

function ensureBusinessHoursRows(PDO $pdo): void
{
    $stmt = $pdo->prepare(
        "INSERT INTO business_hours (day_of_week, is_open, opening_time, closing_time)
         VALUES (:day_of_week, 1, '08:00:00', '21:00:00')
         ON DUPLICATE KEY UPDATE day_of_week = VALUES(day_of_week)"
    );

    foreach (SETTINGS_WEEK_DAYS as $day) {
        $stmt->execute([':day_of_week' => $day]);
    }
}

function ensureBusinessHourExceptionsTable(PDO $pdo): void
{
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS business_hour_exceptions (
            exception_id INT(11) NOT NULL AUTO_INCREMENT,
            exception_date DATE NOT NULL,
            is_open TINYINT(1) NOT NULL DEFAULT 0,
            opening_time TIME DEFAULT NULL,
            closing_time TIME DEFAULT NULL,
            reason VARCHAR(80) NOT NULL DEFAULT 'Custom Hours',
            custom_reason VARCHAR(255) DEFAULT NULL,
            created_by VARCHAR(150) DEFAULT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (exception_id),
            UNIQUE KEY unique_exception_date (exception_date)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"
    );
}

function fetchBusinessHours(PDO $pdo): array
{
    ensureBusinessHoursRows($pdo);

    $stmt = $pdo->query(
        "SELECT day_of_week, is_open, opening_time, closing_time
         FROM business_hours"
    );

    $rowsByDay = [];
    foreach ($stmt->fetchAll() as $row) {
        $rowsByDay[$row['day_of_week']] = [
            'day' => $row['day_of_week'],
            'open' => (bool) $row['is_open'],
            'openTime' => $row['opening_time'] ? substr((string) $row['opening_time'], 0, 5) : '08:00',
            'closeTime' => $row['closing_time'] ? substr((string) $row['closing_time'], 0, 5) : '21:00',
        ];
    }

    $schedule = [];
    foreach (SETTINGS_WEEK_DAYS as $day) {
        $schedule[$day] = $rowsByDay[$day] ?? [
            'day' => $day,
            'open' => true,
            'openTime' => '08:00',
            'closeTime' => '21:00',
        ];
    }

    return $schedule;
}

function updateBusinessHour(PDO $pdo, string $day, array $payload): void
{
    if (!in_array($day, SETTINGS_WEEK_DAYS, true)) {
        throw new InvalidArgumentException('Invalid business day.');
    }

    $isOpen = !empty($payload['open']);
    $openingTime = $isOpen ? normalizeClockTime($payload['openTime'] ?? '') : null;
    $closingTime = $isOpen ? normalizeClockTime($payload['closeTime'] ?? '') : null;

    if ($isOpen && (!$openingTime || !$closingTime || $closingTime <= $openingTime)) {
        throw new InvalidArgumentException('Closing Time must be later than Opening Time.');
    }

    $stmt = $pdo->prepare(
        "INSERT INTO business_hours (day_of_week, is_open, opening_time, closing_time)
         VALUES (:day_of_week, :is_open, :opening_time, :closing_time)
         ON DUPLICATE KEY UPDATE
             is_open = VALUES(is_open),
             opening_time = VALUES(opening_time),
             closing_time = VALUES(closing_time),
             updated_at = NOW()"
    );

    $stmt->execute([
        ':day_of_week' => $day,
        ':is_open' => $isOpen ? 1 : 0,
        ':opening_time' => $openingTime,
        ':closing_time' => $closingTime,
    ]);
}

function normalizeExceptionDate($value): string
{
    $clean = trim((string) $value);
    $date = DateTime::createFromFormat('Y-m-d', $clean);
    if (!$date || $date->format('Y-m-d') !== $clean) {
        throw new InvalidArgumentException('Invalid exception date.');
    }
    return $clean;
}

function normalizeExceptionReason($value): string
{
    $reason = trim((string) $value);
    return in_array($reason, SETTINGS_EXCEPTION_REASONS, true) ? $reason : 'Custom Hours';
}

function rowToBusinessHourException(array $row): array
{
    return [
        'date' => (string) $row['exception_date'],
        'open' => (bool) $row['is_open'],
        'openTime' => $row['opening_time'] ? substr((string) $row['opening_time'], 0, 5) : '08:00',
        'closeTime' => $row['closing_time'] ? substr((string) $row['closing_time'], 0, 5) : '21:00',
        'reason' => (string) ($row['reason'] ?? 'Custom Hours'),
        'customReason' => (string) ($row['custom_reason'] ?? ''),
        'createdBy' => (string) ($row['created_by'] ?? 'System'),
        'createdAt' => (string) ($row['created_at'] ?? ''),
        'updatedAt' => (string) ($row['updated_at'] ?? ''),
    ];
}

function fetchBusinessHourExceptions(PDO $pdo, ?string $month = null): array
{
    ensureBusinessHourExceptionsTable($pdo);

    if ($month !== null && preg_match('/^\d{4}-\d{2}$/', $month)) {
        $stmt = $pdo->prepare(
            "SELECT exception_date, is_open, opening_time, closing_time, reason, custom_reason, created_by, created_at, updated_at
             FROM business_hour_exceptions
             WHERE DATE_FORMAT(exception_date, '%Y-%m') = :month
             ORDER BY exception_date ASC"
        );
        $stmt->execute([':month' => $month]);
    } else {
        $stmt = $pdo->query(
            "SELECT exception_date, is_open, opening_time, closing_time, reason, custom_reason, created_by, created_at, updated_at
             FROM business_hour_exceptions
             ORDER BY exception_date ASC"
        );
    }

    $exceptions = [];
    foreach ($stmt->fetchAll() as $row) {
        $exception = rowToBusinessHourException($row);
        $exceptions[$exception['date']] = $exception;
    }

    return $exceptions;
}

function fetchBusinessHourException(PDO $pdo, string $date): ?array
{
    ensureBusinessHourExceptionsTable($pdo);

    $stmt = $pdo->prepare(
        "SELECT exception_date, is_open, opening_time, closing_time, reason, custom_reason, created_by, created_at, updated_at
         FROM business_hour_exceptions
         WHERE exception_date = :exception_date
         LIMIT 1"
    );
    $stmt->execute([':exception_date' => normalizeExceptionDate($date)]);
    $row = $stmt->fetch();

    return $row ? rowToBusinessHourException($row) : null;
}

function fetchNextBusinessHourException(PDO $pdo): ?array
{
    ensureBusinessHourExceptionsTable($pdo);

    $stmt = $pdo->query(
        "SELECT exception_date, is_open, opening_time, closing_time, reason, custom_reason, created_by, created_at, updated_at
         FROM business_hour_exceptions
         WHERE exception_date >= CURDATE()
           AND reason = 'Holiday'
         ORDER BY exception_date ASC
         LIMIT 1"
    );
    $row = $stmt->fetch();

    return $row ? rowToBusinessHourException($row) : null;
}

function updateBusinessHourException(PDO $pdo, array $payload, ?string $createdBy = null): void
{
    ensureBusinessHourExceptionsTable($pdo);

    $date = normalizeExceptionDate($payload['date'] ?? '');
    $isOpen = !empty($payload['open']);
    $openingTime = $isOpen ? normalizeClockTime($payload['openTime'] ?? '') : null;
    $closingTime = $isOpen ? normalizeClockTime($payload['closeTime'] ?? '') : null;

    if ($isOpen && (!$openingTime || !$closingTime || $closingTime <= $openingTime)) {
        throw new InvalidArgumentException('Closing Time must be later than Opening Time.');
    }

    $stmt = $pdo->prepare(
        "INSERT INTO business_hour_exceptions
            (exception_date, is_open, opening_time, closing_time, reason, custom_reason, created_by)
         VALUES
            (:exception_date, :is_open, :opening_time, :closing_time, :reason, :custom_reason, :created_by)
         ON DUPLICATE KEY UPDATE
            is_open = VALUES(is_open),
            opening_time = VALUES(opening_time),
            closing_time = VALUES(closing_time),
            reason = VALUES(reason),
            custom_reason = VALUES(custom_reason),
            created_by = COALESCE(created_by, VALUES(created_by)),
            updated_at = NOW()"
    );

    $stmt->execute([
        ':exception_date' => $date,
        ':is_open' => $isOpen ? 1 : 0,
        ':opening_time' => $openingTime,
        ':closing_time' => $closingTime,
        ':reason' => normalizeExceptionReason($payload['reason'] ?? 'Custom Hours'),
        ':custom_reason' => trim((string) ($payload['customReason'] ?? '')) ?: null,
        ':created_by' => $createdBy ?: 'System',
    ]);
}

function deleteBusinessHourException(PDO $pdo, string $date): void
{
    ensureBusinessHourExceptionsTable($pdo);

    $stmt = $pdo->prepare('DELETE FROM business_hour_exceptions WHERE exception_date = :exception_date');
    $stmt->execute([':exception_date' => normalizeExceptionDate($date)]);
}

function fetchSystemSettings(PDO $pdo): array
{
    ensurePurchaseRequestQuantityLimitColumn($pdo);
    $desiredColumns = [
        'pharmacy_name', 'pharmacy_email', 'contact_number', 'tin_license_number',
        'pharmacy_address', 'website', 'timezone', 'logo_path',
        'grn_received_by_name', 'grn_approved_by_name',
        'pr_prepared_name', 'pr_prepared_role', 'pr_reviewed_name', 'pr_reviewed_role',
        'po_prepared_name', 'po_prepared_role', 'po_approved_name', 'po_approved_role',
        'pr_quantity_limit',
    ];
    $availableColumns = array_column($pdo->query('SHOW COLUMNS FROM system_settings')->fetchAll(PDO::FETCH_ASSOC), 'Field');
    $selectedColumns = array_values(array_intersect($desiredColumns, $availableColumns));
    if (!$selectedColumns) return [];

    $stmt = $pdo->query(sprintf(
        'SELECT %s FROM system_settings ORDER BY setting_id ASC LIMIT 1',
        implode(', ', array_map(static fn(string $column): string => '`' . $column . '`', $selectedColumns))
    ));

    $row = $stmt->fetch() ?: [];

    return [
        'name' => (string) ($row['pharmacy_name'] ?? 'Dr. R Pharmacy'),
        'email' => (string) ($row['pharmacy_email'] ?? ''),
        'contactNumber' => (string) ($row['contact_number'] ?? ''),
        'tinLicense' => (string) ($row['tin_license_number'] ?? ''),
        'address' => (string) ($row['pharmacy_address'] ?? ''),
        'website' => (string) ($row['website'] ?? ''),
        'timeZone' => (string) ($row['timezone'] ?? 'Asia/Manila'),
        'logoName' => (string) ($row['logo_path'] ?? ''),
        'grnReceivedByName' => (string) ($row['grn_received_by_name'] ?? ''),
        'grnApprovedByName' => (string) ($row['grn_approved_by_name'] ?? ''),
        'prPreparedName' => (string) ($row['pr_prepared_name'] ?? ''),
        'prPreparedRole' => trim((string) ($row['pr_prepared_role'] ?? '')) ?: 'Manager',
        'prReviewedName' => (string) ($row['pr_reviewed_name'] ?? ''),
        'prReviewedRole' => trim((string) ($row['pr_reviewed_role'] ?? '')) ?: 'Supervisor',
        'poPreparedName' => (string) ($row['po_prepared_name'] ?? ''),
        'poPreparedRole' => trim((string) ($row['po_prepared_role'] ?? '')) ?: 'Manager',
        'poApprovedName' => (string) ($row['po_approved_name'] ?? ''),
        'poApprovedRole' => trim((string) ($row['po_approved_role'] ?? '')) ?: 'Supervisor',
        'prQuantityLimit' => max(1, (int) ($row['pr_quantity_limit'] ?? 50)),
    ];
}

function ensurePurchaseRequestQuantityLimitColumn(PDO $pdo): void
{
    $check = $pdo->query(
        "SELECT COUNT(*) FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'system_settings'
           AND COLUMN_NAME = 'pr_quantity_limit'"
    );
    if ((int) $check->fetchColumn() === 0) {
        $pdo->exec('ALTER TABLE system_settings ADD COLUMN pr_quantity_limit INT NOT NULL DEFAULT 50 AFTER po_approved_role');
    }
}

function fetchPurchaseRequestQuantityLimit(PDO $pdo): int
{
    ensurePurchaseRequestQuantityLimitColumn($pdo);
    $limit = (int) ($pdo->query('SELECT pr_quantity_limit FROM system_settings ORDER BY setting_id ASC LIMIT 1')->fetchColumn() ?: 50);
    return max(1, $limit);
}

?>
