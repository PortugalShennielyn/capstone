# products

Name: products
Acronym: PRD
Description: Stores the core identity of a sellable or trackable product. This table must not store dimensions, units, prices, supplier ownership, or stock quantities.

## Attributes

```text
product_id=uuid | default=uuid() | required=yes
product_category_id=uuid | default= | required= | references=product_categories.product_category_id
product_type_id=uuid | default= | required= | references=product_types.product_type_id
brand_name=text | default= | required=yes
product_name=text | default= | required=yes
display_name=text | default= | required=
description=text | default= | required=
image_url=text | default= | required=
status=text | default=active | required=yes
created_at=timestamp | default=current_timestamp | required=yes
updated_at=timestamp | default=current_timestamp | required=yes
```

## Example

```text
product_id=8d5f1b91-0d8c-4b64-8d21-0a1e9475f020
product_category_id=2b8da7f0-d6fd-4231-bad7-e25586e31af1
product_type_id=55ea5819-049d-46fd-9646-243c73ecf2c7
brand_name=Sample Brand
product_name=Sample Product
display_name=
description=
image_url=
status=active
created_at=2026-06-17 10:30:00
updated_at=2026-06-17 10:30:00
```
