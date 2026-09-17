<?php
require_once '../../config/db_connection.php';
require_once '../../config/auth_context.php';
require_once __DIR__ . '/settings_helpers.php';

requireValidSession($pdo);

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode([
        'status' => 'error',
        'message' => 'Only GET requests are allowed.'
    ]);
    exit();
}

$settings = fetchSystemSettings($pdo);
$profile = $settings;
unset(
    $profile['grnReceivedByName'],
    $profile['grnApprovedByName'],
    $profile['prPreparedName'],
    $profile['prPreparedRole'],
    $profile['prReviewedName'],
    $profile['prReviewedRole'],
    $profile['poPreparedName'],
    $profile['poPreparedRole'],
    $profile['poApprovedName'],
    $profile['poApprovedRole']
);

echo json_encode([
    'status' => 'success',
    'profile' => $profile,
    'grn' => [
        'receivedByName' => $settings['grnReceivedByName'] ?? '',
        'approvedByName' => $settings['grnApprovedByName'] ?? '',
    ],
    'procurementDocumentSettings' => [
        'prPreparedName' => $settings['prPreparedName'] ?? '',
        'prPreparedRole' => $settings['prPreparedRole'] ?? 'Manager',
        'prReviewedName' => $settings['prReviewedName'] ?? '',
        'prReviewedRole' => $settings['prReviewedRole'] ?? 'Supervisor',
        'poPreparedName' => $settings['poPreparedName'] ?? '',
        'poPreparedRole' => $settings['poPreparedRole'] ?? 'Manager',
        'poApprovedName' => $settings['poApprovedName'] ?? '',
        'poApprovedRole' => $settings['poApprovedRole'] ?? 'Supervisor',
    ],
    'businessSchedule' => fetchBusinessHours($pdo),
    'businessExceptions' => fetchBusinessHourExceptions($pdo, $_GET['month'] ?? null),
    'nextBusinessException' => fetchNextBusinessHourException($pdo),
]);
?>
