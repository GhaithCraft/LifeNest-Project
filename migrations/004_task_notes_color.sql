ALTER TABLE task_notes
  ADD COLUMN color ENUM('blue','mint','yellow','pink','gray') NOT NULL DEFAULT 'blue' AFTER body;
