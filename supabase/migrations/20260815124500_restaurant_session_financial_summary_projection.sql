begin;

create or replace function public.sync_restaurant_session_financial_summary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total numeric(18,2) := 0;
  v_paid numeric(18,2) := 0;
  v_vat numeric(18,2) := 0;
  v_service numeric(18,2) := 0;
  v_discount numeric(18,2) := 0;
  v_unpaid integer := 0;
  v_method_count integer := 0;
  v_method text;
begin
  if new.session_id is null then
    return new;
  end if