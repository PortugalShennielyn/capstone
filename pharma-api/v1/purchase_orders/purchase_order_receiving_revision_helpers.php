<?php

function ensurePurchaseOrderReceivingRevisionSchema(PDO $pdo): void
{
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS purchase_order_receiving_revisions (
            revision_id CHAR(36) NOT NULL DEFAULT (UUID()),
            receiving_id CHAR(36) NOT NULL,
            edited_by CHAR(36) NULL,
            edited_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            edit_reason VARCHAR(500) NOT NULL,
            before_data LONGTEXT NOT NULL,
            after_data LONGTEXT NOT NULL,
            PRIMARY KEY (revision_id),
            KEY idx_receiving_revisions_receiving_date (receiving_id, edited_at),
            KEY idx_receiving_revisions_editor (edited_by),
            CONSTRAINT fk_receiving_revisions_receiving FOREIGN KEY (receiving_id) REFERENCES purchase_order_receiving (receiving_id) ON DELETE CASCADE,
            CONSTRAINT fk_receiving_revisions_editor FOREIGN KEY (edited_by) REFERENCES users (user_id) ON DELETE SET NULL,
            CONSTRAINT chk_receiving_revisions_before_json CHECK (JSON_VALID(before_data)),
            CONSTRAINT chk_receiving_revisions_after_json CHECK (JSON_VALID(after_data))
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"
    );
}

function latestPurchaseOrderReceivingRevision(PDO $pdo, string $receivingId): ?array
{
    $statement = $pdo->prepare(
        "SELECT r.revision_id, r.receiving_id, r.edited_by, r.edited_at, r.edit_reason,
                COALESCE(NULLIF(u.full_name, ''), u.username, 'System') AS edited_by_name
         FROM purchase_order_receiving_revisions r
         LEFT JOIN users u ON u.user_id = r.edited_by
         WHERE r.receiving_id = :receiving_id
         ORDER BY r.edited_at DESC, r.revision_id DESC
         LIMIT 1"
    );
    $statement->execute([':receiving_id' => $receivingId]);
    $revision = $statement->fetch(PDO::FETCH_ASSOC);
    return $revision ?: null;
}

function receivingRevisionSnapshot(array $details): array
{
    return [
        'receiving_id' => $details['receiving_id'] ?? null,
        'po_id' => $details['po_id'] ?? null,
        'receiving_remarks' => $details['receiving_remarks'] ?? '',
        'items' => array_map(static function (array $item): array {
            return [
                'po_item_id' => $item['po_item_id'],
                'delivered_quantity' => (int) ($item['delivered_quantity'] ?? 0),
                'accepted_quantity' => (int) ($item['accepted_quantity'] ?? 0),
                'damaged_quantity' => (int) ($item['damaged_quantity'] ?? 0),
                'action_quantity' => (int) ($item['action_quantity'] ?? 0),
                'returned_quantity' => (int) ($item['returned_quantity'] ?? 0),
                'missing_quantity' => (int) ($item['missing_quantity'] ?? 0),
                'issue_type' => $item['issue_type'] ?? '',
                'affected_goods_action' => $item['affected_goods_action'] ?? '',
                'resolution' => $item['resolution'] ?? 'none',
                'claim_status' => $item['return_status'] ?? '',
                'item_remarks' => $item['item_remarks'] ?? '',
                'damage_breakdown' => $item['damage_breakdown'] ?? [],
                'batches' => array_map(static fn(array $batch): array => [
                    'batch_id' => $batch['batch_id'] ?? null,
                    'batch_identifier' => $batch['batch_identifier'] ?? '',
                    'batch_quantity' => (int) ($batch['batch_quantity'] ?? 0),
                    'expiry_date' => $batch['expiry_date'] ?? null,
                ], $item['batches'] ?? []),
            ];
        }, $details['items'] ?? []),
    ];
}

