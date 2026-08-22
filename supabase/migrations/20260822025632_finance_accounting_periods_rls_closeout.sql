-- Finance accounting periods are server-managed through authenticated Finance APIs.
alter table if exists public.accounting_periods enable row level security;
