# suppliers

Name: suppliers
Acronym: SUP
Description: Stores supplier identity and contact information. Supplier-product relationships belong in supplier_products.

## Attributes

```text
supplier_id=uuid | default=uuid() | required=yes
supplier_name=text | default= | required=yes
contact_name=text | default= | required=
phone=text | default= | required=
email=text | default= | required=
address=text | default= | required=
status=text | default=active | required=yes
created_at=timestamp | default=current_timestamp | required=yes
archived_at=timestamp | default= | required=
```

## Example

```text
supplier_id=0624ad74-749a-4aa9-b495-7dca3a6da5a3
supplier_name=Sample Supplier
contact_name=
phone=
email=
address=
status=active
created_at=2026-06-17 10:30:00
archived_at=
```
