begin;

create or replace function public.finance_set_customer_unapplied_cash_status()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.status := public.finance_customer_unapplied_cash_status(
    new.original_amount,
    new.available_amount,
    new.refunded_amount
  );
  return new;
end;
$$;

drop trigger if exists finance_customer_unapplied_cash_status_derive
on public.finance_customer_unapplied_cash;

create trigger finance_customer_unapplied_cash_status_derive
before insert or update of original_amount, available_amount, refunded_amount
on public.finance_customer_unapplied_cash
for each row
execute function public.finance_set_customer_unapplied_cash_status();

revoke all on function public.finance_set_customer_unapplied_cash_status() from public, anon, authenticated;
grant execute on function public.finance_set_customer_unapplied_cash_status() to service_role;

commit;
