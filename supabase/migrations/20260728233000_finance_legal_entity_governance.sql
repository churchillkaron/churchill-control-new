begin;

alter table public.legal_entities
  add column if not exists timezone text,
  add column if not exists locale text,
  add column if not exists parent_entity_id uuid,
  add column if not exists is_holding_company boolean not null default false,
  add column if not exists is_default_accounting_entity boolean not null default false,
  add column if not exists is_active boolean not null default true,
  add column if not exists created_by text,
  add column if not exists updated_by text;

update public.legal_entities
set
  code = upper(trim(code)),
  country = upper(trim(country)),
  currency = upper(trim(currency)),
  display_name = nullif(trim(display_name), ''),
  registration_number = nullif(trim(registration_number), ''),
  tax_id = nullif(trim(tax_id), ''),
  address = nullif(trim(address), ''),
  phone = nullif(trim(phone), ''),
  email = nullif(lower(trim(email)), '')
where true;

do $$
begin
  if exists (
    select 1
    from public.legal_entities
    where code is null
       or trim(code) = ''
       or legal_name is null
       or trim(legal_name) = ''
       or country is null
       or country !~ '^[A-Z]{2}$'
       or currency is null
       or currency !~ '^[A-Z]{3}$'
  ) then
    raise exception 'Existing legal entity master data must be completed before governance can be enabled';
  end if;

  if exists (
    select 1
    from public.legal_entities
    group by organization_id, lower(code)
    having count(*) > 1
  ) then
    raise exception 'Duplicate legal entity codes exist inside an organisation';
  end if;

  if exists (
    select 1
    from public.legal_entities
    where registration_number is not null
    group by organization_id, lower(registration_number)
    having count(*) > 1
  ) then
    raise exception 'Duplicate company registration numbers exist inside an organisation';
  end if;

  if exists (
    select 1
    from public.legal_entities
    where tax_id is not null
    group by organization_id, lower(tax_id)
    having count(*) > 1
  ) then
    raise exception 'Duplicate tax registrations exist inside an organisation';
  end if;
end
$$;

with ranked_defaults as (
  select
    id,
    row_number() over (
      partition by organization_id
      order by updated_at desc nulls last, created_at asc nulls last, id
    ) as position
  from public.legal_entities
  where is_default_accounting_entity = true
)
update public.legal_entities entity
set is_default_accounting_entity = false
from ranked_defaults ranked
where entity.id = ranked.id
  and ranked.position > 1;

create unique index if not exists legal_entities_org_code_unique
  on public.legal_entities (organization_id, lower(code));

create unique index if not exists legal_entities_org_registration_unique
  on public.legal_entities (organization_id, lower(registration_number))
  where registration_number is not null;

create unique index if not exists legal_entities_org_tax_unique
  on public.legal_entities (organization_id, lower(tax_id))
  where tax_id is not null;

create unique index if not exists legal_entities_one_default_per_org
  on public.legal_entities (organization_id)
  where is_default_accounting_entity = true;

create index if not exists legal_entities_parent_idx
  on public.legal_entities (organization_id, parent_entity_id)
  where parent_entity_id is not null;

alter table public.legal_entities
  drop constraint if exists legal_entities_parent_entity_fk;

alter table public.legal_entities
  add constraint legal_entities_parent_entity_fk
  foreign key (parent_entity_id)
  references public.legal_entities(id)
  on delete restrict
  not valid;

alter table public.legal_entities
  drop constraint if exists legal_entities_code_format_check,
  drop constraint if exists legal_entities_country_format_check,
  drop constraint if exists legal_entities_currency_format_check,
  drop constraint if exists legal_entities_parent_not_self_check,
  drop constraint if exists legal_entities_default_active_check;

alter table public.legal_entities
  add constraint legal_entities_code_format_check
    check (code ~ '^[A-Z0-9][A-Z0-9._-]{0,31}$') not valid,
  add constraint legal_entities_country_format_check
    check (country ~ '^[A-Z]{2}$') not valid,
  add constraint legal_entities_currency_format_check
    check (currency ~ '^[A-Z]{3}$') not valid,
  add constraint legal_entities_parent_not_self_check
    check (parent_entity_id is null or parent_entity_id <> id) not valid,
  add constraint legal_entities_default_active_check
    check (not is_default_accounting_entity or is_active) not valid;

create or replace function public.finance_legal_entity_default_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.code := upper(trim(new.code));
  new.country := upper(trim(new.country));
  new.currency := upper(trim(new.currency));
  new.legal_name := trim(new.legal_name);
  new.display_name := nullif(trim(new.display_name), '');
  new.registration_number := nullif(trim(new.registration_number), '');
  new.tax_id := nullif(trim(new.tax_id), '');
  new.address := nullif(trim(new.address), '');
  new.phone := nullif(trim(new.phone), '');
  new.email := nullif(lower(trim(new.email)), '');
  new.updated_at := now();

  if new.is_default_accounting_entity then
    update public.legal_entities
    set
      is_default_accounting_entity = false,
      updated_at = now()
    where organization_id = new.organization_id
      and id <> new.id
      and is_default_accounting_entity = true;
  end if;

  return new;
end;
$$;

drop trigger if exists finance_legal_entity_default_guard_trigger
  on public.legal_entities;

create trigger finance_legal_entity_default_guard_trigger
before insert or update on public.legal_entities
for each row
execute function public.finance_legal_entity_default_guard();

commit;
