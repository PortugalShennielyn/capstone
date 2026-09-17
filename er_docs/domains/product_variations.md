# product_variations

Name: product_variations
Acronym: PRDVAR
Description: Stores sellable variations of a product. Variation identity, barcode, sku, and sale status belong here; dimensions and measurements belong in entity_dimensions.

## Attributes

```text
product_variation_id=uuid | default=uuid() | required=yes
product_id=uuid | default= | required=yes | references=products.product_id
variation_name=text | default= | required=
sku=text | default= | required=
barcode=text | default= | required=
unit_price=number | default=0.00 | required=yes
currency=text | default=PHP | required=yes
is_default=boolean | default=0 | required=yes
status=text | default=active | required=yes
created_at=timestamp | default=current_timestamp | required=yes
updated_at=timestamp | default=current_timestamp | required=yes
```

## Example

```text
product_variation_id=093e4414-a6a7-4a38-92de-51607d2fbb83
product_id=8d5f1b91-0d8c-4b64-8d21-0a1e9475f020
variation_name=
sku=
barcode=
unit_price=100.00
currency=PHP
is_default=1
status=active
created_at=2026-06-17 10:30:00
updated_at=2026-06-17 10:30:00
```
