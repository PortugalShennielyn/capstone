ALTER TABLE system_settings
    ADD COLUMN pr_quantity_limit INT NOT NULL DEFAULT 50 AFTER po_approved_role;
