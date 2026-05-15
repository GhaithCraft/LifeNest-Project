ALTER TABLE expenses
  ADD COLUMN linked_task_id BIGINT UNSIGNED NULL AFTER note,
  ADD COLUMN life_area ENUM('general','personal','study') NOT NULL DEFAULT 'general' AFTER linked_task_id,
  ADD KEY idx_expenses_user_task (user_id, linked_task_id),
  ADD CONSTRAINT fk_expenses_linked_task FOREIGN KEY (linked_task_id) REFERENCES tasks(id) ON DELETE SET NULL;
