CREATE TABLE IF NOT EXISTS task_activity_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  task_id BIGINT UNSIGNED NOT NULL,
  action ENUM('started','completed','postponed') NOT NULL,
  happened_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_task_activity_user_time (user_id, happened_at),
  KEY idx_task_activity_task_time (task_id, happened_at),
  CONSTRAINT fk_task_activity_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
