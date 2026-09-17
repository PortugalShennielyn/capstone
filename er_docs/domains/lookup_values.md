# lookup_values

Name: lookup_values
Acronym: LKPVAL
Description: Stores reusable lookup options. Application-specific labels should be rows here rather than hard-coded enum columns where flexibility is needed.

## Attributes

```text
lookup_value_id=uuid | default=uuid() | required=yes
lookup_type=text | default= | required=yes
lookup_code=text | default= | required=yes
lookup_label=text | default= | required=yes
sort_order=integer | default=0 | required=yes
is_active=boolean | default=1 | required=yes
created_at=timestamp | default=current_timestamp | required=yes
```

## Example

```text
lookup_value_id=2b48c7d4-bb11-41cf-a70d-2e6d99777551
lookup_type=purchase_order_status
lookup_code=pending
lookup_label=Pending
sort_order=1
is_active=1
created_at=2026-06-17 10:30:00
```
