ALTER TABLE supplier_claim_damage_lines
    ADD COLUMN receiving_item_id CHAR(36) NULL AFTER claim_id,
    ADD KEY idx_claim_damage_receiving_item (receiving_item_id),
    ADD CONSTRAINT fk_claim_damage_receiving_item
        FOREIGN KEY (receiving_item_id) REFERENCES purchase_order_receiving_items (receiving_item_id) ON DELETE CASCADE;

UPDATE supplier_claim_damage_lines dl
INNER JOIN supplier_claims sc ON sc.claim_id = dl.claim_id
INNER JOIN (
    SELECT pri.po_item_id, MIN(pri.receiving_item_id) AS receiving_item_id
    FROM purchase_order_receiving_items pri
    INNER JOIN purchase_order_receiving pr ON pr.receiving_id = pri.receiving_id
    WHERE pr.receiving_type = 'Original'
    GROUP BY pri.po_item_id
) original_item ON original_item.po_item_id = sc.po_item_id
SET dl.receiving_item_id = original_item.receiving_item_id
WHERE dl.receiving_item_id IS NULL;
