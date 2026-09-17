CREATE TABLE IF NOT EXISTS password_reset_tokens (
    password_reset_token_id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    token_hash CHAR(64) NOT NULL,
    expires_at DATETIME NOT NULL,
    used_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (password_reset_token_id),
    UNIQUE KEY uq_password_reset_token_hash (token_hash),
    KEY idx_password_reset_user (user_id),
    KEY idx_password_reset_expiry (expires_at),
    CONSTRAINT fk_password_reset_user FOREIGN KEY (user_id) REFERENCES users(user_id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
