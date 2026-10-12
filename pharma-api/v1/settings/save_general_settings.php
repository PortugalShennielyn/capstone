<?php
require_once '../../config/db_connection.php';
require_once '../../config/auth_context.php';
require_once '../activity_log_helpers.php';

requireValidSession($pdo);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode([
        'status' => 'error',
        'message' => 'Only POST requests are allowed.'
    ]);
    exit();
}

$payload = json_decode(file_get_contents('php://input'), true);
if (!is_array($payload)) {
    http_response_code(400);
    echo json_encode([
        'status' => 'error',
        'message' => 'Invalid JSON payload.'
    ]);
    exit();
}

$settings = [
    'pharmacy_name' => trim((string) ($payload['name'] ?? 'Dr. R Pharmacy')) ?: 'Dr. R Pharmacy',
    'pharmacy_email' => trim((string) ($payload['email'] ?? '')) ?: null,
    'contact_number' => trim((string) ($payload['contactNumber'] ?? '')) ?: null,
    'tin_license_number' => trim((string) ($payload['tinLicense'] ?? '')) ?: null,
    'pharmacy_address' => trim((string) ($payload['address'] ?? '')) ?: null,
    'website' => trim((string) ($payload['website'] ?? '')) ?: null,
    'timezone' => trim((string) ($payload['timeZone'] ?? 'Asia/Manila')) ?: 'Asia/Manila',
    'logo_path' => trim((string) ($payload['logoName'] ?? '')) ?: null,
];
$pdo->beginTransaction();
try {
$oldStmt = $pdo->query('SELECT pharmacy_name, pharmacy_email, contact_number, tin_license_number, pharmacy_address, website, timezone, logo_path FROM system_settings WHERE setting_id = 1 LIMIT 1');
$previous = $oldStmt->fetch(PDO::FETCH_ASSOC) ?: [];
$stmt = $pdo->prepare(
    "INSERT INTO system_settings
        (setting_id, pharmacy_name, pharmacy_email, contact_number, tin_license_number, pharmacy_address, website, timezone, logo_path)
     VALUES
        (1, :pharmacy_name, :pharmacy_email, :contact_number, :tin_license_number, :pharmacy_address, :website, :timezone, :logo_path)
     ON DUPLICATE KEY UPDATE
        pharmacy_name = VALUES(pharmacy_name),
        pharmacy_email = VALUES(pharmacy_email),
        contact_number = VALUES(contact_number),
        tin_license_number = VALUES(tin_license_number),
        pharmacy_address = VALUES(pharmacy_address),
        website = VALUES(website),
        timezone = VALUES(timezone),
        logo_path = VALUES(logo_path),
        updated_at = NOW()"
);

$stmt->execute([
    ':pharmacy_name' => $settings['pharmacy_name'], ':pharmacy_email' => $settings['pharmacy_email'],
    ':contact_number' => $settings['contact_number'], ':tin_license_number' => $settings['tin_license_number'],
    ':pharmacy_address' => $settings['pharmacy_address'], ':website' => $settings['website'],
    ':timezone' => $settings['timezone'], ':logo_path' => $settings['logo_path'],
]);
recordSettingsDiffAudit($pdo, $previous, $settings, [
    'pharmacy_name' => 'Store Name', 'pharmacy_email' => 'Store Email', 'contact_number' => 'Contact Number',
    'tin_license_number' => 'TIN / License Number', 'pharmacy_address' => 'Store Address', 'website' => 'Website',
    'timezone' => 'Timezone', 'logo_path' => 'Store Logo',
], ['tin_license_number']);
$pdo->commit();
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('General settings transaction failed: ' . $error->getMessage());
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to save settings.']);
    exit();
}

echo json_encode([
    'status' => 'success',
]);
?>
