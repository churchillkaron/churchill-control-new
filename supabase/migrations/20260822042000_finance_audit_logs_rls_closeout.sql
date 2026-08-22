-- Finance close-out: audit_logs backs the Finance Audit Trail endpoint.
-- The endpoint is organization-scoped and permission-checked server-side.

begin;

alter table if exists public.audit_logs
  enable row level security;

notify pgrst, 'reload schema';

commit;
