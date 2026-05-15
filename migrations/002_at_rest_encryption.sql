-- 002_at_rest_encryption.sql
-- Expand columns to safely store encrypted payloads (enc:base64...).
-- (We keep metadata columns plaintext for filtering/sorting.)

ALTER TABLE tasks MODIFY title TEXT NOT NULL;

ALTER TABLE study_items MODIFY title TEXT NOT NULL;

ALTER TABLE task_notes MODIFY body MEDIUMTEXT NOT NULL;

ALTER TABLE expenses
  MODIFY amount_cents VARCHAR(255) NOT NULL,
  MODIFY category TEXT NOT NULL,
  MODIFY note TEXT NULL;

ALTER TABLE budgets
  MODIFY amount_cents VARCHAR(255) NOT NULL;
