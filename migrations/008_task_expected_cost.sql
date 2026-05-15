ALTER TABLE tasks
  ADD COLUMN expected_cost_cents VARCHAR(255) NULL AFTER duration_minutes,
  ADD COLUMN expected_cost_currency CHAR(3) NULL AFTER expected_cost_cents,
  ADD KEY idx_tasks_user_expected_currency (user_id, expected_cost_currency);
