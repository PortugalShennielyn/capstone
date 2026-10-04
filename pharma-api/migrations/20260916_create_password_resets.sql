-- Password reset verification codes
CREATE TABLE IF NOT EXISTS `password_resets` (
  `reset_id`     char(36)     NOT NULL DEFAULT uuid(),
  `user_id`      char(36)     NOT NULL,
  `email`        varchar(255) NOT NULL,
  `code_hash`    varchar(255) NOT NULL,
  `attempts`     tinyint(1)   NOT NULL DEFAULT 0,
  `expires_at`   datetime     NOT NULL,
  `used_at`      datetime     DEFAULT NULL,
  `created_at`   timestamp    NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`reset_id`),
  KEY `idx_pr_user`   (`user_id`),
  KEY `idx_pr_email`  (`email`),
  KEY `idx_pr_expiry` (`expires_at`),
  CONSTRAINT `fk_pr_user` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;