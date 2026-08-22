-- Finance close-out: accounting_periods is the canonical Finance period source.
-- Finance reads it only through authenticated server routes/service-role code,
-- so enabling RLS closes direct PostgREST exposure without changing business data.

begin;

alter table if exists public.accounting_periods
  enable row level security;

notify pgrst, 'reload schema';

commit;
