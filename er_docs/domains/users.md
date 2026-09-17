# users

Name: users
Acronym: USR
Description: Stores user identities, credentials, roles, and account status.

## Attributes

```text
user_id=uuid | default=uuid() | required=yes
username=text | default= | required=yes
password_hash=text | default= | required=yes
full_name=text | default= | required=yes
role_code=text | default= | required=yes
status=text | default=active | required=yes
created_at=timestamp | default=current_timestamp | required=yes
updated_at=timestamp | default=current_timestamp | required=yes
```

## Example

```text
user_id=9f247ab6-3f4c-409f-8f5c-71a2f6f4d52d
username=admin_user
password_hash=$2y$10$example_hash_only
full_name=Admin User
role_code=admin
status=active
created_at=2026-06-17 10:30:00
updated_at=2026-06-17 10:30:00
```
