begin;

alter table public.finance_customer_unapplied_cash
  drop constraint if exists finance_customer_unapplied_cash_status_check;

alter table public.finance_customer_unapplied_cash
  add constraint finance_customer_unapplied_cash_status_check
  check (upper(status) = any (array[
    'OPEN'::text,
    'PARTIALLY_APPLIED'::text,
    'PARTIALLY_REFUNDED'::text,
    'PARTIALLY_APPLIED_AND_REFUNDED'::text,
    'APPLIED'::text,
    'REFUNDED'::text,
    'APPLIED_AND_REFUNDED'::text
  ]));

create or replace function public.finance_customer_unapplied_cash_status(
  p_original_amount numeric,
  p_available_amount numeric,
  p_refunded_amount numeric
)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when greatest(coalesce(p_available_amount,0),0) > 0.005
         and greatest(coalesce(p_original_amount,0)-coalesce(p_available_amount,0)-coalesce(p_refunded_amount,0),0) > 0.005
         and greatest(coalesce(p_refunded_amount,0),0) > 0.005
      then 'PARTIALLY_APPLIED_AND_REFUNDED'
    when greatest(coalesce(p_available_amount,0),0) > 0.005
         and greatest(coalesce(p_original_amount,0)-coalesce(p_available_amount,0)-coalesce(p_refunded_amount,0),0) > 0.005
      then 'PARTIALLY_APPLIED'
    when greatest(coalesce(p_available_amount,0),0) > 0.005
         and greatest(coalesce(p_refunded_amount,0),0) > 0.005
      then 'PARTIALLY_REFUNDED'
    when greatest(coalesce(p_available_amount,0),0) > 0.005
      then 'OPEN'
    when greatest(coalesce(p_original_amount,0)-coalesce(p_available_amount,0)-coalesce(p_refunded_amount,0),0) > 0.005
         and greatest(coalesce(p_refunded_amount,0),0) > 0.005
      then 'APPLIED_AND_REFUNDED'
    when greatest(coalesce(p_refunded_amount,0),0) + 0.005 >= greatest(coalesce(p_original_amount,0),0)
      then 'REFUNDED'
    else 'APPLIED'
  end;
$$;

revoke all on function public.finance_customer_unapplied_cash_status(numeric,numeric,numeric) from public, anon, authenticated;
grant execute on function public.finance_customer_unapplied_cash_status(numeric,numeric,numeric) to service_role;

commit;
