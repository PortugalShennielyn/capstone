<?php
require_once '../../config/db_connection.php';
require_once '../../config/auth_context.php';

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
    ':pharmacy_name' => trim((string) ($payload['name'] ?? 'Dr. R Pharmacy')) ?: 'Dr. R Pharmacy',
    ':pharmacy_email' => trim((string) ($payload['email'] ?? '')) ?: null,
    ':contact_number' => trim((string) ($payload['contactNumber'] ?? '')) ?: null,
    ':tin_license_number' => trim((string) ($payload['tinLicense'] ?? '')) ?: null,
    ':pharmacy_address' => trim((string) ($payload['address'] ?? '')) ?: null,
    ':website' => trim((string) ($payload['website'] ?? '')) ?: null,
    ':timezone' => trim((string) ($payload['timeZone'] ?? 'Asia/Manila')) ?: 'Asia/Manila',
    ':logo_path' => trim((string) ($payload['logoName'] ?? '')) ?: null,
]);

echo json_encode([
    'status' => 'success',
]);
?>
