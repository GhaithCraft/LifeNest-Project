ALTER TABLE users
  ADD COLUMN full_name VARCHAR(120) NULL AFTER email,
  ADD COLUMN avatar_path VARCHAR(255) NULL AFTER full_name;
