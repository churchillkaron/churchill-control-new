create table if not exists public.platform_operator_cases (
  id uuid primary key default gen_random_uuid(),
  signal_key text not null unique,
  category text not null,
  organization_id uuid references public.organizations(id) on delete set null,
  source text not null,
  title text not null,
  severity text,
  status text not null default 'OPEN' check (status in ('OPEN','ACKNOWLEDGED','RESOLVED')),
  evidence_version text,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  occurrence_count bigint not null default 0 check (occurrence_count >= 0),
  acknowledged_at timestamptz,
  acknowledged_by_user_id uuid,
  acknowledged_by_staff_id uuid references public.staff_accounts(id) on delete set null,
  resolved_at timestamptz,
  resolved_by_user_id uuid,
  resolved_by_staff_id uuid references public.staff_accounts(id) on delete set null,
  resolution_note text,
  last_evidence jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_platform_operator_cases_status
  on public.platform_operator_cases (status, severity, updated_at desc);
create index if not exists idx_platform_operator_cases_organization
  on public.platform_operator_cases (organization_id, status, updated_at desc);

create table if not exists public.platform_operator_case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.platform_operator_cases(id) on delete cascade,
  signal_key text not null,
  action text not null check (action in ('ACKNOWLEDGE','RESOLVE','REOPEN')),
  from_status text not null,
  to_status text not null,
  actor_user_id uuid,
  actor_staff_id uuid references public.staff_accounts(id) on delete set null,
  note text,
  evidence_version text,
  evidence_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_platform_operator_case_events_case
  on public.platform_operator_case_events (case_id, created_at desc);
create index if not exists idx_platform_operator_case_events_signal
  on public.platform_operator_case_events (signal_key, created_at desc);

alter table public.platform_operator_cases enable row level security;
alter table public.platform_operator_case_events enable row level security;

revoke all on table public.platform_operator_cases from public, anon, authenticated;
revoke all on table public.platform_operator_case_events from public, anon, authenticated;
grant select, insert, update on table public.platform_operator_cases to service_role;
grant select, insert on table public.platform_operator_case_events to service_role;

create index if not exists idx_platform_service_usage_operator_failures_recent
  on public.platform_service_usage (created_at desc, organization_id, provider, capability)
  where
    upper(coalesce(status, '')) in ('FAILED','FAILURE','ERROR','BLOCKED','REJECTED','CANCELLED','CANCELED')
    or upper(coalesce(execution_status, '')) in ('FAILED','FAILURE','ERROR','BLOCKED','REJECTED','CANCELLED','CANCELED');

create or replace function public.platform_operator_usage_failure_groups(
  p_since timestamptz default (now() - interval '24 hours')
) returns table (
  signal_key text,
  organization_id uuid,
  provider text,
  capability text,
  error_message text,
  occurrence_count bigint,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  charged_amount_total numeric,
  supplier_cost_total numeric
)
language sql
stable
security invoker
set search_path = 'public', 'pg_temp'
as $$
  with failures as (
    select
      'usage:' || md5(concat_ws('|',
        coalesce(organization_id::text, ''),
        lower(coalesce(provider, '')),
        lower(coalesce(capability, '')),
        lower(coalesce(error_message, ''))
      )) as signal_key,
      organization_id,
      provider,
      capability,
      error_message,
      created_at,
      charged_amount,
      supplier_cost
    from public.platform_service_usage
    where created_at >= coalesce(p_since, now() - interval '24 hours')
      and (
        upper(coalesce(status, '')) in ('FAILED','FAILURE','ERROR','BLOCKED','REJECTED','CANCELLED','CANCELED')
        or upper(coalesce(execution_status, '')) in ('FAILED','FAILURE','ERROR','BLOCKED','REJECTED','CANCELLED','CANCELED')
      )
  )
  select
    failures.signal_key,
    failures.organization_id,
    failures.provider,
    failures.capability,
    failures.error_message,
    count(*)::bigint as occurrence_count,
    min(failures.created_at) as first_seen_at,
    max(failures.created_at) as last_seen_at,
    coalesce(sum(failures.charged_amount), 0) as charged_amount_total,
    coalesce(sum(failures.supplier_cost), 0) as supplier_cost_total
  from failures
  group by
    failures.signal_key,
    failures.organization_id,
    failures.provider,
    failures.capability,
    failures.error_message
  order by occurrence_count desc, last_seen_at desc;
$$;

revoke all on function public.platform_operator_usage_failure_groups(timestamptz) from public, anon, authenticated;
grant execute on function public.platform_operator_usage_failure_groups(timestamptz) to service_role;

create or replace function public.platform_operator_usage_failure_detail(
  p_signal_key text,
  p_since timestamptz default (now() - interval '24 hours')
) returns jsonb
language sql
stable
security invoker
set search_path = 'public', 'pg_temp'
as $$
  with failures as (
    select
      id,
      organization_id,
      provider,
      capability,
      operation,
      status,
      execution_status,
      error_message,
      created_at,
      latency_ms,
      provider_latency_ms,
      retry_count,
      request_id,
      execution_id,
      provider_request_id,
      provider_response_id,
      provider_model,
      provider_region,
      reserved_amount,
      charged_amount,
      refunded_amount,
      supplier_cost,
      customer_price,
      'usage:' || md5(concat_ws('|',
        coalesce(organization_id::text, ''),
        lower(coalesce(provider, '')),
        lower(coalesce(capability, '')),
        lower(coalesce(error_message, ''))
      )) as signal_key
    from public.platform_service_usage
    where created_at >= coalesce(p_since, now() - interval '24 hours')
      and (
        upper(coalesce(status, '')) in ('FAILED','FAILURE','ERROR','BLOCKED','REJECTED','CANCELLED','CANCELED')
        or upper(coalesce(execution_status, '')) in ('FAILED','FAILURE','ERROR','BLOCKED','REJECTED','CANCELLED','CANCELED')
      )
  ), matching as (
    select * from failures where signal_key = p_signal_key
  ), summary as (
    select
      count(*)::bigint as occurrence_count,
      min(created_at) as first_seen_at,
      max(created_at) as last_seen_at,
      min(organization_id) as organization_id,
      min(provider) as provider,
      min(capability) as capability,
      min(error_message) as error_message,
      coalesce(sum(charged_amount), 0) as charged_amount_total,
      coalesce(sum(supplier_cost), 0) as supplier_cost_total,
      coalesce(sum(reserved_amount), 0) as reserved_amount_total,
      coalesce(sum(refunded_amount), 0) as refunded_amount_total,
      max(retry_count) as max_retry_count,
      avg(provider_latency_ms)::numeric(18,2) as average_provider_latency_ms
    from matching
  ), trend as (
    select
      date_trunc('hour', created_at) as bucket,
      count(*)::bigint as failures
    from matching
    group by date_trunc('hour', created_at)
    order by bucket
  ), recent as (
    select
      id,
      created_at,
      status,
      execution_status,
      operation,
      provider_model,
      provider_region,
      latency_ms,
      provider_latency_ms,
      retry_count,
      request_id,
      execution_id,
      provider_request_id,
      provider_response_id,
      reserved_amount,
      charged_amount,
      supplier_cost,
      customer_price
    from matching
    order by created_at desc
    limit 20
  )
  select jsonb_build_object(
    'signal_key', p_signal_key,
    'summary', (select to_jsonb(summary) from summary),
    'trend', coalesce((select jsonb_agg(to_jsonb(trend) order by trend.bucket) from trend), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(to_jsonb(recent) order by recent.created_at desc) from recent), '[]'::jsonb)
  );
$$;

revoke all on function public.platform_operator_usage_failure_detail(text,timestamptz) from public, anon, authenticated;
grant execute on function public.platform_operator_usage_failure_detail(text,timestamptz) to service_role;

create or replace function public.platform_operator_apply_case_action(
  p_signal_key text,
  p_category text,
  p_organization_id uuid,
  p_source text,
  p_title text,
  p_severity text,
  p_action text,
  p_actor_user_id uuid,
  p_actor_staff_id uuid,
  p_note text default null,
  p_evidence_version text default null,
  p_first_seen_at timestamptz default null,
  p_last_seen_at timestamptz default null,
  p_occurrence_count bigint default 0,
  p_evidence_snapshot jsonb default '{}'::jsonb
) returns public.platform_operator_cases
language plpgsql
security invoker
set search_path = 'public', 'pg_temp'
as $$
declare
  v_case public.platform_operator_cases%rowtype;
  v_action text := upper(trim(coalesce(p_action, '')));
  v_from_status text := 'OPEN';
  v_to_status text;
begin
  if nullif(trim(coalesce(p_signal_key, '')), '') is null then
    raise exception 'PLATFORM_OPERATOR: signal_key is required';
  end if;
  if length(p_signal_key) > 240 then
    raise exception 'PLATFORM_OPERATOR: signal_key is too long';
  end if;
  if v_action not in ('ACKNOWLEDGE','RESOLVE','REOPEN') then
    raise exception 'PLATFORM_OPERATOR: unsupported action %', v_action;
  end if;
  if v_action in ('RESOLVE','REOPEN') and nullif(trim(coalesce(p_note, '')), '') is null then
    raise exception 'PLATFORM_OPERATOR: % requires a note', v_action;
  end if;

  select * into v_case
  from public.platform_operator_cases
  where signal_key = p_signal_key
  for update;

  if found then
    v_from_status := v_case.status;
  end if;

  if v_action = 'RESOLVE' and (v_case.id is null or v_from_status <> 'ACKNOWLEDGED') then
    raise exception 'PLATFORM_OPERATOR: acknowledge the signal before resolving it';
  end if;
  if v_action = 'REOPEN' and (v_case.id is null or v_from_status <> 'RESOLVED') then
    raise exception 'PLATFORM_OPERATOR: only resolved signals can be reopened manually';
  end if;

  v_to_status := case
    when v_action = 'ACKNOWLEDGE' then 'ACKNOWLEDGED'
    when v_action = 'RESOLVE' then 'RESOLVED'
    else 'OPEN'
  end;

  if v_case.id is null then
    insert into public.platform_operator_cases (
      signal_key,
      category,
      organization_id,
      source,
      title,
      severity,
      status,
      evidence_version,
      first_seen_at,
      last_seen_at,
      occurrence_count,
      acknowledged_at,
      acknowledged_by_user_id,
      acknowledged_by_staff_id,
      last_evidence,
      updated_at
    ) values (
      p_signal_key,
      coalesce(nullif(trim(p_category), ''), 'unknown'),
      p_organization_id,
      coalesce(nullif(trim(p_source), ''), 'unknown'),
      coalesce(nullif(trim(p_title), ''), p_signal_key),
      nullif(trim(p_severity), ''),
      v_to_status,
      p_evidence_version,
      p_first_seen_at,
      p_last_seen_at,
      greatest(coalesce(p_occurrence_count, 0), 0),
      case when v_action = 'ACKNOWLEDGE' then now() else null end,
      case when v_action = 'ACKNOWLEDGE' then p_actor_user_id else null end,
      case when v_action = 'ACKNOWLEDGE' then p_actor_staff_id else null end,
      coalesce(p_evidence_snapshot, '{}'::jsonb),
      now()
    ) returning * into v_case;
  else
    update public.platform_operator_cases
    set
      category = coalesce(nullif(trim(p_category), ''), category),
      organization_id = coalesce(p_organization_id, organization_id),
      source = coalesce(nullif(trim(p_source), ''), source),
      title = coalesce(nullif(trim(p_title), ''), title),
      severity = coalesce(nullif(trim(p_severity), ''), severity),
      status = v_to_status,
      evidence_version = coalesce(p_evidence_version, evidence_version),
      first_seen_at = coalesce(least(first_seen_at, p_first_seen_at), first_seen_at, p_first_seen_at),
      last_seen_at = coalesce(greatest(last_seen_at, p_last_seen_at), last_seen_at, p_last_seen_at),
      occurrence_count = greatest(occurrence_count, coalesce(p_occurrence_count, 0)),
      acknowledged_at = case
        when v_action = 'ACKNOWLEDGE' then now()
        when v_action = 'REOPEN' then null
        else acknowledged_at
      end,
      acknowledged_by_user_id = case
        when v_action = 'ACKNOWLEDGE' then p_actor_user_id
        when v_action = 'REOPEN' then null
        else acknowledged_by_user_id
      end,
      acknowledged_by_staff_id = case
        when v_action = 'ACKNOWLEDGE' then p_actor_staff_id
        when v_action = 'REOPEN' then null
        else acknowledged_by_staff_id
      end,
      resolved_at = case when v_action = 'RESOLVE' then now() else null end,
      resolved_by_user_id = case when v_action = 'RESOLVE' then p_actor_user_id else null end,
      resolved_by_staff_id = case when v_action = 'RESOLVE' then p_actor_staff_id else null end,
      resolution_note = case when v_action = 'RESOLVE' then trim(p_note) else null end,
      last_evidence = coalesce(p_evidence_snapshot, last_evidence),
      updated_at = now()
    where id = v_case.id
    returning * into v_case;
  end if;

  insert into public.platform_operator_case_events (
    case_id,
    signal_key,
    action,
    from_status,
    to_status,
    actor_user_id,
    actor_staff_id,
    note,
    evidence_version,
    evidence_snapshot
  ) values (
    v_case.id,
    p_signal_key,
    v_action,
    v_from_status,
    v_to_status,
    p_actor_user_id,
    p_actor_staff_id,
    nullif(trim(coalesce(p_note, '')), ''),
    p_evidence_version,
    coalesce(p_evidence_snapshot, '{}'::jsonb)
  );

  return v_case;
end;
$$;

revoke all on function public.platform_operator_apply_case_action(text,text,uuid,text,text,text,text,uuid,uuid,text,text,timestamptz,timestamptz,bigint,jsonb) from public, anon, authenticated;
grant execute on function public.platform_operator_apply_case_action(text,text,uuid,text,text,text,text,uuid,uuid,text,text,timestamptz,timestamptz,bigint,jsonb) to service_role;
