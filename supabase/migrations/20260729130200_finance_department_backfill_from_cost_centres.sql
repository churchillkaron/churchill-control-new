begin;

-- Backfill canonical operational Departments from the Cost Centres that
-- already exist for each organisation and legal entity. This avoids relying
-- on company-name matching and keeps the values editable master data.

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

with desired as (
  select distinct
    cost_centre.organization_id,
    cost_centre.entity_id,
    upper(btrim(cost_centre.code)) as code,
    case upper(btrim(cost_centre.code))
      when 'KITCHEN' then 'Kitchen'
      when 'BAR' then 'Bar'
      when 'RESTAURANT' then 'Restaurant'
      when 'BREAKFAST' then 'Breakfast'
    end as name,
    case upper(btrim(cost_centre.code))
      when 'KITCHEN' then 'Kitchen operations and production.'
      when 'BAR' then 'Bar operations and beverage service.'
      when 'RESTAURANT' then 'Restaurant floor and dining service.'
      when 'BREAKFAST' then 'Breakfast operations and service.'
    end as description
  from public.cost_centers cost_centre
  where cost_centre.organization_id is not null
    and cost_centre.entity_id is not null
    and upper(btrim(coalesce(cost_centre.code, ''))) in (
      'KITCHEN',
      'BAR',
      'RESTAURANT',
      'BREAKFAST'
    )
),
matching as (
  select
    department.id,
    desired.code,
    desired.name,
    desired.description,
    row_number() over (
      partition by desired.organization_id, desired.entity_id, desired.code
      order by
        case
          when upper(btrim(coalesce(department.code, ''))) = desired.code then 0
          else 1
        end,
        department.created_at asc nulls last,
        department.id
    ) as match_rank
  from desired
  join public.departments department
    on department.organization_id = desired.organization_id
   and department.entity_id = desired.entity_id
   and (
     upper(btrim(coalesce(department.code, ''))) = desired.code
     or lower(btrim(coalesce(department.name, ''))) = lower(desired.name)
   )
)
update public.departments department
set
  code = matching.code,
  name = matching.name,
  description = coalesce(
    nullif(btrim(department.description), ''),
    matching.description
  ),
  status = 'ACTIVE',
  is_active = true,
  updated_at = now()
from matching
where department.id = matching.id
  and matching.match_rank = 1;

with desired as (
  select distinct
    cost_centre.organization_id,
    cost_centre.entity_id,
    upper(btrim(cost_centre.code)) as code,
    case upper(btrim(cost_centre.code))
      when 'KITCHEN' then 'Kitchen'
      when 'BAR' then 'Bar'
      when 'RESTAURANT' then 'Restaurant'
      when 'BREAKFAST' then 'Breakfast'
    end as name,
    case upper(btrim(cost_centre.code))
      when 'KITCHEN' then 'Kitchen operations and production.'
      when 'BAR' then 'Bar operations and beverage service.'
      when 'RESTAURANT' then 'Restaurant floor and dining service.'
      when 'BREAKFAST' then 'Breakfast operations and service.'
    end as description
  from public.cost_centers cost_centre
  where cost_centre.organization_id is not null
    and cost_centre.entity_id is not null
    and upper(btrim(coalesce(cost_centre.code, ''))) in (
      'KITCHEN',
      'BAR',
      'RESTAURANT',
      'BREAKFAST'
    )
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
  desired.organization_id,
  desired.entity_id,
  desired.code,
  desired.name,
  desired.description,
  'ACTIVE',
  true,
  now(),
  now()
from desired
where not exists (
  select 1
  from public.departments existing
  where existing.organization_id = desired.organization_id
    and existing.entity_id = desired.entity_id
    and (
      upper(btrim(coalesce(existing.code, ''))) = desired.code
      or lower(btrim(coalesce(existing.name, ''))) = lower(desired.name)
    )
);

update public.cost_centers cost_centre
set
  department_id = department.id,
  updated_at = now()
from public.departments department
where cost_centre.organization_id = department.organization_id
  and cost_centre.entity_id = department.entity_id
  and upper(btrim(coalesce(cost_centre.code, ''))) in (
    'KITCHEN',
    'BAR',
    'RESTAURANT',
    'BREAKFAST'
  )
  and upper(btrim(coalesce(department.code, ''))) =
      upper(btrim(coalesce(cost_centre.code, '')))
  and coalesce(department.is_active, true)
  and upper(coalesce(department.status, 'ACTIVE')) = 'ACTIVE';

notify pgrst, 'reload schema';

commit;
