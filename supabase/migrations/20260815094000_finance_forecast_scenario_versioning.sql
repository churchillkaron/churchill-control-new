create table if not exists public.finance_forecast_scenario_versions (
  id uuid primary key default gen_random_uuid(),
  version_number bigint generated always as identity,
  organization_id uuid not null references public.organizations(id),
  entity_id uuid not null references public.legal_entities(id),
  period_id uuid not null references public.accounting_periods(id),
  scenario_kind text not null,
  status text not null default 'DRAFT',
  assumptions jsonb not null,
  result_snapshot jsonb not null,
  forecast_ready boolean not null default false,
  budget_available boolean,
  budget_complete boolean,
  currency_code text,
  source_generated_at timestamptz,
  created_by uuid,
  approved_by uuid,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  superseded_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint finance_forecast_scenario_versions_kind_check
    check (scenario_kind in ('SCENARIOS', 'SCENARIOS_VS_BUDGET')),
  constraint finance_forecast_scenario_versions_status_check
    check (status in ('DRAFT', 'APPROVED', 'SUPERSEDED')),
  constraint finance_forecast_scenario_versions_assumptions_object_check
    check (jsonb_typeof(assumptions) = 'object'),
  constraint finance_forecast_scenario_versions_snapshot_object_check
    check (jsonb_typeof(result_snapshot) = 'object')
);

create index if not exists finance_forecast_scenario_versions_scope_idx
  on public.finance_forecast_scenario_versions (
    organization_id,
    entity_id,
    period_id,
    scenario_kind,
    version_number desc
  );

create unique index if not exists finance_forecast_scenario_versions_one_approved_idx
  on public.finance_forecast_scenario_versions (
    organization_id,
    entity_id,
    period_id,
    scenario_kind
  )
  where status = 'APPROVED';

alter table public.finance_forecast_scenario_versions enable row level security;

revoke all on table public.finance_forecast_scenario_versions from public, anon, authenticated;
grant all on table public.finance_forecast_scenario_versions to service_role;

revoke all on sequence public.finance_forecast_scenario_versions_version_number_seq from public, anon, authenticated;
grant usage, select on sequence public.finance_forecast_scenario_versions_version_number_seq to service_role;

create or replace function public.finance_approve_forecast_scenario_version(
  p_organization_id uuid,
  p_version_id uuid,
  p_approved_by uuid
)
returns setof public.finance_forecast_scenario_versions
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_target public.finance_forecast_scenario_versions%rowtype;
  v_scope_key text;
begin
  select *
  into v_target
  from public.finance_forecast_scenario_versions
  where id = p_version_id
    and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Forecast scenario version not found';
  end if;

  if v_target.status = 'SUPERSEDED' then
    raise exception 'Superseded forecast scenario version cannot be approved';
  end if;

  if v_target.status = 'APPROVED' then
    return query
      select *
      from public.finance_forecast_scenario_versions
      where id = v_target.id;
    return;
  end if;

  v_scope_key := concat_ws(
    ':',
    v_target.organization_id::text,
    v_target.entity_id::text,
    v_target.period_id::text,
    v_target.scenario_kind
  );

  perform pg_advisory_xact_lock(hashtextextended(v_scope_key, 0));

  update public.finance_forecast_scenario_versions
  set status = 'SUPERSEDED',
      superseded_at = now(),
      updated_at = now()
  where organization_id = v_target.organization_id
    and entity_id = v_target.entity_id
    and period_id = v_target.period_id
    and scenario_kind = v_target.scenario_kind
    and status = 'APPROVED'
    and id <> v_target.id;

  update public.finance_forecast_scenario_versions
  set status = 'APPROVED',
      approved_by = p_approved_by,
      approved_at = now(),
      superseded_at = null,
      updated_at = now()
  where id = v_target.id;

  return query
    select *
    from public.finance_forecast_scenario_versions
    where id = v_target.id;
end;
$$;

revoke all on function public.finance_approve_forecast_scenario_version(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.finance_approve_forecast_scenario_version(uuid, uuid, uuid)
  to service_role;
