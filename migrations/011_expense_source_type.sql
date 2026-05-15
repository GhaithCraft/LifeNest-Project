ALTER TABLE expenses
  ADD COLUMN source_type ENUM('manual','task_completion') NOT NULL DEFAULT 'manual' AFTER life_area,
  ADD KEY idx_expenses_user_source (user_id, source_type);
