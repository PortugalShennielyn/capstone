# purchase_order_receiving_items

Name: purchase_order_receiving_items
Acronym: PORCVITM
Description: Stores received and damaged quantities for each purchase order item. This table is the source for inventory batch creation.

## Attributes

```text
purchase_order_receiving_item_id=uuid | default=uuid() | required=yes
purchase_order_receiving_id=uuid | default= | required=yes | references=purchase_order_receivings.purchase_order_receiving_id
purchase_order_item_id=uuid | default= | required=yes | references=purchase_order_items.purchase_order_item_id
quantity_received=integer | default=0 | required=yes
quantity_damaged=integer | default=0 | required=yes
created_at=timestamp | default=current_timestamp | required=yes
```

## Example

```text
purchase_order_receiving_item_id=7d47282a-1a72-40bc-8e2c-7d56a4f39f93
purchase_order_receiving_id=a2ee9480-c4d7-4574-bbc8-ee76919f2c3f
purchase_order_item_id=e5a3024c-a4c0-4c15-bb9c-b5de8a4f816a
quantity_received=100
quantity_damaged=0
created_at=2026-06-17 10:30:00
```
