# inventory_batches

Name: inventory_batches
Acronym: INVBATCH
Description: Stores inbound inventory batches for any product variation. Batch quantity, expiry, and receiving source belong here instead of products.

## Attributes

```text
inventory_batch_id=uuid | default=uuid() | required=yes
product_variation_id=uuid | default= | required=yes | references=product_variations.product_variation_id
source_entity_type=text | default= | required=
source_entity_id=uuid | default= | required=
batch_number=text | default= | required=yes
quantity_received=integer | default=0 | required=yes
quantity_remaining=integer | default=0 | required=yes
expiration_date=date | default= | required=
status=text | default=available | required=yes
created_at=timestamp | default=current_timestamp | required=yes
updated_at=timestamp | default=current_timestamp | required=yes
```

## Example

```text
inventory_batch_id=eb329a6a-7ef4-4a3d-b764-76d79d6e7cc1
product_variation_id=093e4414-a6a7-4a38-92de-51607d2fbb83
source_entity_type=
source_entity_id=
batch_number=BATCH-001
quantity_received=100
quantity_remaining=100
expiration_date=
status=available
created_at=2026-06-17 10:30:00
updated_at=2026-06-17 10:30:00
```
