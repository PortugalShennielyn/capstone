# product_types

Name: product_types
Acronym: PRDTYP
Description: Stores product type labels scoped to a category. Type records describe classification only and must not store dimensions or pricing.

## Attributes

```text
product_type_id=uuid | default=uuid() | required=yes
product_category_id=uuid | default= | required= | references=product_categories.product_category_id
type_code=text | default= | required=yes
type_name=text | default= | required=yes
description=text | default= | required=
is_active=boolean | default=1 | required=yes
created_at=timestamp | default=current_timestamp | required=yes
```

## Example

```text
product_type_id=55ea5819-049d-46fd-9646-243c73ecf2c7
product_category_id=2b8da7f0-d6fd-4231-bad7-e25586e31af1
type_code=standard_item
type_name=Standard Item
description=
is_active=1
created_at=2026-06-17 10:30:00
```
