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
  end if;

  select
    round(coalesce(sum(coalesce(o.total_amount, o.total, 0)), 0)::numeric, 2),
    round(coalesce(sum(coalesce(o.amount_paid, 0)), 0)::numeric, 2),
    round(coalesce(sum(coalesce(o.vat_amount, 0)), 0)::numeric, 2),
    round(coalesce(sum(coalesce(o.service_charge_amount, 0)), 0)::numeric, 2),
    round(coalesce(sum(coalesce(o.discount_amount, 0)), 0)::numeric, 2),
    count(*) filter (
      where greatest(
        0,
        coalesce(
          o.remaining_balance,
          coalesce(o.total_amount, o.total, 0) - coalesce(o.amount_paid, 0)
        )
      ) > 0.01
    )
  into
    v_total,
    v_paid,
    v_vat,
    v_service,
    v_discount,
    v_unpaid
  from public.orders o
  where o.organization_id = new.organization_id
    and o.session_id = new.session_id
    and upper(coalesce(o.status, '')) not in ('CANCELLED', 'VOID');

  select count(distinct upper(btrim(o.payment_method)))
  into v_method_count
  from public.orders o
  where o.organization_id = new.organization_id
    and o.session_id = new.session_id
    and coalesce(o.amount_paid, 0) > 0
    and nullif(btrim(coalesce(o.payment_method, '')), '') is not null
    and upper(coalesce(o.status, '')) not in ('CANCELLED', 'VOID');

  if v_method_count = 1 then
    select max(upper(btrim(o.payment_method)))
    into v_method
    from public.orders o
    where o.organization_id = new.organization_id
      and o.session_id = new.session_id
      and coalesce(o.amount_paid, 0) > 0
      and nullif(btrim(coalesce(o.payment_method, '')), '') is not null
      and upper(coalesce(o.status, '')) not in ('CANCELLED', 'VOID');
  elsif v_method_count > 1 then
    v_method := 'MIXED';
  else
    v_method := null;
  end if;

  update public.table_sessions s
  set final_total = v_total,
      paid_amount = v_paid,
      revenue = v_total,
      vat_amount = v_vat,
      service_charge_amount = v_service,
      discount_amount = v_discount,
      payment_method = coalesce(v_method, s.payment_method),
      paid_at = case
        when v_total > 0 and v_unpaid = 0 and v_paid + 0.01 >= v_total
          then coalesce(s.paid_at, new.paid_at, now())
        else s.paid_at
      end,
      updated_at = now()
  where s.organization_id = new.organization_id
    and s.id = new.session_id;

  return new;
end;
$$;

revoke all on function public.sync_restaurant_session_financial_summary() from public;
revoke all on function public.sync_restaurant_session_financial_summary() from anon;
revoke all on function public.sync_restaurant_session_financial_summary() from authenticated;

DROP TRIGGER IF EXISTS trg_sync_restaurant_session_financial_summary ON public.orders;
create trigger trg_sync_restaurant_session_financial_summary
after insert or update of
  total,
  total_amount,
  amount_paid,
  remaining_balance,
  payment_status,
  payment_method,
  paid_at,
  vat_amount,
  service_charge_amount,
  discount_amount,
  status
on public.orders
for each row
execute function public.sync_restaurant_session_financial_summary();

commit;
