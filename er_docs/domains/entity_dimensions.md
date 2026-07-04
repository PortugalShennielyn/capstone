# entity_dimensions

Name: entity_dimensions
Acronym: ENTDIM
Description: Stores polymorphic dimensional and measurement attributes for any entity. Product sizes, strengths, weights, volumes, package contents, and physical dimensions belong here instead of products or product_variations.

## Attributes

```text
entity_dimension_id=uuid | default=uuid() | required=yes
entity_type=text | default= | required=yes
entity_id=uuid | default= | required=yes
dimension_code=text | default= | required=yes
dimension_name=text | default= | required=yes
numeric_value=number | default= | required=
text_value=text | default= | required=
measurement_unit_id=uuid | default= | required= | references=measurement_units.measurement_unit_id
sort_order=integer | default=0 | required=yes
created_at=timestamp | default=current_timestamp | required=yes
```

## Example

```text
entity_dimension_id=9578ba3f-87ab-48b8-ac47-df69c5699f41
entity_type=product_variations
entity_id=093e4414-a6a7-4a38-92de-51607d2fbb83
dimension_code=net_weight
dimension_name=Net Weight
numeric_value=500.00
text_value=
measurement_unit_id=0ec5d5c5-8df4-47fa-9806-58168d35e80d
sort_order=1
created_at=2026-06-17 10:30:00
```
