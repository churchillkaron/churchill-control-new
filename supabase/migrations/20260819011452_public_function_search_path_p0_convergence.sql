-- P0 database hardening: pin search_path for public functions flagged by the
-- Supabase security advisor. This changes only function execution context;
-- signatures and business logic remain unchanged.

begin;

alter function public.set_updated_at() set search_path = public, pg_temp;
alter function public.match_vector_memory(vector, uuid, integer) set search_path = public, pg_temp;
alter function public.get_default_accounting_entity(uuid) set search_path = public, pg_temp;
alter function public.validate_period_open() set search_path = public, pg_temp;
alter function public.prevent_changes_in_closed_period() set search_path = public, pg_temp;
alter function public.finance_touch_updated_at() set search_path = public, pg_temp;
alter function public.inventory_signed_quantity(text, numeric) set search_path = public, pg_temp;
alter function public.operations_lifecycle_initial_status(text) set search_path = public, pg_temp;
alter function public.operations_lifecycle_target_status(text, text, text) set search_path = public, pg_temp;

commit;
