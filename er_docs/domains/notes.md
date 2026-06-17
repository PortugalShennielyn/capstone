# notes

Name: notes
Acronym: NTE
Description: Stores polymorphic notes that can be attached to any supported entity without assuming where that entity is used.

## Attributes

```text
note_id=uuid | default=uuid() | required=yes
entity_type=text | default= | required=yes
entity_id=uuid | default= | required=yes
note_body=text | default= | required=yes
created_by_id=uuid | default= | required= | references=users.user_id
created_at=timestamp | default=current_timestamp | required=yes
```

## Example

```text
note_id=b3a795b8-04c0-4c3d-845c-a7864fa09499
entity_type=products
entity_id=8d5f1b91-0d8c-4b64-8d21-0a1e9475f020
note_body=Keep this note scoped to the referenced entity only.
created_by_id=9f247ab6-3f4c-409f-8f5c-71a2f6f4d52d
created_at=2026-06-17 10:30:00
```
