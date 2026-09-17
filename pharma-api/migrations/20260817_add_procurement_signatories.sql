ALTER TABLE system_settings
    ADD COLUMN IF NOT EXISTS pr_prepared_name VARCHAR(150) NULL AFTER grn_approved_by_name,
    ADD COLUMN IF NOT EXISTS pr_prepared_role VARCHAR(100) NOT NULL DEFAULT 'Manager' AFTER pr_prepared_name,
    ADD COLUMN IF NOT EXISTS pr_reviewed_name VARCHAR(150) NULL AFTER pr_prepared_role,
    ADD COLUMN IF NOT EXISTS pr_reviewed_role VARCHAR(100) NOT NULL DEFAULT 'Supervisor' AFTER pr_reviewed_name,
    ADD COLUMN IF NOT EXISTS po_prepared_name VARCHAR(150) NULL AFTER pr_reviewed_role,
    ADD COLUMN IF NOT EXISTS po_prepared_role VARCHAR(100) NOT NULL DEFAULT 'Manager' AFTER po_prepared_name,
    ADD COLUMN IF NOT EXISTS po_approved_name VARCHAR(150) NULL AFTER po_prepared_role,
    ADD COLUMN IF NOT EXISTS po_approved_role VARCHAR(100) NOT NULL DEFAULT 'Supervisor' AFTER po_approved_name;

-- Remove the earlier, incorrect person-name settings. Signature lines stay blank;
-- only the professional role beneath each line is configurable.
ALTER TABLE system_settings
    DROP COLUMN IF EXISTS pr_prepared_by_name,
    DROP COLUMN IF EXISTS pr_reviewed_by_name,
    DROP COLUMN IF EXISTS po_prepared_by_name,
    DROP COLUMN IF EXISTS po_approved_by_name;
