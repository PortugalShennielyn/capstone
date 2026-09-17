-- Keep completed receiving in the Delivered lifecycle; issues remain supplier claims.
UPDATE purchase_orders
SET status = 'Delivered'
WHERE status IN ('Return/Damage', 'Delivered with Return/Damage');

UPDATE lookup_values
SET is_active = 0
WHERE lookup_type = 'purchase_order_status'
  AND lookup_code IN ('return_damage', 'delivered_with_return_damage');

UPDATE supplier_claims
SET claim_status = 'Partially Replaced'
WHERE claim_status = 'Replacement Partially Received';

UPDATE supplier_claims
SET claim_status = 'Resolved',
    resolved_at = COALESCE(resolved_at, CURRENT_TIMESTAMP)
WHERE claim_status = 'Replacement Received / Resolved';
