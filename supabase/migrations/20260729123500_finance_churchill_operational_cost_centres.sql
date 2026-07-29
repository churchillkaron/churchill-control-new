begin;

-- Churchill-specific editable master data. This is intentionally data seed only;
-- no restaurant-specific values are introduced into the generic Finance runtime.
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
desired_cost_centres(code, name, type, description) as (
  values
    ('KITCHEN', 'Kitchen', 'OPERATIONAL', 'Kitchen operations and production costs.'),
    ('BAR', 'Bar', 'OPERATIONAL', 'Bar operations and beverage service costs.'),
    ('RESTAURANT', 'Restaurant', 'OPERATIONAL', 'Restaurant floor and dining service costs.'),
    ('BREAKFAST', 'Breakfast', 'OPERATIONAL', 'Breakfast operations and service costs.')
)
insert into public.cost_centers (
  organization_id,
  entity_id,
  code,
  name,
  type,
  description,
  is_active,
  created_at,
  updated_at
)
select
  target.organization_id,
  target.entity_id,
  desired.code,
  desired.name,
  desired.type,
  desired.description,
  true,
  now(),
  now()
from target_entities target
cross join desired_cost_centres desired
where not exists (
  select 1
  from public.cost_centers existing
  where existing.organization_id = target.organization_id
    and existing.entity_id = target.entity_id
    and upper(btrim(existing.code)) = desired.code
);

-- Restore canonical labels and activation without overwriting user descriptions.
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
desired_cost_centres(code, name, type, description) as (
  values
    ('KITCHEN', 'Kitchen', 'OPERATIONAL', 'Kitchen operations and production costs.'),
    ('BAR', 'Bar', 'OPERATIONAL', 'Bar operations and beverage service costs.'),
    ('RESTAURANT', 'Restaurant', 'OPERATIONAL', 'Restaurant floor and dining service costs.'),
    ('BREAKFAST', 'Breakfast', 'OPERATIONAL', 'Breakfast operations and service costs.')
)
update public.cost_centers cost_centre
set
  name = desired.name,
  type = desired.type,
  description = coalesce(
    nullif(btrim(cost_centre.description), ''),
    desired.description
  ),
  is_active = true,
  archived_at = null,
  archived_by = null,
  updated_at = now()
from target_entities target
cross join desired_cost_centres desired
where cost_centre.organization_id = target.organization_id
  and cost_centre.entity_id = target.entity_id
  and upper(btrim(cost_centre.code)) = desired.code;

notify pgrst, 'reload schema';

commit;
