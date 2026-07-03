-- Restaurant operational orders must not be blocked by finance period locks.
-- Finance period locks belong to payments / journals / payroll / inventory postings,
-- not table movement, guest movement, seat movement, waiter routing, or merge/split operations.

drop trigger if exists prevent_closed_period_orders on public.orders;
drop trigger if exists validate_period_orders on public.orders;

-- Keep financial protection on actual financial tables.
-- Do NOT drop:
-- - prevent_closed_period_payments
-- - validate_period_payments
-- - prevent_closed_period_payroll
-- - validate_period_payroll_records
-- - validate_period_inventory_transactions
