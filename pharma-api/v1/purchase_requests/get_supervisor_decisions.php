<?php
require_once '../../config/db_connection.php';
require_once '../../config/auth_context.php';

header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: ' . ($_SERVER['HTTP_ORIGIN'] ?? '*'));
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Headers: Content-Type, X-Tab-Token');

requireValidSession($pdo, [
    'supervisor', 'ro-supervisor', 'ro_supervisor',
    'admin', 'super_admin', 'manager', 'ro-admin', 'ro_manager'
]);

$limit = max(1, min(20, (int)($_GET['limit'] ?? 5)));
$userId = (string) $_SESSION['user_id'];

try {
    $stmt = $pdo->prepare(
        'SELECT pr.pr_number,
                pr.status,
                pr.decided_at,
                COALESCE(NULLIF(u.full_name, ""), u.username, "Unknown") AS requested_by,
                (SELECT COUNT(*) FROM purchase_request_items pri WHERE pri.pr_id = pr.pr_id) AS item_count
         FROM purchase_requests pr
         INNER JOIN users u ON u.user_id = pr.requested_by
         WHERE pr.supervisor_user_id = :user_id
           AND pr.status IN ("Approved", "Rejected", "Revision Requested")
         ORDER BY pr.decided_at DESC
         LIMIT :limit'
    );
    $stmt->bindValue(':user_id', $userId);
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->execute();

    $decisions = [];
    foreach ($stmt->fetchAll() as $row) {
        $decisions[] = [
            'pr_number'    => $row['pr_number'],
            'status'       => $row['status'],
            'requested_by' => $row['requested_by'],
            'summary'      => (int)$row['item_count'] . ' item' . ((int)$row['item_count'] === 1 ? '' : 's'),
            'decided_at'   => $row['decided_at'] ? date('M j, g:i A', strtotime($row['decided_at'])) : '—',
        ];
    }

    echo json_encode(['success' => true, 'decisions' => $decisions]);
} catch (PDOException $e) {
    error_log('[SUPERVISOR_DECISIONS] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Server error.']);
}