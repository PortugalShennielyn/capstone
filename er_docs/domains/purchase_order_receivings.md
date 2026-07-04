# purchase_order_receivings

Name: purchase_order_receivings
Acronym: PORCV
Description: Stores receiving events for purchase orders. Item quantities belong in purchase_order_receiving_items.

## Attributes

```text
purchase_order_receiving_id=uuid | default=uuid() | required=yes
purchase_order_id=uuid | default= | required=yes | references=purchase_orders.purchase_order_id
received_at=timestamp | default=current_timestamp | required=yes
remarks=text | default= | required=
created_at=timestamp | default=current_timestamp | required=yes
```

## Example

```text
purchase_order_receiving_id=a2ee9480-c4d7-4574-bbc8-ee76919f2c3f
purchase_order_id=d32076aa-859e-436a-b2d2-eb8875076e02
received_at=2026-06-17 10:30:00
remarks=
created_at=2026-06-17 10:30:00
```
