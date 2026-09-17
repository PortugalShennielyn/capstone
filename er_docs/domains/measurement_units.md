# measurement_units

Name: measurement_units
Acronym: MEASUNIT
Description: Stores reusable measurement unit labels such as piece, gram, milliliter, box, and pack. Units are not scoped to products only.

## Attributes

```text
measurement_unit_id=uuid | default=uuid() | required=yes
unit_code=text | default= | required=yes
unit_name=text | default= | required=yes
unit_type=text | default= | required=
is_active=boolean | default=1 | required=yes
created_at=timestamp | default=current_timestamp | required=yes
```

## Example

```text
measurement_unit_id=0ec5d5c5-8df4-47fa-9806-58168d35e80d
unit_code=g
unit_name=gram
unit_type=weight
is_active=1
created_at=2026-06-17 10:30:00
```
