# product_categories

Name: product_categories
Acronym: PRDCAT
Description: Stores broad product classification labels. Categories are reusable lookup records and must not contain product-specific attributes.

## Attributes

```text
product_category_id=uuid | default=uuid() | required=yes
category_code=text | default= | required=yes
category_name=text | default= | required=yes
description=text | default= | required=
is_active=boolean | default=1 | required=yes
created_at=timestamp | default=current_timestamp | required=yes
```

## Example

```text
product_category_id=2b8da7f0-d6fd-4231-bad7-e25586e31af1
category_code=general_goods
category_name=General Goods
description=
is_active=1
created_at=2026-06-17 10:30:00
```
