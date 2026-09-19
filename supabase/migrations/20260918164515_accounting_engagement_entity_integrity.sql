begin;

create or replace function public.validate_accounting_engagement_entity_binding()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and old.entity_id is not null
     and new.entity_id is distinct from old.entity_id then
    raise exception 'ENGAGEMENT_ENTITY_IMMUTABLE';
  end if;

  if new.entity_id is not null and not exists (
    select 1
    from public.legal_entities le
    where le.id = new.entity_id
      and le.organization_id = new.organization_id
      and coalesce(le.is_active, true) = true
  ) then
    raise exception 'ENGAGEMENT_ENTITY_SCOPE_MISMATCH';
  end if;

  return new;
end;
$$;

drop trigger if exists accounting_engagement_entity_binding_guard
  on public.accounting_engagements;

create trigger accounting_engagement_entity_binding_guard
before insert or update of organization_id, entity_id
on public.accounting_engagements
for each row
execute function public.validate_accounting_engagement_entity_binding();

revoke all on function public.validate_accounting_engagement_entity_binding()
  from public, anon, authenticated;
grant execute on function public.validate_accounting_engagement_entity_binding()
  to service_role;

create or replace function public.validate_accounting_engagement_run_scope()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_engagement public.accounting_engagements%rowtype;
begin
  select * into v_engagement
  from public.accounting_engagements
  where id = new.engagement_id
    and accounting_firm_id = new.accounting_firm_id
    and organization_id = new.organization_id
    and status = 'ACTIVE';

  if not found then
    raise exception 'ENGAGEMENT_SCOPE_MISMATCH';
  end if;

  if v_engagement.entity_id is null then
    raise exception 'ENGAGEMENT_ENTITY_REQUIRED';
  end if;

  if new.entity_id is null then
    raise exception 'RUN_ENTITY_REQUIRED';
  end if;

  if new.entity_id is distinct from v_engagement.entity_id then
    raise exception 'RUN_ENTITY_ENGAGEMENT_MISMATCH';
  end if;

  if not exists (
    select 1
    from public.legal_entities le
    where le.id = new.entity_id
      and le.organization_id = new.organization_id
      and coalesce(le.is_active, true) = true
  ) then
    raise exception 'RUN_ENTITY_INACTIVE_OR_OUT_OF_SCOPE';
  end if;

  if new.period_id is null then
    raise exception 'RUN_PERIOD_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.accounting_periods p
    where p.id = new.period_id
      and p.organization_id = new.organization_id
      and p.entity_id = new.entity_id
  ) then
    raise exception 'RUN_PERIOD_SCOPE_MISMATCH';
  end if;

  return new;
end;
$$;

drop trigger if exists accounting_engagement_run_scope_guard
  on public.accounting_engagement_runs;

create trigger accounting_engagement_run_scope_guard
before insert or update of accounting_firm_id, organization_id, entity_id, engagement_id, period_id
on public.accounting_engagement_runs
for each row
execute function public.validate_accounting_engagement_run_scope();

revoke all on function public.validate_accounting_engagement_run_scope()
  from public, anon, authenticated;
grant execute on function public.validate_accounting_engagement_run_scope()
  to service_role;

commit;
