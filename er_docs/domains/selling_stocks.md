# selling_stocks

Name: selling_stocks
Acronym: SELLSTK
Description: Stores quantities moved from inventory batches into a sellable stock location. This table tracks availability, not product identity.

## Attributes

```text
selling_stock_id=uuid | default=uuid() | required=yes
inventory_batch_id=uuid | default= | required= | references=inventory_batches.inventory_batch_id
product_variation_id=uuid | default= | required=yes | references=product_variations.product_variation_id
location_code=text | default=default | required=yes
quantity_stocked=integer | default=0 | required=yes
quantity_remaining=integer | default=0 | required=yes
created_at=timestamp | default=current_timestamp | required=yes
```

## Example

```text
selling_stock_id=638f4e7a-7399-4fa2-90a9-b802a7f0e226
inventory_batch_id=eb329a6a-7ef4-4a3d-b764-76d79d6e7cc1
product_variation_id=093e4414-a6a7-4a38-92de-51607d2fbb83
location_code=default
quantity_stocked=10
quantity_remaining=10
created_at=2026-06-17 10:30:00
```
