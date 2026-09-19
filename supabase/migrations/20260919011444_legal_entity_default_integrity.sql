begin;

create or replace function public.normalize_legal_entity_default()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.is_default_accounting_entity = true
     and coalesce(new.is_active, true) = false then
    raise exception 'DEFAULT_ACCOUNTING_ENTITY_MUST_BE_ACTIVE';
  end if;

  if coalesce(new.is_active, true) = true
     and coalesce(new.is_default_accounting_entity, false) = false
     and not exists (
       select 1
       from public.legal_entities le
       where le.organization_id = new.organization_id
         and coalesce(le.is_active, true) = true
         and (tg_op = 'INSERT' or le.id <> new.id)
     ) then
    new.is_default_accounting_entity := true;
  end if;

  if new.is_default_accounting_entity = true then
    update public.legal_entities le
    set is_default_accounting_entity = false,
        updated_at = now()
    where le.organization_id = new.organization_id
      and le.is_default_accounting_entity = true
      and (tg_op = 'INSERT' or le.id <> new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists legal_entity_default_normalization_guard
  on public.legal_entities;

create trigger legal_entity_default_normalization_guard
before insert or update of organization_id, is_active, is_default_accounting_entity
on public.legal_entities
for each row
execute function public.normalize_legal_entity_default();

create unique index if not exists legal_entities_one_default_per_organization
  on public.legal_entities (organization_id)
  where is_default_accounting_entity = true;

revoke all on function public.normalize_legal_entity_default()
  from public, anon, authenticated;
grant execute on function public.normalize_legal_entity_default()
  to service_role;

commit;
