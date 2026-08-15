begin;

create or replace function public.resolve_payment_entity_scope_before_period()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_entity_id uuid;
begin
  if new.entity_id is not null then
    return new;
  end if;

  if new.organization_id is null then
    return new;
  end if;

  if new.session_id is not null then
    select s.entity_id
    into v_entity_id
    from public.table_sessions s
    where s.organization_id = new.organization_id
      and s.id = new.session_id
    limit 1;
  end if;

  if v_entity_id is null and new.order_id is not null then
    select o.entity_id
    into v_entity_id
    from public.orders o
    where o.organization_id = new.organization_id
      and o.id = new.order_id
    limit 1;
  end if;

  if v_entity_id is not null then
    perform 1
    from public.legal_entities le
    where le.id = v_entity_id
      and le.organization_id = new.organization_id
      and le.is_active = true;

    if not found then
      raise exception 'Payment source resolves to an inactive or foreign legal entity';
    end if;

    new.entity_id := v_entity_id;
  end if;

  return new;
end;
$$;

drop trigger if exists "00_payments_scope_entity" on public.payments;

create trigger "00_payments_scope_entity"
before insert or update of organization_id, entity_id, order_id, session_id
on public.payments
for each row
execute function public.resolve_payment_entity_scope_before_period();

commit;
