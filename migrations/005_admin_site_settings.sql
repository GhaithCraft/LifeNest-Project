ALTER TABLE users
  ADD COLUMN role ENUM('user','admin') NOT NULL DEFAULT 'user' AFTER status;

UPDATE users
SET role = 'admin'
ORDER BY id ASC
LIMIT 1;

CREATE TABLE IF NOT EXISTS site_settings (
  setting_key VARCHAR(100) NOT NULL,
  setting_value MEDIUMTEXT NULL,
  updated_by BIGINT UNSIGNED NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_key),
  KEY idx_site_settings_updated_by (updated_by),
  CONSTRAINT fk_site_settings_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
