<?php
require_once '../../config/db_connection.php';
require_once '../../config/auth_context.php';
require_once __DIR__ . '/settings_helpers.php';

requireValidSession($pdo);

if (!currentSessionHasRbacRole('admin') && !currentSessionHasRbacRole('super_admin')) {
    http_response_code(403);
    echo json_encode(['status' => 'error', 'message' => 'Only Admin users can change stock thresholds.']);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Only POST requests are allowed.']);
    exit();
}

$payload = json_decode(file_get_contents('php://input'), true);
if (!is_array($payload)) {
    http_response_code(422);
    echo json_encode(['status' => 'error', 'message' => 'Enter whole numbers for the stock thresholds.']);
    exit();
}

$readWholeNumber = static function ($value): ?int {
    if (is_int($value)) {
        return $value >= 0 && $value <= 1000000 ? $value : null;
    }
    if (is_string($value) && preg_match('/^\d+$/', $value) === 1) {
        $number = (int) $value;
        return $number <= 1000000 ? $number : null;
    }
    return null;
};

$storageLow = $readWholeNumber($payload['storageLow'] ?? null);
$shelfLow = $readWholeNumber($payload['shelfLow'] ?? null);
$critical = $readWholeNumber($payload['critical'] ?? null);

if ($storageLow === null || $shelfLow === null || $critical === null) {
    http_response_code(422);
    echo json_encode(['status' => 'error', 'message' => 'Enter whole numbers from 0 to 1,000,000.']);
    exit();
}

$saved = saveStockThresholds($pdo, $storageLow, $shelfLow, $critical);

echo json_encode([
    'status' => 'success',
    'stockThresholds' => $saved,
]);
?>
