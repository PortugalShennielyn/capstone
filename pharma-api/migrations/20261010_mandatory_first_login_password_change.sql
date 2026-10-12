-- Existing accounts retain their current login behavior. New accounts created
-- through the admin user-management endpoint explicitly set this flag to 1.
ALTER TABLE users
    ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0 AFTER password_hash;
