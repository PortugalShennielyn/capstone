# purchase_orders

Name: purchase_orders
Acronym: PO
Description: Stores purchase order headers. Supplier, status, payment, and expected delivery metadata live here; product lines live in purchase_order_items.

## Attributes

```text
purchase_order_id=uuid | default=uuid() | required=yes
supplier_id=uuid | default= | required=yes | references=suppliers.supplier_id
purchase_order_number=text | default= | required=yes
payment_terms=text | default= | required=
expected_delivery_date=date | default= | required=
status=text | default=pending | required=yes
payment_status=text | default=unpaid | required=yes
total_amount=number | default=0.00 | required=yes
final_amount=number | default=0.00 | required=yes
created_at=timestamp | default=current_timestamp | required=yes
updated_at=timestamp | default=current_timestamp | required=yes
```

## Example

```text
purchase_order_id=d32076aa-859e-436a-b2d2-eb8875076e02
supplier_id=0624ad74-749a-4aa9-b495-7dca3a6da5a3
purchase_order_number=PO-20260617-001
payment_terms=
expected_delivery_date=
status=pending
payment_status=unpaid
total_amount=0.00
final_amount=0.00
created_at=2026-06-17 10:30:00
updated_at=2026-06-17 10:30:00
```
