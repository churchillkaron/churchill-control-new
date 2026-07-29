begin;

alter table public.legal_entities
  add column if not exists timezone text,
  add column if not exists locale text,
  add column if not exists parent_entity_id uuid,
  add column if not exists is_holding_company boolean not null default false,
  add column if not exists is_default_accounting_entity boolean not null default false,
  add column if not exists is_active boolean not null default true,
  add column if not exists created_by text,
  add column if not exists updated_by text,
  add column if not exists governance_review_required boolean not null default false,
  add column if not exists governance_review_reasons jsonb not null default '[]'::jsonb,
  add column if not exists governance_legacy_values jsonb not null default '{}'::jsonb;

update public.legal_entities
set governance_legacy_values = coalesce(governance_legacy_values, '{}'::jsonb) || jsonb_strip_nulls(
  jsonb_build_object(
    'code', case
      when nullif(btrim(code), '') is not null
       and upper(btrim(code)) !~ '^[A-Z0-9][A-Z0-9._-]{0,31}$'
      then code
      else null
    end,
    'country', case
      when nullif(btrim(country), '') is not null
       and upper(btrim(country)) !~ '^[A-Z]{2}$'
      then country
      else null
    end,
    'currency', case
      when nullif(btrim(currency), '') is not null
       and upper(btrim(currency)) !~ '^[A-Z]{3}$'
      then currency
      else null
    end
  )
)
where true;

update public.legal_entities
set
  code = case
    when upper(nullif(btrim(code), '')) ~ '^[A-Z0-9][A-Z0-9._-]{0,31}$'
    then upper(nullif(btrim(code), ''))
    else null
  end,
  legal_name = nullif(btrim(legal_name), ''),
  country = case
    when upper(nullif(btrim(country), '')) ~ '^[A-Z]{2}$'
    then upper(nullif(btrim(country), ''))
    else null
  end,
  currency = case
    when upper(nullif(btrim(currency), '')) ~ '^[A-Z]{3}$'
    then upper(nullif(btrim(currency), ''))
    else null
  end,
  display_name = nullif(btrim(display_name), ''),
  registration_number = nullif(btrim(registration_number), ''),
  tax_id = nullif(btrim(tax_id), ''),
  address = nullif(btrim(address), ''),
  phone = nullif(btrim(phone), ''),
  email = nullif(lower(btrim(email)), ''),
  timezone = nullif(btrim(timezone), ''),
  locale = nullif(btrim(locale), ''),
  governance_review_reasons = coalesce(governance_review_reasons, '[]'::jsonb),
  governance_legacy_values = coalesce(governance_legacy_values, '{}'::jsonb)
where true;

update public.legal_entities entity
set
  legal_name = coalesce(entity.legal_name, profile.legal_name, entity.display_name),
  country = coalesce(
    entity.country,
    case
      when profile.country_code ~ '^[A-Z]{2}$'
      then profile.country_code
      else null
    end
  ),
  currency = coalesce(
    entity.currency,
    case
      when profile.functional_currency ~ '^[A-Z]{3}$'
      then profile.functional_currency
      when profile.reporting_currency ~ '^[A-Z]{3}$'
      then profile.reporting_currency
      else null
    end
  ),
  timezone = coalesce(entity.timezone, profile.timezone),
  locale = coalesce(entity.locale, profile.locale)
from public.finance_organization_profiles profile
where profile.organization_id = entity.organization_id;

with ranked_codes as (
  select
    id,
    row_number() over (
      partition by organization_id, lower(code)
      order by
        is_default_accounting_entity desc,
        updated_at desc nulls last,
        created_at asc nulls last,
        id
    ) as position
  from public.legal_entities
  where code is not null
)
update public.legal_entities entity
set
  governance_review_required = true,
  governance_review_reasons = coalesce(entity.governance_review_reasons, '[]'::jsonb) ||
    jsonb_build_array(jsonb_build_object('code', 'DUPLICATE_LEGAL_ENTITY_CODE')),
  governance_legacy_values = coalesce(entity.governance_legacy_values, '{}'::jsonb) ||
    jsonb_build_object('duplicate_code', entity.code),
  code = null
from ranked_codes ranked
where entity.id = ranked.id
  and ranked.position > 1;

with ranked_registration_numbers as (
  select
    id,
    row_number() over (
      partition by organization_id, lower(registration_number)
      order by
        is_default_accounting_entity desc,
        updated_at desc nulls last,
        created_at asc nulls last,
        id
    ) as position
  from public.legal_entities
  where registration_number is not null
)
update public.legal_entities entity
set
  governance_review_required = true,
  governance_review_reasons = coalesce(entity.governance_review_reasons, '[]'::jsonb) ||
    jsonb_build_array(jsonb_build_object('code', 'DUPLICATE_COMPANY_REGISTRATION_NUMBER')),
  governance_legacy_values = coalesce(entity.governance_legacy_values, '{}'::jsonb) ||
    jsonb_build_object('duplicate_registration_number', entity.registration_number),
  registration_number = null
from ranked_registration_numbers ranked
where entity.id = ranked.id
  and ranked.position > 1;

with ranked_tax_ids as (
  select
    id,
    row_number() over (
      partition by organization_id, lower(tax_id)
      order by
        is_default_accounting_entity desc,
        updated_at desc nulls last,
        created_at asc nulls last,
        id
    ) as position
  from public.legal_entities
  where tax_id is not null
)
update public.legal_entities entity
set
  governance_review_required = true,
  governance_review_reasons = coalesce(entity.governance_review_reasons, '[]'::jsonb) ||
    jsonb_build_array(jsonb_build_object('code', 'DUPLICATE_TAX_REGISTRATION')),
  governance_legacy_values = coalesce(entity.governance_legacy_values, '{}'::jsonb) ||
    jsonb_build_object('duplicate_tax_id', entity.tax_id),
  tax_id = null
from ranked_tax_ids ranked
where entity.id = ranked.id
  and ranked.position > 1;

update public.legal_entities
set
  governance_review_required = true,
  governance_review_reasons = coalesce(governance_review_reasons, '[]'::jsonb) ||
    jsonb_build_array(
      jsonb_build_object(
        'code', 'INCOMPLETE_LEGAL_ENTITY_MASTER',
        'missing_fields', to_jsonb(array_remove(array[
          case when code is null then 'code'::text else null end,
          case when legal_name is null then 'legal_name'::text else null end,
          case when country is null then 'country'::text else null end,
          case when currency is null then 'currency'::text else null end
        ], null))
      )
    )
where code is null
   or legal_name is null
   or country is null
   or currency is null;

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
set
  is_default_accounting_entity = false,
  governance_review_required = true,
  governance_review_reasons = coalesce(entity.governance_review_reasons, '[]'::jsonb) ||
    jsonb_build_array(jsonb_build_object('code', 'MULTIPLE_DEFAULT_ACCOUNTING_ENTITIES'))
from ranked_defaults ranked
where entity.id = ranked.id
  and ranked.position > 1;

create unique index if not exists legal_entities_org_code_unique
  on public.legal_entities (organization_id, lower(code))
  where code is not null;

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

create index if not exists legal_entities_governance_review_idx
  on public.legal_entities (organization_id, governance_review_required)
  where governance_review_required = true;

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
  drop constraint if exists legal_entities_default_active_check,
  drop constraint if exists legal_entities_governance_reasons_array_check,
  drop constraint if exists legal_entities_governance_legacy_object_check;

alter table public.legal_entities
  add constraint legal_entities_code_format_check
    check (code is null or code ~ '^[A-Z0-9][A-Z0-9._-]{0,31}$') not valid,
  add constraint legal_entities_country_format_check
    check (country is null or country ~ '^[A-Z]{2}$') not valid,
  add constraint legal_entities_currency_format_check
    check (currency is null or currency ~ '^[A-Z]{3}$') not valid,
  add constraint legal_entities_parent_not_self_check
    check (parent_entity_id is null or parent_entity_id <> id) not valid,
  add constraint legal_entities_default_active_check
    check (not is_default_accounting_entity or is_active) not valid,
  add constraint legal_entities_governance_reasons_array_check
    check (jsonb_typeof(governance_review_reasons) = 'array') not valid,
  add constraint legal_entities_governance_legacy_object_check
    check (jsonb_typeof(governance_legacy_values) = 'object') not valid;

create or replace function public.finance_legal_entity_default_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.code := case
    when upper(nullif(btrim(new.code), '')) ~ '^[A-Z0-9][A-Z0-9._-]{0,31}$'
    then upper(nullif(btrim(new.code), ''))
    else null
  end;
  new.country := case
    when upper(nullif(btrim(new.country), '')) ~ '^[A-Z]{2}$'
    then upper(nullif(btrim(new.country), ''))
    else null
  end;
  new.currency := case
    when upper(nullif(btrim(new.currency), '')) ~ '^[A-Z]{3}$'
    then upper(nullif(btrim(new.currency), ''))
    else null
  end;
  new.legal_name := nullif(btrim(new.legal_name), '');
  new.display_name := nullif(btrim(new.display_name), '');
  new.registration_number := nullif(btrim(new.registration_number), '');
  new.tax_id := nullif(btrim(new.tax_id), '');
  new.address := nullif(btrim(new.address), '');
  new.phone := nullif(btrim(new.phone), '');
  new.email := nullif(lower(btrim(new.email)), '');
  new.timezone := nullif(btrim(new.timezone), '');
  new.locale := nullif(btrim(new.locale), '');
  new.governance_review_reasons := coalesce(new.governance_review_reasons, '[]'::jsonb);
  new.governance_legacy_values := coalesce(new.governance_legacy_values, '{}'::jsonb);
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

comment on column public.legal_entities.governance_review_required is
  'True when legacy legal-entity data requires human completion or duplicate resolution.';

comment on column public.legal_entities.governance_review_reasons is
  'Structured governance issues detected during convergence. No jurisdiction-specific value is invented.';

comment on column public.legal_entities.governance_legacy_values is
  'Original invalid or duplicate values retained for controlled human review.';

notify pgrst, 'reload schema';

commit;
