begin;

alter table public.cost_centers
  add column if not exists department_id uuid,
  add column if not exists manager_user_id uuid,
  add column if not exists description text,
  add column if not exists created_by uuid,
  add column if not exists updated_by uuid,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid,
  add column if not exists legacy_type text,
  add column if not exists legacy_code text;

update public.cost_centers
set
  legacy_type = case
    when nullif(btrim(type), '') is not null
     and upper(btrim(type)) not in (
       'OPERATIONAL',
       'ADMINISTRATIVE',
       'SALES',
       'SERVICE',
       'PROJECT',
       'SHARED_SERVICE',
       'OTHER'
     )
      then coalesce(legacy_type, type)
    else legacy_type
  end,
  type = case
    when nullif(btrim(type), '') is null
      then 'OPERATIONAL'
    when upper(btrim(type)) in (
      'OPERATIONAL',
      'ADMINISTRATIVE',
      'SALES',
      'SERVICE',
      'PROJECT',
      'SHARED_SERVICE',
      'OTHER'
    )
      then upper(btrim(type))
    else 'OTHER'
  end,
  legacy_code = case
    when nullif(btrim(code), '') is null
      or upper(btrim(code)) !~ '^[A-Z0-9][A-Z0-9._/-]{0,31}$'
      then coalesce(legacy_code, code)
    else legacy_code
  end,
  code = case
    when nullif(btrim(code), '') is not null
     and upper(btrim(code)) ~ '^[A-Z0-9][A-Z0-9._/-]{0,31}$'
      then upper(btrim(code))
    else 'CC-' || substr(replace(id::text, '-', ''), 1, 12)
  end,
  name = btrim(name),
  is_active = coalesce(is_active, true),
  updated_at = coalesce(updated_at, now());

with ranked as (
  select
    id,
    row_number() over (
      partition by organization_id, entity_id, upper(code)
      order by created_at nulls last, id
    ) as duplicate_rank
  from public.cost_centers
  where entity_id is not null
)
update public.cost_centers as cost_center
set
  legacy_code = coalesce(cost_center.legacy_code, cost_center.code),
  code = left(cost_center.code, 20)
    || '-'
    || substr(replace(cost_center.id::text, '-', ''), 1, 8),
  updated_at = now()
from ranked
where ranked.id = cost_center.id
  and ranked.duplicate_rank > 1;

alter table public.cost_centers
  drop constraint if exists cost_centers_type_check,
  drop constraint if exists cost_centers_code_format_check,
  drop constraint if exists cost_centers_parent_self_check;

alter table public.cost_centers
  add constraint cost_centers_type_check
    check (
      type in (
        'OPERATIONAL',
        'ADMINISTRATIVE',
        'SALES',
        'SERVICE',
        'PROJECT',
        'SHARED_SERVICE',
        'OTHER'
      )
    ),
  add constraint cost_centers_code_format_check
    check (code ~ '^[A-Z0-9][A-Z0-9._/-]{0,31}$'),
  add constraint cost_centers_parent_self_check
    check (parent_cost_center_id is null or parent_cost_center_id <> id);

create unique index if not exists cost_centers_entity_code_uq
  on public.cost_centers (
    organization_id,
    entity_id,
    upper(code)
  )
  where entity_id is not null;

create index if not exists cost_centers_parent_idx
  on public.cost_centers (
    organization_id,
    entity_id,
    parent_cost_center_id
  );

create index if not exists cost_centers_department_idx
  on public.cost_centers (
    organization_id,
    entity_id,
    department_id
  );

create or replace function public.finance_validate_cost_center()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_parent uuid;
  v_seen uuid[] := array[]::uuid[];
begin
  new.code := upper(btrim(new.code));
  new.name := btrim(new.name);
  new.type := upper(
    coalesce(
      nullif(btrim(new.type), ''),
      'OPERATIONAL'
    )
  );
  new.updated_at := now();

  if new.organization_id is null or new.entity_id is null then
    raise exception
      'Cost Centre requires organization_id and entity_id';
  end if;

  perform 1
  from public.legal_entities
  where id = new.entity_id
    and organization_id = new.organization_id;

  if not found then
    raise exception
      'Cost Centre Legal Entity is outside organisation scope';
  end if;

  if new.parent_cost_center_id is not null then
    select parent_cost_center_id
    into v_parent
    from public.cost_centers
    where id = new.parent_cost_center_id
      and organization_id = new.organization_id
      and entity_id = new.entity_id
      and coalesce(is_active, true);

    if not found then
      raise exception
        'Parent Cost Centre is outside the selected Legal Entity or inactive';
    end if;

    v_seen := array[new.id];

    while v_parent is not null loop
      if v_parent = any(v_seen) then
        raise exception
          'Cost Centre hierarchy cannot contain a cycle';
      end if;

      v_seen := array_append(v_seen, v_parent);

      select parent_cost_center_id
      into v_parent
      from public.cost_centers
      where id = v_parent
        and organization_id = new.organization_id
        and entity_id = new.entity_id;
    end loop;
  end if;

  return new;
end;
$$;

drop trigger if exists finance_cost_center_validate
  on public.cost_centers;

create trigger finance_cost_center_validate
before insert or update on public.cost_centers
for each row
execute function public.finance_validate_cost_center();

create table if not exists public.finance_dimensions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid,
  code text not null,
  name text not null,
  description text,
  scope text not null,
  value_type text not null,
  allow_hierarchy boolean not null default false,
  required_on_posting boolean not null default false,
  effective_from date not null,
  effective_to date,
  is_active boolean not null default true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_dimensions_scope_check
    check (scope in ('ENTITY', 'ORGANISATION')),
  constraint finance_dimensions_value_type_check
    check (
      value_type in (
        'LIST',
        'TEXT',
        'NUMBER',
        'DATE',
        'BOOLEAN'
      )
    ),
  constraint finance_dimensions_scope_entity_check
    check (
      (scope = 'ENTITY' and entity_id is not null)
      or
      (scope = 'ORGANISATION' and entity_id is null)
    ),
  constraint finance_dimensions_effective_dates_check
    check (
      effective_to is null
      or effective_to >= effective_from
    ),
  constraint finance_dimensions_code_format_check
    check (code ~ '^[A-Z0-9][A-Z0-9._/-]{0,31}$')
);

create unique index if not exists finance_dimensions_org_scope_code_uq
  on public.finance_dimensions (
    organization_id,
    coalesce(
      entity_id,
      '00000000-0000-0000-0000-000000000000'::uuid
    ),
    upper(code)
  );

create table if not exists public.finance_dimension_values (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid,
  dimension_id uuid not null,
  code text not null,
  name text not null,
  description text,
  parent_value_id uuid,
  effective_from date not null,
  effective_to date,
  is_active boolean not null default true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_dimension_values_parent_self_check
    check (
      parent_value_id is null
      or parent_value_id <> id
    ),
  constraint finance_dimension_values_effective_dates_check
    check (
      effective_to is null
      or effective_to >= effective_from
    ),
  constraint finance_dimension_values_code_format_check
    check (code ~ '^[A-Z0-9][A-Z0-9._/-]{0,31}$')
);

create unique index if not exists finance_dimension_values_dimension_code_uq
  on public.finance_dimension_values (
    organization_id,
    dimension_id,
    upper(code)
  );

create index if not exists finance_dimension_values_parent_idx
  on public.finance_dimension_values (
    organization_id,
    dimension_id,
    parent_value_id
  );

create or replace function public.finance_normalize_dimension_master()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.code := upper(btrim(new.code));
  new.name := btrim(new.name);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists finance_dimensions_normalize
  on public.finance_dimensions;

create trigger finance_dimensions_normalize
before insert or update on public.finance_dimensions
for each row
execute function public.finance_normalize_dimension_master();

drop trigger if exists finance_dimension_values_normalize
  on public.finance_dimension_values;

create trigger finance_dimension_values_normalize
before insert or update on public.finance_dimension_values
for each row
execute function public.finance_normalize_dimension_master();

comment on column public.cost_centers.legacy_type is
  'Original unsupported Cost Centre type preserved during governance migration.';

comment on column public.cost_centers.legacy_code is
  'Original Cost Centre code preserved when governance migration normalises an invalid or duplicate code.';

comment on table public.finance_dimensions is
  'Governed configurable accounting and reporting dimension definitions.';

comment on table public.finance_dimension_values is
  'Effective-dated controlled values for LIST Finance dimensions.';

notify pgrst, 'reload schema';

commit;
