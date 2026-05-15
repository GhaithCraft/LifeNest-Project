ALTER TABLE tasks
  ADD COLUMN completed_at DATETIME NULL AFTER status,
  ADD KEY idx_tasks_user_completed_at (user_id, completed_at);
