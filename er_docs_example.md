# ER Docs Example Layout

This file is only a format sample. After approval, the real docs will be created under `er_docs/` and `er_docs/domains/`.

Naming rules used in this example:

- Table names are plural.
- Table names and attributes use snake_case, for example `first_name`.
- IDs are UUID strings.
- Attribute lines use this format:

```text
attribute_name=format | default=default_value | required=yes_or_blank
```

If an attribute is nullable, `required=` is left blank.

## Index Entry Example

```text
Name: products
Acronym: PRD
Description: Stores the core identity of sellable product records. Product-specific dimensions, measurements, stock, and variation details should live in related tables.
```

## Domain File Example: products

```text
# products

Name: products
Acronym: PRD
Description: Stores the core identity of sellable product records. This table should only contain attributes needed for a product to exist.

## Attributes

product_id=uuid | default=uuid() | required=yes
category_id=uuid | default= | required=
type_id=uuid | default= | required=yes
brand_name=text | default= | required=yes
product_name=text | default= | required=yes
generic_name=text | default= | required=
image_url=text | default= | required=
created_at=timestamp | default=current_timestamp | required=yes

## Example

product_id=9f1b1fb2-78a4-4d64-b37b-2d80f15f3f11
category_id=0e8f8946-54da-4ed2-b2ff-9b50362c76c8
type_id=60b12b2c-0501-4cdd-9f7d-45c45e1f4a61
brand_name=Sample Brand
product_name=Sample Product
generic_name=
image_url=
created_at=2026-06-16 10:30:00
```

## Domain File Example: users

```text
# users

Name: users
Acronym: USR
Description: Stores application user identities and access metadata.

## Attributes

user_id=uuid | default=uuid() | required=yes
username=text | default= | required=yes
password=text | default= | required=yes
full_name=text | default= | required=yes
role=text | default= | required=yes
status=text | default=Active | required=
created_at=timestamp | default=current_timestamp | required=yes

## Example

user_id=5a945d8f-e2b8-41c6-b4ac-6d70c53e3992
username=admin_user
password=$2y$10$example_hash_only
full_name=Admin User
role=Admin
status=Active
created_at=2026-06-16 10:30:00
```

## Domain File Example: notes

```text
# notes

Name: notes
Acronym: NTE
Description: Stores polymorphic notes that can be attached to any supported entity without assuming where that entity belongs in the application.

## Attributes

note_id=uuid | default=uuid() | required=yes
entity_type=text | default= | required=yes
entity_id=uuid | default= | required=yes
note_body=text | default= | required=yes
created_by_id=uuid | default= | required=
created_at=timestamp | default=current_timestamp | required=yes

## Example

note_id=7cb85a93-d2ec-4c10-949f-9e67202a1f0a
entity_type=products
entity_id=9f1b1fb2-78a4-4d64-b37b-2d80f15f3f11
note_body=Keep this note scoped to the referenced entity only.
created_by_id=5a945d8f-e2b8-41c6-b4ac-6d70c53e3992
created_at=2026-06-16 10:30:00
```
