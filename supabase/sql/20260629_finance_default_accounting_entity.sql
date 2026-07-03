alter table public.legal_entities
add column if not exists is_default_accounting_entity boolean not null default false;

create unique index if not exists legal_entities_one_default_per_org
on public.legal_entities (organization_id)
where is_default_accounting_entity = true;

with ranked as (
  select
    id,
    row_number() over (
      partition by organization_id
      order by
        is_holding_company desc,
        created_at asc,
        id asc
    ) as rn
  from public.legal_entities
  where is_active = true
)
update public.legal_entities le
set is_default_accounting_entity = true
from ranked r
where le.id = r.id
  and r.rn = 1
  and not exists (
    select 1
    from public.legal_entities existing
    where existing.organization_id = le.organization_id
      and existing.is_default_accounting_entity = true
  );

create or replace function public.get_default_accounting_entity(p_organization_id uuid)
returns public.legal_entities
language sql
stable
as $$
  select *
  from public.legal_entities
  where organization_id = p_organization_id
    and is_active = true
  order by
    is_default_accounting_entity desc,
    is_holding_company desc,
    created_at asc
  limit 1
$$;
