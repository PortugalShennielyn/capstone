# supplier_products

Name: supplier_products
Acronym: SUPPRD
Description: Stores product assignments to suppliers. This is a relationship table and should not duplicate product attributes or supplier attributes.

## Attributes

```text
supplier_product_id=uuid | default=uuid() | required=yes
supplier_id=uuid | default= | required=yes | references=suppliers.supplier_id
product_id=uuid | default= | required=yes | references=products.product_id
supplier_sku=text | default= | required=
status=text | default=active | required=yes
created_at=timestamp | default=current_timestamp | required=yes
```

## Example

```text
supplier_product_id=99e4262f-203d-4a22-91a0-11cdf1f86819
supplier_id=0624ad74-749a-4aa9-b495-7dca3a6da5a3
product_id=8d5f1b91-0d8c-4b64-8d21-0a1e9475f020
supplier_sku=
status=active
created_at=2026-06-17 10:30:00
```
