-- Force LifeNest financial records to Turkish Lira only.
UPDATE budgets SET currency = 'TRY' WHERE currency <> 'TRY';
UPDATE expenses SET currency = 'TRY' WHERE currency <> 'TRY';
UPDATE tasks SET expected_cost_currency = 'TRY' WHERE expected_cost_currency IS NOT NULL AND expected_cost_currency <> 'TRY';
