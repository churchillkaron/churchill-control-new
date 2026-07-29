begin;

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid,
  code text,
  name text not null,
  description text,
  status text not null default 'ACTIVE',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.departments
  add column if not exists organization_id uuid,
  add column if not exists entity_id uuid,
  add column if not exists code text,
  add column if not exists name text,
  add column if not exists description text,
  add column if not exists status text default 'ACTIVE',
  add column if not exists is_active boolean default true,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create unique index if not exists departments_org_entity_code_uidx
  on public.departments (organization_id, entity_id, upper(btrim(code)))
  where code is not null and btrim(code) <> '';

with ranked_targets as (
  select
    legal_entity.organization_id,
    legal_entity.id as entity_id,
    row_number() over (
      partition by legal_entity.organization_id
      order by
        coalesce(legal_entity.is_default_accounting_entity, false) desc,
        coalesce(legal_entity.is_holding_company, false) asc,
        legal_entity.created_at asc nulls last,
        legal_entity.id
    ) as target_rank
  from public.legal_entities legal_entity
  where coalesce(legal_entity.is_active, true)
    and (
      lower(coalesce(legal_entity.legal_name, '')) like '%churchill%'
      or lower(coalesce(legal_entity.display_name, '')) like '%churchill%'
      or exists (
        select 1
        from public.finance_organization_profiles profile
        where profile.organization_id = legal_entity.organization_id
          and (
            lower(coalesce(profile.legal_name, '')) like '%churchill%'
            or lower(coalesce(profile.trading_name, '')) like '%churchill%'
          )
      )
    )
),
target_entities as (
  select organization_id, entity_id
  from ranked_targets
  where target_rank = 1
),
desired_departments(code, name, description) as (
  values
    ('KITCHEN', 'Kitchen', 'Kitchen operations and production.'),
    ('BAR', 'Bar', 'Bar operations and beverage service.'),
    ('RESTAURANT', 'Restaurant', 'Restaurant floor and dining service.'),
    ('BREAKFAST', 'Breakfast', 'Breakfast operations and service.'),
    ('ENTERTAINMENT', 'Entertainment', 'Entertainment, events and live performance.'),
    ('OPERATIONS', 'Operations', 'General venue operations and maintenance.'),
    ('ADMIN', 'Admin', 'Administration and office operations.'),
    ('UTILITIES', 'Utilities', 'Utilities and facility services.'),
    ('STAFF_WELFARE', 'Staff Welfare', 'Staff welfare, benefits and support.'),
    ('MARKETING', 'Marketing', 'Marketing, advertising and promotions.'),
    ('OWNER', 'Owner', 'Owner and non-operating activity.')
)
update public.departments department
set
  entity_id = target.entity_id,
  code = coalesce(nullif(btrim(department.code), ''), desired.code),
  name = desired.name,
  description = coalesce(nullif(btrim(department.description), ''), desired.description),
  status = 'ACTIVE',
  is_active = true,
  updated_at = now()
from target_entities target
cross join desired_departments desired
where department.organization_id = target.organization_id
  and (
    upper(btrim(coalesce(department.code, ''))) = desired.code
    or lower(btrim(coalesce(department.name, ''))) = lower(desired.name)
  );

with ranked_targets as (
  select
    legal_entity.organization_id,
    legal_entity.id as entity_id,
    row_number() over (
      partition by legal_entity.organization_id
      order by
        coalesce(legal_entity.is_default_accounting_entity, false) desc,
        coalesce(legal_entity.is_holding_company, false) asc,
        legal_entity.created_at asc nulls last,
        legal_entity.id
    ) as target_rank
  from public.legal_entities legal_entity
  where coalesce(legal_entity.is_active, true)
    and (
      lower(coalesce(legal_entity.legal_name, '')) like '%churchill%'
      or lower(coalesce(legal_entity.display_name, '')) like '%churchill%'
      or exists (
        select 1
        from public.finance_organization_profiles profile
        where profile.organization_id = legal_entity.organization_id
          and (
            lower(coalesce(profile.legal_name, '')) like '%churchill%'
            or lower(coalesce(profile.trading_name, '')) like '%churchill%'
          )
      )
    )
),
target_entities as (
  select organization_id, entity_id
  from ranked_targets
  where target_rank = 1
),
desired_departments(code, name, description) as (
  values
    ('KITCHEN', 'Kitchen', 'Kitchen operations and production.'),
    ('BAR', 'Bar', 'Bar operations and beverage service.'),
    ('RESTAURANT', 'Restaurant', 'Restaurant floor and dining service.'),
    ('BREAKFAST', 'Breakfast', 'Breakfast operations and service.'),
    ('ENTERTAINMENT', 'Entertainment', 'Entertainment, events and live performance.'),
    ('OPERATIONS', 'Operations', 'General venue operations and maintenance.'),
    ('ADMIN', 'Admin', 'Administration and office operations.'),
    ('UTILITIES', 'Utilities', 'Utilities and facility services.'),
    ('STAFF_WELFARE', 'Staff Welfare', 'Staff welfare, benefits and support.'),
    ('MARKETING', 'Marketing', 'Marketing, advertising and promotions.'),
    ('OWNER', 'Owner', 'Owner and non-operating activity.')
)
insert into public.departments (
  organization_id,
  entity_id,
  code,
  name,
  description,
  status,
  is_active,
  created_at,
  updated_at
)
select
  target.organization_id,
  target.entity_id,
  desired.code,
  desired.name,
  desired.description,
  'ACTIVE',
  true,
  now(),
  now()
from target_entities target
cross join desired_departments desired
where not exists (
  select 1
  from public.departments existing
  where existing.organization_id = target.organization_id
    and existing.entity_id = target.entity_id
    and upper(btrim(coalesce(existing.code, ''))) = desired.code
);

update public.cost_centers cost_centre
set
  department_id = department.id,
  updated_at = now()
from public.departments department
where cost_centre.organization_id = department.organization_id
  and cost_centre.entity_id = department.entity_id
  and upper(btrim(cost_centre.code)) in ('KITCHEN', 'BAR', 'RESTAURANT', 'BREAKFAST')
  and upper(btrim(department.code)) = upper(btrim(cost_centre.code));

notify pgrst, 'reload schema';

commit;
