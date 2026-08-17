-- MariaDB 10.4: normalized per-package physical-damage breakdown.

CREATE TABLE supplier_claim_damage_lines (
    damage_line_id CHAR(36) NOT NULL DEFAULT (UUID()),
    claim_id CHAR(36) NOT NULL,
    sequence_no INT NOT NULL,
    affected_unit_conversion_id CHAR(36) NOT NULL,
    damaged_quantity INT NOT NULL,
    damaged_unit_conversion_id CHAR(36) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (damage_line_id),
    UNIQUE KEY uq_supplier_claim_damage_sequence (claim_id, sequence_no),
    KEY idx_claim_damage_affected_conversion (affected_unit_conversion_id),
    KEY idx_claim_damage_damaged_conversion (damaged_unit_conversion_id),
    CONSTRAINT fk_claim_damage_claim
        FOREIGN KEY (claim_id) REFERENCES supplier_claims (claim_id) ON DELETE CASCADE,
    CONSTRAINT fk_claim_damage_affected_conversion
        FOREIGN KEY (affected_unit_conversion_id) REFERENCES supplier_product_unit_conversions (conversion_id),
    CONSTRAINT fk_claim_damage_damaged_conversion
        FOREIGN KEY (damaged_unit_conversion_id) REFERENCES supplier_product_unit_conversions (conversion_id),
    CONSTRAINT chk_claim_damage_sequence CHECK (sequence_no > 0),
    CONSTRAINT chk_claim_damage_quantity CHECK (damaged_quantity > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
