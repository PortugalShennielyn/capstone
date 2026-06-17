# purchase_order_returns

Name: purchase_order_returns
Acronym: PORET
Description: Stores return or damage records linked to purchase order items. Reason labels should reference lookup values by code when possible.

## Attributes

```text
purchase_order_return_id=uuid | default=uuid() | required=yes
purchase_order_id=uuid | default= | required=yes | references=purchase_orders.purchase_order_id
purchase_order_item_id=uuid | default= | required=yes | references=purchase_order_items.purchase_order_item_id
quantity_returned=integer | default=0 | required=yes
reason_code=text | default= | required=yes
remarks=text | default= | required=
status=text | default=open | required=yes
created_at=timestamp | default=current_timestamp | required=yes
```

## Example

```text
purchase_order_return_id=95c2a4b7-3997-4d8f-ac9d-dd6bf36ba511
purchase_order_id=d32076aa-859e-436a-b2d2-eb8875076e02
purchase_order_item_id=e5a3024c-a4c0-4c15-bb9c-b5de8a4f816a
quantity_returned=1
reason_code=damaged
remarks=
status=open
created_at=2026-06-17 10:30:00
```
