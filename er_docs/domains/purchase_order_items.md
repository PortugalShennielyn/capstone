# purchase_order_items

Name: purchase_order_items
Acronym: POITEM
Description: Stores purchase order line items. Snapshot fields preserve what was ordered without duplicating active product attributes.

## Attributes

```text
purchase_order_item_id=uuid | default=uuid() | required=yes
purchase_order_id=uuid | default= | required=yes | references=purchase_orders.purchase_order_id
product_variation_id=uuid | default= | required=yes | references=product_variations.product_variation_id
quantity_ordered=integer | default=0 | required=yes
unit_price_snapshot=number | default= | required=
product_name_snapshot=text | default= | required=
variation_name_snapshot=text | default= | required=
created_at=timestamp | default=current_timestamp | required=yes
```

## Example

```text
purchase_order_item_id=e5a3024c-a4c0-4c15-bb9c-b5de8a4f816a
purchase_order_id=d32076aa-859e-436a-b2d2-eb8875076e02
product_variation_id=093e4414-a6a7-4a38-92de-51607d2fbb83
quantity_ordered=100
unit_price_snapshot=
product_name_snapshot=
variation_name_snapshot=
created_at=2026-06-17 10:30:00
```
