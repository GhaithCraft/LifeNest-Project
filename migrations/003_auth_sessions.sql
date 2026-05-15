-- 003_auth_sessions.sql
-- Robust auth: remember-me sessions + login rate limiting

ALTER TABLE users
  ADD COLUMN status ENUM('active','disabled') NOT NULL DEFAULT 'active' AFTER password_hash,
  ADD COLUMN session_version INT UNSIGNED NOT NULL DEFAULT 0 AFTER status,
  ADD COLUMN last_login_at TIMESTAMP NULL DEFAULT NULL AFTER created_at;

CREATE TABLE IF NOT EXISTS user_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  selector CHAR(24) NOT NULL,
  validator_hash CHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP NULL DEFAULT NULL,
  expires_at TIMESTAMP NOT NULL,
  ip VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,
  session_version INT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_user_sessions_selector (selector),
  KEY idx_user_sessions_user (user_id),
  KEY idx_user_sessions_expires (expires_at),
  CONSTRAINT fk_user_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auth_login_attempts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ip VARCHAR(45) NOT NULL,
  email VARCHAR(190) NOT NULL,
  success TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_login_attempts_ip_time (ip, created_at),
  KEY idx_login_attempts_email_time (email, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
